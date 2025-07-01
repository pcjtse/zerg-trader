import { EventEmitter } from 'events';
import { Portfolio, Position, Trade, Signal, RiskMetrics } from '../types';
import { RiskManager } from '../risk/RiskManager';
import { v4 as uuidv4 } from 'uuid';

export interface PortfolioConfig {
  initialCash: number;
  rebalanceFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  maxPositions: number;
  minTradeSize: number;
  transactionCosts: {
    commission: number; // Fixed commission per trade
    spreadCost: number; // Percentage cost for spread
    slippage: number; // Percentage for slippage
  };
  brokerConfig?: {
    alpacaApiKey?: string;
    alpacaSecretKey?: string;
    alpacaBaseUrl?: string;
    enableLiveTrading?: boolean;
  };
}

export interface RebalanceStrategy {
  name: string;
  targetWeights: Map<string, number>; // symbol -> target weight
  toleranceBands: Map<string, number>; // symbol -> tolerance percentage
}

export class PortfolioManager extends EventEmitter {
  private portfolio: Portfolio;
  private config: PortfolioConfig;
  private riskManager: RiskManager;
  private pendingTrades: Map<string, Trade> = new Map();
  private tradeHistory: Trade[] = [];
  private rebalanceStrategies: Map<string, RebalanceStrategy> = new Map();
  private performanceMetrics: {
    totalReturn: number;
    dailyReturns: number[];
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
  };

  constructor(config: PortfolioConfig, riskManager: RiskManager) {
    super();
    this.config = config;
    this.riskManager = riskManager;
    
    // Initialize portfolio
    this.portfolio = {
      id: uuidv4(),
      cash: config.initialCash,
      positions: [],
      total_value: config.initialCash,
      daily_pnl: 0,
      total_pnl: 0,
      timestamp: new Date()
    };

    this.performanceMetrics = {
      totalReturn: 0,
      dailyReturns: [],
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0
    };

    // Set up risk manager integration
    this.riskManager.on('stopLossTriggered', this.handleStopLoss.bind(this));
    this.riskManager.on('riskAlert', this.handleRiskAlert.bind(this));
  }

  public processSignal(signal: Signal): {
    trade?: Trade;
    reason?: string;
    approved: boolean;
  } {
    // Evaluate signal through risk manager
    const riskEvaluation = this.riskManager.evaluateSignal(signal, this.portfolio);
    
    if (!riskEvaluation.approved) {
      return {
        approved: false,
        reason: riskEvaluation.reason
      };
    }

    // Calculate trade parameters
    const trade = this.createTradeFromSignal(signal, riskEvaluation.adjustedQuantity);
    
    if (!trade) {
      return {
        approved: false,
        reason: 'Failed to create valid trade from signal'
      };
    }

    // Final trade evaluation through risk manager
    const tradeEvaluation = this.riskManager.evaluateTrade(trade);
    
    if (!tradeEvaluation.approved) {
      return {
        approved: false,
        reason: tradeEvaluation.reason
      };
    }

    // Add stop loss and take profit orders
    if (tradeEvaluation.stopLossPrice) {
      trade.metadata = trade.metadata || {};
      trade.metadata.stopLossPrice = tradeEvaluation.stopLossPrice;
    }
    
    if (tradeEvaluation.takeProfitPrice) {
      trade.metadata = trade.metadata || {};
      trade.metadata.takeProfitPrice = tradeEvaluation.takeProfitPrice;
    }

    return {
      trade,
      approved: true
    };
  }

  public executeTrade(trade: Trade): {
    success: boolean;
    executedTrade?: Trade;
    error?: string;
  } {
    try {
      // Calculate transaction costs
      const costs = this.calculateTransactionCosts(trade);
      
      // Check if we have enough cash for buy orders
      if (trade.action === 'BUY') {
        const totalCost = trade.quantity * trade.price + costs.totalCost;
        if (this.portfolio.cash < totalCost) {
          return {
            success: false,
            error: `Insufficient cash: need $${totalCost.toFixed(2)}, available $${this.portfolio.cash.toFixed(2)}`
          };
        }
      }

      // Execute the trade
      const executedTrade = this.performTrade(trade, costs);
      
      // Update portfolio
      this.updatePortfolioFromTrade(executedTrade, costs);
      
      // Add to trade history
      this.tradeHistory.push(executedTrade);
      
      // Remove from pending trades if it was pending
      this.pendingTrades.delete(trade.id);
      
      // Update risk manager with new portfolio state
      this.riskManager.updatePortfolio(this.portfolio);
      
      // Emit events
      this.emit('tradeExecuted', executedTrade);
      this.emit('portfolioUpdated', this.portfolio);
      
      return {
        success: true,
        executedTrade
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown execution error'
      };
    }
  }

  public updateMarketPrices(prices: Map<string, number>): void {
    let totalValue = this.portfolio.cash;
    let dailyPnL = 0;
    
    for (const position of this.portfolio.positions) {
      const newPrice = prices.get(position.symbol);
      if (newPrice !== undefined) {
        const oldValue = position.quantity * position.current_price;
        position.current_price = newPrice;
        const newValue = position.quantity * newPrice;
        
        // Update unrealized P&L
        position.unrealized_pnl = (newPrice - position.entry_price) * position.quantity;
        
        // Update daily P&L (simplified - assumes previous price was yesterday's close)
        dailyPnL += newValue - oldValue;
        
        totalValue += newValue;
      } else {
        totalValue += position.quantity * position.current_price;
      }
    }
    
    this.portfolio.total_value = totalValue;
    this.portfolio.daily_pnl = dailyPnL;
    this.portfolio.timestamp = new Date();
    
    // Update performance metrics
    this.updatePerformanceMetrics();
    
    // Update risk manager
    this.riskManager.updatePortfolio(this.portfolio);
    
    this.emit('portfolioUpdated', this.portfolio);
  }

  public rebalancePortfolio(strategyName?: string): {
    success: boolean;
    trades?: Trade[];
    error?: string;
  } {
    try {
      const strategy = strategyName ? 
        this.rebalanceStrategies.get(strategyName) : 
        this.getDefaultRebalanceStrategy();
      
      if (!strategy) {
        return {
          success: false,
          error: 'No rebalance strategy found'
        };
      }

      const rebalanceTrades = this.calculateRebalanceTrades(strategy);
      
      if (rebalanceTrades.length === 0) {
        return {
          success: true,
          trades: []
        };
      }

      // Execute rebalance trades
      const executedTrades: Trade[] = [];
      for (const trade of rebalanceTrades) {
        const result = this.executeTrade(trade);
        if (result.success && result.executedTrade) {
          executedTrades.push(result.executedTrade);
        }
      }

      this.emit('portfolioRebalanced', {
        strategy: strategyName,
        trades: executedTrades
      });

      return {
        success: true,
        trades: executedTrades
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Rebalance failed'
      };
    }
  }

  public getPortfolio(): Portfolio {
    return { ...this.portfolio };
  }

  public getPositions(): Position[] {
    return [...this.portfolio.positions];
  }

  public getPosition(symbol: string): Position | undefined {
    return this.portfolio.positions.find(p => p.symbol === symbol);
  }

  public getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  public getTradeHistory(limit?: number): Trade[] {
    return limit ? this.tradeHistory.slice(-limit) : [...this.tradeHistory];
  }

  public addRebalanceStrategy(strategy: RebalanceStrategy): void {
    this.rebalanceStrategies.set(strategy.name, strategy);
  }

  private createTradeFromSignal(signal: Signal, adjustedQuantity?: number): Trade | null {
    const currentPosition = this.portfolio.positions.find(p => p.symbol === signal.symbol);
    const currentPrice = currentPosition?.current_price || 100; // Default price if no position
    
    let quantity: number;
    let action: 'BUY' | 'SELL';

    if (signal.action === 'BUY') {
      action = 'BUY';
      // Calculate quantity based on available cash and position sizing
      const maxInvestment = adjustedQuantity ? 
        adjustedQuantity * currentPrice : 
        this.portfolio.total_value * 0.1; // Default 10% position size
      
      quantity = Math.floor(Math.min(maxInvestment, this.portfolio.cash * 0.95) / currentPrice);
    } else if (signal.action === 'SELL') {
      action = 'SELL';
      // Sell existing position or create short position
      quantity = currentPosition ? Math.abs(currentPosition.quantity) : 0;
      
      if (quantity === 0) {
        return null; // No position to sell
      }
    } else {
      return null; // HOLD signals don't generate trades
    }

    if (quantity <= 0 || quantity * currentPrice < this.config.minTradeSize) {
      return null;
    }

    return {
      id: uuidv4(),
      symbol: signal.symbol,
      action,
      quantity,
      price: currentPrice,
      timestamp: new Date(),
      status: 'PENDING',
      agent_signals: [signal.id],
      metadata: {
        signal_confidence: signal.confidence,
        signal_strength: signal.strength,
        signal_reasoning: signal.reasoning
      }
    };
  }

  private calculateTransactionCosts(trade: Trade): {
    commission: number;
    spreadCost: number;
    slippageCost: number;
    totalCost: number;
  } {
    const tradeValue = trade.quantity * trade.price;
    
    const commission = this.config.transactionCosts.commission;
    const spreadCost = tradeValue * this.config.transactionCosts.spreadCost;
    const slippageCost = tradeValue * this.config.transactionCosts.slippage;
    
    return {
      commission,
      spreadCost,
      slippageCost,
      totalCost: commission + spreadCost + slippageCost
    };
  }

  private performTrade(trade: Trade, costs: any): Trade {
    const executedTrade: Trade = {
      ...trade,
      status: 'FILLED',
      timestamp: new Date(),
      metadata: {
        ...trade.metadata,
        transaction_costs: costs
      }
    };

    return executedTrade;
  }

  private updatePortfolioFromTrade(trade: Trade, costs: any): void {
    const existingPositionIndex = this.portfolio.positions.findIndex(p => p.symbol === trade.symbol);
    
    if (trade.action === 'BUY') {
      // Deduct cash
      this.portfolio.cash -= (trade.quantity * trade.price + costs.totalCost);
      
      if (existingPositionIndex >= 0) {
        // Add to existing position
        const position = this.portfolio.positions[existingPositionIndex];
        const totalCost = position.quantity * position.entry_price + trade.quantity * trade.price;
        const totalQuantity = position.quantity + trade.quantity;
        
        position.entry_price = totalCost / totalQuantity;
        position.quantity = totalQuantity;
        position.current_price = trade.price;
        position.unrealized_pnl = (trade.price - position.entry_price) * totalQuantity;
        position.timestamp = new Date();
      } else {
        // Create new position
        const newPosition: Position = {
          symbol: trade.symbol,
          quantity: trade.quantity,
          entry_price: trade.price,
          current_price: trade.price,
          unrealized_pnl: 0,
          realized_pnl: 0,
          timestamp: new Date()
        };
        this.portfolio.positions.push(newPosition);
      }
    } else if (trade.action === 'SELL') {
      // Add cash
      this.portfolio.cash += (trade.quantity * trade.price - costs.totalCost);
      
      if (existingPositionIndex >= 0) {
        const position = this.portfolio.positions[existingPositionIndex];
        
        // Calculate realized P&L
        const realizedPnL = (trade.price - position.entry_price) * trade.quantity;
        position.realized_pnl += realizedPnL;
        this.portfolio.total_pnl += realizedPnL;
        
        // Update position
        if (position.quantity === trade.quantity) {
          // Close position completely
          this.portfolio.positions.splice(existingPositionIndex, 1);
        } else {
          // Partial close
          position.quantity -= trade.quantity;
          position.current_price = trade.price;
          position.unrealized_pnl = (trade.price - position.entry_price) * position.quantity;
          position.timestamp = new Date();
        }
      }
    }

    // Update total portfolio value
    this.updatePortfolioValue();
  }

  private updatePortfolioValue(): void {
    let totalValue = this.portfolio.cash;
    
    for (const position of this.portfolio.positions) {
      totalValue += position.quantity * position.current_price;
    }
    
    this.portfolio.total_value = totalValue;
    this.portfolio.timestamp = new Date();
  }

  private updatePerformanceMetrics(): void {
    const initialValue = this.config.initialCash;
    this.performanceMetrics.totalReturn = (this.portfolio.total_value - initialValue) / initialValue;
    
    // Update daily returns (simplified)
    if (this.performanceMetrics.dailyReturns.length === 0) {
      this.performanceMetrics.dailyReturns.push(0);
    } else {
      const lastValue = this.performanceMetrics.dailyReturns.length > 1 ? 
        initialValue * (1 + this.performanceMetrics.totalReturn) : initialValue;
      const dailyReturn = (this.portfolio.total_value - lastValue) / lastValue;
      this.performanceMetrics.dailyReturns.push(dailyReturn);
    }
    
    // Calculate other metrics
    this.performanceMetrics.maxDrawdown = this.calculateMaxDrawdown();
    this.performanceMetrics.winRate = this.calculateWinRate();
    this.performanceMetrics.profitFactor = this.calculateProfitFactor();
    this.performanceMetrics.sharpeRatio = this.calculateSharpeRatio();
  }

  private calculateMaxDrawdown(): number {
    const returns = this.performanceMetrics.dailyReturns;
    if (returns.length < 2) return 0;
    
    let maxDrawdown = 0;
    let peak = 0;
    let cumulativeReturn = 0;
    
    for (const dailyReturn of returns) {
      cumulativeReturn = (1 + cumulativeReturn) * (1 + dailyReturn) - 1;
      peak = Math.max(peak, cumulativeReturn);
      const drawdown = (peak - cumulativeReturn) / (1 + peak);
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateWinRate(): number {
    const completedTrades = this.tradeHistory.filter(t => t.status === 'FILLED');
    if (completedTrades.length === 0) return 0;
    
    const profitableTrades = completedTrades.filter(trade => {
      const position = this.portfolio.positions.find(p => p.symbol === trade.symbol);
      return position && position.realized_pnl > 0;
    });
    
    return profitableTrades.length / completedTrades.length;
  }

  private calculateProfitFactor(): number {
    let totalProfit = 0;
    let totalLoss = 0;
    
    for (const position of this.portfolio.positions) {
      if (position.realized_pnl > 0) {
        totalProfit += position.realized_pnl;
      } else {
        totalLoss += Math.abs(position.realized_pnl);
      }
    }
    
    return totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
  }

  private calculateSharpeRatio(): number {
    const returns = this.performanceMetrics.dailyReturns;
    if (returns.length < 2) return 0;
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const riskFreeRate = 0.02 / 252; // 2% annual risk-free rate, daily
    const excessReturn = avgReturn - riskFreeRate;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    return volatility > 0 ? excessReturn / volatility : 0;
  }

  private calculateRebalanceTrades(strategy: RebalanceStrategy): Trade[] {
    const trades: Trade[] = [];
    const currentWeights = this.getCurrentWeights();
    
    for (const [symbol, targetWeight] of strategy.targetWeights) {
      const currentWeight = currentWeights.get(symbol) || 0;
      const tolerance = strategy.toleranceBands.get(symbol) || 0.05; // 5% default tolerance
      
      const weightDifference = targetWeight - currentWeight;
      
      if (Math.abs(weightDifference) > tolerance) {
        const targetValue = this.portfolio.total_value * targetWeight;
        const currentValue = this.portfolio.total_value * currentWeight;
        const tradeDollarAmount = targetValue - currentValue;
        
        const currentPrice = this.getCurrentPrice(symbol);
        const quantity = Math.abs(Math.floor(tradeDollarAmount / currentPrice));
        
        if (quantity > 0 && quantity * currentPrice >= this.config.minTradeSize) {
          const trade: Trade = {
            id: uuidv4(),
            symbol,
            action: tradeDollarAmount > 0 ? 'BUY' : 'SELL',
            quantity,
            price: currentPrice,
            timestamp: new Date(),
            status: 'PENDING',
            agent_signals: [],
            metadata: {
              rebalance_trade: true,
              target_weight: targetWeight,
              current_weight: currentWeight,
              weight_difference: weightDifference
            }
          };
          
          trades.push(trade);
        }
      }
    }
    
    return trades;
  }

  private getCurrentWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    
    for (const position of this.portfolio.positions) {
      const positionValue = position.quantity * position.current_price;
      const weight = positionValue / this.portfolio.total_value;
      weights.set(position.symbol, weight);
    }
    
    return weights;
  }

  private getCurrentPrice(symbol: string): number {
    const position = this.portfolio.positions.find(p => p.symbol === symbol);
    return position ? position.current_price : 100; // Default price
  }

  private getDefaultRebalanceStrategy(): RebalanceStrategy | null {
    // Return equal weight strategy for all current positions
    if (this.portfolio.positions.length === 0) return null;
    
    const equalWeight = 1 / this.portfolio.positions.length;
    const targetWeights = new Map<string, number>();
    const toleranceBands = new Map<string, number>();
    
    for (const position of this.portfolio.positions) {
      targetWeights.set(position.symbol, equalWeight);
      toleranceBands.set(position.symbol, 0.05); // 5% tolerance
    }
    
    return {
      name: 'equal_weight',
      targetWeights,
      toleranceBands
    };
  }

  private handleStopLoss(data: { position: Position; drawdown?: number; loss?: number }): void {
    const { position } = data;
    
    // Create stop loss trade
    const stopLossTrade: Trade = {
      id: uuidv4(),
      symbol: position.symbol,
      action: 'SELL',
      quantity: Math.abs(position.quantity),
      price: position.current_price,
      timestamp: new Date(),
      status: 'PENDING',
      agent_signals: [],
      metadata: {
        stop_loss_trade: true,
        trigger_price: position.current_price,
        drawdown: data.drawdown,
        loss: data.loss
      }
    };
    
    // Execute stop loss immediately
    const result = this.executeTrade(stopLossTrade);
    
    this.emit('stopLossExecuted', {
      position,
      trade: result.executedTrade,
      success: result.success
    });
  }

  private handleRiskAlert(alert: any): void {
    this.emit('riskAlert', alert);
    
    // Take automated actions based on alert severity
    if (alert.severity === 'CRITICAL') {
      this.emit('emergencyStop', alert);
    }
  }
}