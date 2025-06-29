import { EventEmitter } from 'events';
import { Signal, Position, Portfolio, Trade, RiskMetrics } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface RiskConstraints {
  maxPositionSize: number; // Percentage of portfolio
  maxDailyLoss: number; // Percentage of portfolio
  maxDrawdown: number; // Percentage of portfolio
  stopLossPercentage: number; // Percentage from entry price
  maxLeverage: number;
  maxConcentrationPerSector: number; // Percentage of portfolio
  maxConcentrationPerSymbol: number; // Percentage of portfolio
  minCashReserve: number; // Percentage of portfolio
}

export interface RiskAlert {
  id: string;
  type: 'POSITION_SIZE' | 'DAILY_LOSS' | 'DRAWDOWN' | 'CONCENTRATION' | 'MARGIN_CALL' | 'STOP_LOSS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  symbol?: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export class RiskManager extends EventEmitter {
  private constraints: RiskConstraints;
  private portfolio: Portfolio;
  private activeAlerts: Map<string, RiskAlert> = new Map();
  private riskMetrics: RiskMetrics;
  private historicalPortfolioValues: Array<{ timestamp: Date; value: number }> = [];
  private dailyPnLHistory: Array<{ date: string; pnl: number }> = [];

  constructor(constraints: RiskConstraints, initialPortfolio: Portfolio) {
    super();
    this.constraints = constraints;
    this.portfolio = initialPortfolio;
    this.riskMetrics = this.calculateRiskMetrics();
    
    // Initialize historical data
    this.historicalPortfolioValues.push({
      timestamp: new Date(),
      value: initialPortfolio.total_value
    });
  }

  public evaluateSignal(signal: Signal, currentPortfolio: Portfolio): {
    approved: boolean;
    adjustedQuantity?: number;
    reason?: string;
    riskScore: number;
  } {
    this.portfolio = currentPortfolio;
    
    const riskScore = this.calculateSignalRiskScore(signal);
    
    // Check basic risk constraints
    const basicCheck = this.performBasicRiskChecks(signal);
    if (!basicCheck.approved) {
      return {
        approved: false,
        reason: basicCheck.reason,
        riskScore
      };
    }

    // Calculate position size based on risk management
    const positionSize = this.calculateOptimalPositionSize(signal);
    if (positionSize <= 0) {
      return {
        approved: false,
        reason: 'Calculated position size is zero or negative',
        riskScore
      };
    }

    // Check if adjusted position size is significantly different
    const maxPositionValue = this.portfolio.total_value * this.constraints.maxPositionSize;
    const adjustedQuantity = Math.floor(maxPositionValue / this.getCurrentPrice(signal.symbol));
    
    return {
      approved: true,
      adjustedQuantity,
      riskScore
    };
  }

  public evaluateTrade(trade: Trade): {
    approved: boolean;
    reason?: string;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  } {
    // Check if trade would violate risk constraints
    const position = this.portfolio.positions.find(p => p.symbol === trade.symbol);
    const tradeValue = trade.quantity * trade.price;
    
    // Position size check
    if (tradeValue > this.portfolio.total_value * this.constraints.maxPositionSize) {
      return {
        approved: false,
        reason: `Trade size ${(tradeValue / this.portfolio.total_value * 100).toFixed(1)}% exceeds maximum position size ${(this.constraints.maxPositionSize * 100).toFixed(1)}%`
      };
    }

    // Cash reserve check for buy orders
    if (trade.action === 'BUY' && this.portfolio.cash - tradeValue < this.portfolio.total_value * this.constraints.minCashReserve) {
      return {
        approved: false,
        reason: 'Insufficient cash reserves after trade execution'
      };
    }

    // Calculate stop loss and take profit levels
    const stopLossPrice = this.calculateStopLossPrice(trade);
    const takeProfitPrice = this.calculateTakeProfitPrice(trade);

    return {
      approved: true,
      stopLossPrice,
      takeProfitPrice
    };
  }

  public updatePortfolio(portfolio: Portfolio): void {
    this.portfolio = portfolio;
    
    // Update historical data
    this.historicalPortfolioValues.push({
      timestamp: new Date(),
      value: portfolio.total_value
    });
    
    // Maintain history size (keep last 252 trading days)
    if (this.historicalPortfolioValues.length > 252) {
      this.historicalPortfolioValues.shift();
    }

    // Update daily P&L
    this.updateDailyPnL(portfolio);
    
    // Recalculate risk metrics
    this.riskMetrics = this.calculateRiskMetrics();
    
    // Check for risk violations
    this.checkRiskViolations();
  }

  public getRiskMetrics(): RiskMetrics {
    return { ...this.riskMetrics };
  }

  public getActiveAlerts(): RiskAlert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  public resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
    }
  }

  private performBasicRiskChecks(signal: Signal): { approved: boolean; reason?: string } {
    // Check daily loss limit
    const currentDailyPnL = this.portfolio.daily_pnl / this.portfolio.total_value;
    if (currentDailyPnL <= -this.constraints.maxDailyLoss) {
      return {
        approved: false,
        reason: `Daily loss limit exceeded: ${(currentDailyPnL * 100).toFixed(2)}%`
      };
    }

    // Check maximum drawdown
    if (this.riskMetrics.max_drawdown >= this.constraints.maxDrawdown) {
      return {
        approved: false,
        reason: `Maximum drawdown limit exceeded: ${(this.riskMetrics.max_drawdown * 100).toFixed(2)}%`
      };
    }

    // Check concentration limits
    const concentrationCheck = this.checkConcentrationLimits(signal);
    if (!concentrationCheck.approved) {
      return concentrationCheck;
    }

    return { approved: true };
  }

  private checkConcentrationLimits(signal: Signal): { approved: boolean; reason?: string } {
    // Check symbol concentration
    const existingPosition = this.portfolio.positions.find(p => p.symbol === signal.symbol);
    const currentSymbolValue = existingPosition ? Math.abs(existingPosition.quantity * existingPosition.current_price) : 0;
    const symbolConcentration = currentSymbolValue / this.portfolio.total_value;
    
    if (symbolConcentration >= this.constraints.maxConcentrationPerSymbol) {
      return {
        approved: false,
        reason: `Symbol concentration limit exceeded: ${(symbolConcentration * 100).toFixed(1)}%`
      };
    }

    // Check sector concentration (simplified - would need sector mapping in production)
    const sectorConcentration = this.calculateSectorConcentration(signal.symbol);
    if (sectorConcentration >= this.constraints.maxConcentrationPerSector) {
      return {
        approved: false,
        reason: `Sector concentration limit exceeded: ${(sectorConcentration * 100).toFixed(1)}%`
      };
    }

    return { approved: true };
  }

  private calculateOptimalPositionSize(signal: Signal): number {
    // Kelly Criterion-inspired position sizing
    const winRate = this.estimateWinRate(signal);
    const avgWin = this.estimateAverageWin(signal);
    const avgLoss = this.estimateAverageLoss(signal);
    
    if (avgLoss <= 0) return 0;
    
    // Kelly fraction: f = (bp - q) / b
    // where b = odds received (avgWin/avgLoss), p = win probability, q = loss probability
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - winRate;
    
    let kellyFraction = (b * p - q) / b;
    
    // Cap Kelly fraction for safety (never risk more than 25% of portfolio on single trade)
    kellyFraction = Math.max(0, Math.min(kellyFraction, 0.25));
    
    // Adjust based on signal strength and confidence
    const signalAdjustment = signal.confidence * signal.strength;
    const adjustedFraction = kellyFraction * signalAdjustment;
    
    // Apply position size limit
    const maxFraction = this.constraints.maxPositionSize;
    const finalFraction = Math.min(adjustedFraction, maxFraction);
    
    return finalFraction;
  }

  private calculateSignalRiskScore(signal: Signal): number {
    let riskScore = 0;
    
    // Base risk from signal uncertainty
    riskScore += (1 - signal.confidence) * 30;
    riskScore += (1 - signal.strength) * 20;
    
    // Concentration risk
    const symbolConcentration = this.calculateSymbolConcentration(signal.symbol);
    riskScore += symbolConcentration * 25;
    
    // Market volatility risk (simplified)
    const marketVolatility = this.estimateMarketVolatility();
    riskScore += marketVolatility * 15;
    
    // Portfolio drawdown risk
    riskScore += this.riskMetrics.max_drawdown * 20;
    
    return Math.min(100, Math.max(0, riskScore));
  }

  private calculateRiskMetrics(): RiskMetrics {
    if (this.historicalPortfolioValues.length < 2) {
      return {
        portfolio_var: 0,
        max_drawdown: 0,
        sharpe_ratio: 0,
        sortino_ratio: 0,
        beta: 0,
        alpha: 0
      };
    }

    const returns = this.calculatePortfolioReturns();
    const var95 = this.calculateVaR(returns, 0.05);
    const maxDrawdown = this.calculateMaxDrawdown();
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);
    
    return {
      portfolio_var: var95,
      max_drawdown: maxDrawdown,
      sharpe_ratio: sharpeRatio,
      sortino_ratio: sortinoRatio,
      beta: 0, // Would need market data for beta calculation
      alpha: 0 // Would need benchmark data for alpha calculation
    };
  }

  private calculatePortfolioReturns(): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < this.historicalPortfolioValues.length; i++) {
      const currentValue = this.historicalPortfolioValues[i].value;
      const previousValue = this.historicalPortfolioValues[i - 1].value;
      const returnPct = (currentValue - previousValue) / previousValue;
      returns.push(returnPct);
    }
    
    return returns;
  }

  private calculateVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    
    return Math.abs(sortedReturns[index] || 0);
  }

  private calculateMaxDrawdown(): number {
    if (this.historicalPortfolioValues.length < 2) return 0;
    
    let maxDrawdown = 0;
    let peak = this.historicalPortfolioValues[0].value;
    
    for (const point of this.historicalPortfolioValues) {
      if (point.value > peak) {
        peak = point.value;
      }
      
      const drawdown = (peak - point.value) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const riskFreeRate = 0.02 / 252; // 2% annual risk-free rate, daily
    const excessReturn = meanReturn - riskFreeRate;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    return volatility > 0 ? excessReturn / volatility : 0;
  }

  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const riskFreeRate = 0.02 / 252; // 2% annual risk-free rate, daily
    const excessReturn = meanReturn - riskFreeRate;
    
    const negativeReturns = returns.filter(r => r < 0);
    if (negativeReturns.length === 0) return excessReturn > 0 ? Infinity : 0;
    
    const downwardVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
    const downwardVolatility = Math.sqrt(downwardVariance);
    
    return downwardVolatility > 0 ? excessReturn / downwardVolatility : 0;
  }

  private checkRiskViolations(): void {
    // Check daily loss limit
    const dailyLossAlert = this.checkDailyLossLimit();
    if (dailyLossAlert) this.raiseAlert(dailyLossAlert);
    
    // Check drawdown limit
    const drawdownAlert = this.checkDrawdownLimit();
    if (drawdownAlert) this.raiseAlert(drawdownAlert);
    
    // Check position concentration
    this.checkPositionConcentration();
    
    // Check stop loss triggers
    this.checkStopLossTriggers();
  }

  private checkDailyLossLimit(): RiskAlert | null {
    const dailyLossPct = this.portfolio.daily_pnl / this.portfolio.total_value;
    
    if (dailyLossPct <= -this.constraints.maxDailyLoss * 0.8) {
      const severity = dailyLossPct <= -this.constraints.maxDailyLoss ? 'CRITICAL' : 'HIGH';
      
      return {
        id: uuidv4(),
        type: 'DAILY_LOSS',
        severity,
        message: `Daily loss ${(dailyLossPct * 100).toFixed(2)}% approaching/exceeding limit ${(this.constraints.maxDailyLoss * 100).toFixed(2)}%`,
        timestamp: new Date(),
        resolved: false
      };
    }
    
    return null;
  }

  private checkDrawdownLimit(): RiskAlert | null {
    if (this.riskMetrics.max_drawdown >= this.constraints.maxDrawdown * 0.8) {
      const severity = this.riskMetrics.max_drawdown >= this.constraints.maxDrawdown ? 'CRITICAL' : 'HIGH';
      
      return {
        id: uuidv4(),
        type: 'DRAWDOWN',
        severity,
        message: `Portfolio drawdown ${(this.riskMetrics.max_drawdown * 100).toFixed(2)}% approaching/exceeding limit ${(this.constraints.maxDrawdown * 100).toFixed(2)}%`,
        timestamp: new Date(),
        resolved: false
      };
    }
    
    return null;
  }

  private checkPositionConcentration(): void {
    for (const position of this.portfolio.positions) {
      const concentration = Math.abs(position.quantity * position.current_price) / this.portfolio.total_value;
      
      if (concentration >= this.constraints.maxConcentrationPerSymbol * 0.9) {
        const alert: RiskAlert = {
          id: uuidv4(),
          type: 'CONCENTRATION',
          severity: concentration >= this.constraints.maxConcentrationPerSymbol ? 'CRITICAL' : 'HIGH',
          symbol: position.symbol,
          message: `Position concentration for ${position.symbol}: ${(concentration * 100).toFixed(1)}% approaching/exceeding limit ${(this.constraints.maxConcentrationPerSymbol * 100).toFixed(1)}%`,
          timestamp: new Date(),
          resolved: false
        };
        
        this.raiseAlert(alert);
      }
    }
  }

  private checkStopLossTriggers(): void {
    for (const position of this.portfolio.positions) {
      if (position.quantity > 0) { // Long position
        const drawdown = (position.entry_price - position.current_price) / position.entry_price;
        if (drawdown >= this.constraints.stopLossPercentage) {
          const alert: RiskAlert = {
            id: uuidv4(),
            type: 'STOP_LOSS',
            severity: 'HIGH',
            symbol: position.symbol,
            message: `Stop loss triggered for ${position.symbol}: ${(drawdown * 100).toFixed(2)}% loss`,
            timestamp: new Date(),
            resolved: false
          };
          
          this.raiseAlert(alert);
          this.emit('stopLossTriggered', { position, drawdown });
        }
      } else if (position.quantity < 0) { // Short position
        const loss = (position.current_price - position.entry_price) / position.entry_price;
        if (loss >= this.constraints.stopLossPercentage) {
          const alert: RiskAlert = {
            id: uuidv4(),
            type: 'STOP_LOSS',
            severity: 'HIGH',
            symbol: position.symbol,
            message: `Stop loss triggered for short ${position.symbol}: ${(loss * 100).toFixed(2)}% loss`,
            timestamp: new Date(),
            resolved: false
          };
          
          this.raiseAlert(alert);
          this.emit('stopLossTriggered', { position, loss });
        }
      }
    }
  }

  private raiseAlert(alert: RiskAlert): void {
    this.activeAlerts.set(alert.id, alert);
    this.emit('riskAlert', alert);
  }

  private calculateStopLossPrice(trade: Trade): number {
    if (trade.action === 'BUY') {
      return trade.price * (1 - this.constraints.stopLossPercentage);
    } else {
      return trade.price * (1 + this.constraints.stopLossPercentage);
    }
  }

  private calculateTakeProfitPrice(trade: Trade): number {
    // Take profit at 2x stop loss distance
    const stopLossDistance = this.constraints.stopLossPercentage;
    const takeProfitDistance = stopLossDistance * 2;
    
    if (trade.action === 'BUY') {
      return trade.price * (1 + takeProfitDistance);
    } else {
      return trade.price * (1 - takeProfitDistance);
    }
  }

  private updateDailyPnL(portfolio: Portfolio): void {
    const today = new Date().toISOString().split('T')[0];
    const existingEntry = this.dailyPnLHistory.find(entry => entry.date === today);
    
    if (existingEntry) {
      existingEntry.pnl = portfolio.daily_pnl;
    } else {
      this.dailyPnLHistory.push({ date: today, pnl: portfolio.daily_pnl });
    }
    
    // Keep last 30 days
    if (this.dailyPnLHistory.length > 30) {
      this.dailyPnLHistory.shift();
    }
  }

  // Helper methods for risk calculations
  private estimateWinRate(signal: Signal): number {
    // Simplified win rate estimation based on signal characteristics
    return Math.min(0.8, Math.max(0.3, signal.confidence * 0.7 + 0.2));
  }

  private estimateAverageWin(signal: Signal): number {
    // Simplified average win estimation
    return 0.05 * signal.strength; // 5% base win adjusted by signal strength
  }

  private estimateAverageLoss(signal: Signal): number {
    // Simplified average loss estimation (usually stop loss percentage)
    return this.constraints.stopLossPercentage;
  }

  private calculateSymbolConcentration(symbol: string): number {
    const position = this.portfolio.positions.find(p => p.symbol === symbol);
    if (!position) return 0;
    
    return Math.abs(position.quantity * position.current_price) / this.portfolio.total_value;
  }

  private calculateSectorConcentration(symbol: string): number {
    // Simplified sector concentration - in production, would use proper sector mapping
    return 0.1; // Assume 10% sector concentration
  }

  private estimateMarketVolatility(): number {
    // Simplified market volatility estimation
    // In production, would use VIX or calculate from market data
    return 0.2; // Assume 20% volatility
  }

  private getCurrentPrice(symbol: string): number {
    const position = this.portfolio.positions.find(p => p.symbol === symbol);
    return position ? position.current_price : 100; // Default price if not found
  }

  public updateConstraints(newConstraints: Partial<RiskConstraints>): void {
    this.constraints = { ...this.constraints, ...newConstraints };
    this.emit('constraintsUpdated', this.constraints);
  }

  public getConstraints(): RiskConstraints {
    return { ...this.constraints };
  }
}