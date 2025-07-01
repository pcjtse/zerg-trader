import { EventEmitter } from 'events';
import { TradingViewClient } from './TradingViewClient';
import { TradingViewDataService } from './TradingViewDataService';
import {
  TradingViewBacktestConfig,
  TradingViewBacktestResult,
  MarketData,
  Signal,
  Trade,
  BacktestResult,
  TechnicalIndicator,
  TradingViewConfig
} from '../types';

export interface TradingViewStrategyConfig {
  name: string;
  parameters: Record<string, any>;
  signals: {
    entry: {
      conditions: Array<{
        indicator: string;
        comparison: 'greater' | 'less' | 'equal' | 'crosses_above' | 'crosses_below';
        value: number | string;
      }>;
      action: 'BUY' | 'SELL';
    };
    exit: {
      conditions: Array<{
        indicator: string;
        comparison: 'greater' | 'less' | 'equal' | 'crosses_above' | 'crosses_below';
        value: number | string;
      }>;
      stopLoss?: number; // percentage
      takeProfit?: number; // percentage
      maxHoldingPeriod?: number; // days
    };
  };
  riskManagement: {
    maxPositionSize: number; // percentage of capital
    maxDrawdown: number; // percentage
    commission: number; // percentage
    slippage: number; // percentage
  };
}

export interface BacktestPosition {
  symbol: string;
  side: 'long' | 'short';
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  exitTime?: Date;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  status: 'open' | 'closed';
  signals: string[]; // Signal IDs that opened this position
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortinoratio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  largestWin: number;
  largestLoss: number;
  avgTradeReturn: number;
  avgHoldingPeriod: number;
  calmarRatio: number;
  recoveryFactor: number;
  payoffRatio: number;
}

export class TradingViewBacktestEngine extends EventEmitter {
  private dataService: TradingViewDataService;
  private client: TradingViewClient;
  private strategies: Map<string, TradingViewStrategyConfig> = new Map();
  private runningBacktests: Map<string, any> = new Map();

  constructor(config: TradingViewConfig = {}) {
    super();
    this.dataService = new TradingViewDataService(config);
    this.client = new TradingViewClient(config);
  }

  public async initialize(): Promise<void> {
    try {
      await this.dataService.initialize();
      await this.client.initialize();
      this.emit('initialized');
    } catch (error) {
      this.emit('error', `Backtest engine initialization failed: ${error}`);
      throw error;
    }
  }

  public registerStrategy(strategy: TradingViewStrategyConfig): void {
    this.strategies.set(strategy.name, strategy);
    this.emit('strategyRegistered', strategy.name);
  }

  public getRegisteredStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  public async runBacktest(
    strategyName: string,
    symbol: string,
    startDate: Date,
    endDate: Date,
    initialCapital: number = 100000,
    resolution: '1' | '5' | '15' | '30' | '60' | '240' | '1D' | '1W' | '1M' = '1D'
  ): Promise<TradingViewBacktestResult> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }

    const backtestId = `${strategyName}_${symbol}_${Date.now()}`;
    this.runningBacktests.set(backtestId, { status: 'running', progress: 0 });

    try {
      this.emit('backtestStarted', { id: backtestId, strategy: strategyName, symbol });

      // Get historical market data
      const marketData = await this.dataService.getHistoricalData(
        symbol,
        resolution,
        startDate,
        endDate,
        false // Don't use cache for backtesting
      );

      if (marketData.length === 0) {
        throw new Error(`No market data available for ${symbol} in the specified period`);
      }

      // Get required technical indicators
      const indicators = await this.getRequiredIndicators(symbol, strategy, resolution, startDate, endDate);

      // Run the backtest simulation
      const result = await this.simulateStrategy(
        strategy,
        symbol,
        marketData,
        indicators,
        initialCapital,
        backtestId
      );

      this.runningBacktests.delete(backtestId);
      this.emit('backtestCompleted', { id: backtestId, result });

      return result;
    } catch (error) {
      this.runningBacktests.delete(backtestId);
      this.emit('backtestError', { id: backtestId, error });
      throw error;
    }
  }

  private async getRequiredIndicators(
    symbol: string,
    strategy: TradingViewStrategyConfig,
    resolution: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, TechnicalIndicator[]>> {
    const indicators = new Map<string, TechnicalIndicator[]>();
    const requiredIndicators = new Set<string>();

    // Extract required indicators from strategy conditions
    strategy.signals.entry.conditions.forEach(condition => {
      requiredIndicators.add(condition.indicator);
    });

    strategy.signals.exit.conditions.forEach(condition => {
      requiredIndicators.add(condition.indicator);
    });

    // Fetch each required indicator
    for (const indicatorName of requiredIndicators) {
      if (this.isStandardIndicator(indicatorName)) {
        try {
          const indicatorData = await this.dataService.getTechnicalIndicators(
            symbol,
            indicatorName as any,
            resolution,
            strategy.parameters[`${indicatorName}_period`] || 14,
            startDate,
            endDate,
            strategy.parameters
          );
          
          indicators.set(indicatorName, indicatorData);
        } catch (error) {
          this.emit('warning', `Failed to get ${indicatorName} for ${symbol}: ${error}`);
        }
      }
    }

    return indicators;
  }

  private isStandardIndicator(name: string): boolean {
    const standardIndicators = ['SMA', 'EMA', 'RSI', 'MACD', 'BB', 'STOCH', 'VWAP'];
    return standardIndicators.includes(name.toUpperCase());
  }

  private async simulateStrategy(
    strategy: TradingViewStrategyConfig,
    symbol: string,
    marketData: MarketData[],
    indicators: Map<string, TechnicalIndicator[]>,
    initialCapital: number,
    backtestId: string
  ): Promise<TradingViewBacktestResult> {
    let currentCapital = initialCapital;
    let cash = initialCapital;
    const positions: BacktestPosition[] = [];
    const trades: Trade[] = [];
    const equity: Array<{ time: number; value: number }> = [];
    let maxEquity = initialCapital;
    let maxDrawdown = 0;

    // Sort market data by timestamp
    marketData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    for (let i = 0; i < marketData.length; i++) {
      const currentBar = marketData[i];
      const currentTime = currentBar.timestamp;
      
      // Update progress
      const progress = Math.floor((i / marketData.length) * 100);
      if (this.runningBacktests.has(backtestId)) {
        this.runningBacktests.get(backtestId).progress = progress;
        this.emit('backtestProgress', { id: backtestId, progress });
      }

      // Get indicator values at current time
      const currentIndicators = this.getIndicatorValuesAtTime(indicators, currentTime);

      // Check exit conditions for existing positions
      const openPositions = positions.filter(p => p.status === 'open');
      for (const position of openPositions) {
        const exitSignal = this.checkExitConditions(
          strategy,
          currentBar,
          currentIndicators,
          position
        );

        if (exitSignal) {
          this.closePosition(position, currentBar, exitSignal, trades, strategy);
          cash += position.exitPrice! * position.quantity;
        }
      }

      // Check entry conditions for new positions
      if (cash > 0) {
        const entrySignal = this.checkEntryConditions(strategy, currentBar, currentIndicators);
        
        if (entrySignal) {
          const newPosition = this.openPosition(
            symbol,
            entrySignal,
            currentBar,
            cash,
            strategy,
            trades
          );
          
          if (newPosition) {
            positions.push(newPosition);
            cash -= newPosition.entryPrice * newPosition.quantity;
          }
        }
      }

      // Calculate current portfolio value
      const openPositionsValue = openPositions.reduce((total, pos) => {
        return total + (currentBar.close * pos.quantity);
      }, 0);

      currentCapital = cash + openPositionsValue;
      
      // Track max drawdown
      if (currentCapital > maxEquity) {
        maxEquity = currentCapital;
      }
      
      const currentDrawdown = (maxEquity - currentCapital) / maxEquity;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }

      // Record equity curve
      equity.push({
        time: currentTime.getTime() / 1000,
        value: currentCapital
      });
    }

    // Close any remaining open positions at the end
    const finalBar = marketData[marketData.length - 1];
    const openPositions = positions.filter(p => p.status === 'open');
    for (const position of openPositions) {
      this.closePosition(position, finalBar, 'END_OF_PERIOD', trades, strategy);
    }

    // Calculate performance metrics
    const metrics = this.calculateMetrics(trades, initialCapital, currentCapital, equity, marketData);

    return {
      strategy: strategy.name,
      symbol,
      period: {
        from: Math.floor(marketData[0].timestamp.getTime() / 1000),
        to: Math.floor(marketData[marketData.length - 1].timestamp.getTime() / 1000)
      },
      performance: {
        totalReturn: metrics.totalReturn,
        annualizedReturn: metrics.annualizedReturn,
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdown: metrics.maxDrawdown,
        winRate: metrics.winRate,
        profitFactor: metrics.profitFactor,
        totalTrades: metrics.totalTrades,
        avgTradeReturn: metrics.avgTradeReturn
      },
      trades: trades.map(trade => ({
        entryTime: trade.timestamp.getTime() / 1000,
        exitTime: trade.timestamp.getTime() / 1000, // Simplified for now
        side: trade.action === 'BUY' ? 'long' : 'short',
        entryPrice: trade.price,
        exitPrice: trade.price, // Simplified
        quantity: trade.quantity,
        pnl: 0, // Calculate based on actual exit
        pnlPercent: 0,
        runup: 0,
        drawdown: 0
      })),
      equity
    };
  }

  private getIndicatorValuesAtTime(
    indicators: Map<string, TechnicalIndicator[]>,
    targetTime: Date
  ): Map<string, number> {
    const values = new Map<string, number>();

    for (const [indicatorName, indicatorData] of indicators) {
      // Find the closest indicator value to the target time
      let closestValue: TechnicalIndicator | undefined;
      let minTimeDiff = Infinity;

      for (const indicator of indicatorData) {
        const timeDiff = Math.abs(indicator.timestamp.getTime() - targetTime.getTime());
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestValue = indicator;
        }
      }

      if (closestValue) {
        values.set(indicatorName, closestValue.value);
      }
    }

    return values;
  }

  private checkEntryConditions(
    strategy: TradingViewStrategyConfig,
    bar: MarketData,
    indicators: Map<string, number>
  ): 'BUY' | 'SELL' | null {
    const { entry } = strategy.signals;
    
    let conditionsMet = true;
    
    for (const condition of entry.conditions) {
      const indicatorValue = indicators.get(condition.indicator);
      if (indicatorValue === undefined) {
        conditionsMet = false;
        break;
      }

      const targetValue = typeof condition.value === 'string' 
        ? indicators.get(condition.value) || parseFloat(condition.value)
        : condition.value;

      if (!this.evaluateCondition(indicatorValue, condition.comparison, targetValue)) {
        conditionsMet = false;
        break;
      }
    }

    return conditionsMet ? entry.action : null;
  }

  private checkExitConditions(
    strategy: TradingViewStrategyConfig,
    bar: MarketData,
    indicators: Map<string, number>,
    position: BacktestPosition
  ): string | null {
    const { exit } = strategy.signals;
    
    // Check stop loss
    if (exit.stopLoss && position.stopLoss) {
      if ((position.side === 'long' && bar.close <= position.stopLoss) ||
          (position.side === 'short' && bar.close >= position.stopLoss)) {
        return 'STOP_LOSS';
      }
    }

    // Check take profit
    if (exit.takeProfit && position.takeProfit) {
      if ((position.side === 'long' && bar.close >= position.takeProfit) ||
          (position.side === 'short' && bar.close <= position.takeProfit)) {
        return 'TAKE_PROFIT';
      }
    }

    // Check max holding period
    if (exit.maxHoldingPeriod) {
      const holdingDays = (bar.timestamp.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60 * 24);
      if (holdingDays >= exit.maxHoldingPeriod) {
        return 'MAX_HOLDING_PERIOD';
      }
    }

    // Check exit conditions
    let conditionsMet = true;
    
    for (const condition of exit.conditions) {
      const indicatorValue = indicators.get(condition.indicator);
      if (indicatorValue === undefined) {
        conditionsMet = false;
        break;
      }

      const targetValue = typeof condition.value === 'string' 
        ? indicators.get(condition.value) || parseFloat(condition.value)
        : condition.value;

      if (!this.evaluateCondition(indicatorValue, condition.comparison, targetValue)) {
        conditionsMet = false;
        break;
      }
    }

    return conditionsMet ? 'EXIT_SIGNAL' : null;
  }

  private evaluateCondition(
    value1: number,
    comparison: string,
    value2: number
  ): boolean {
    switch (comparison) {
      case 'greater':
        return value1 > value2;
      case 'less':
        return value1 < value2;
      case 'equal':
        return Math.abs(value1 - value2) < 0.0001; // Floating point comparison
      case 'crosses_above':
        // This would need previous values to implement properly
        return value1 > value2;
      case 'crosses_below':
        // This would need previous values to implement properly
        return value1 < value2;
      default:
        return false;
    }
  }

  private openPosition(
    symbol: string,
    signal: 'BUY' | 'SELL',
    bar: MarketData,
    availableCash: number,
    strategy: TradingViewStrategyConfig,
    trades: Trade[]
  ): BacktestPosition | null {
    const maxPositionValue = availableCash * strategy.riskManagement.maxPositionSize;
    const entryPrice = bar.close * (1 + strategy.riskManagement.slippage / 100);
    const quantity = Math.floor(maxPositionValue / entryPrice);

    if (quantity <= 0) {
      return null;
    }

    const position: BacktestPosition = {
      symbol,
      side: signal === 'BUY' ? 'long' : 'short',
      entryTime: bar.timestamp,
      entryPrice,
      quantity,
      status: 'open',
      signals: [`${signal}_${bar.timestamp.getTime()}`]
    };

    // Set stop loss and take profit if configured
    if (strategy.signals.exit.stopLoss) {
      position.stopLoss = position.side === 'long' 
        ? entryPrice * (1 - strategy.signals.exit.stopLoss / 100)
        : entryPrice * (1 + strategy.signals.exit.stopLoss / 100);
    }

    if (strategy.signals.exit.takeProfit) {
      position.takeProfit = position.side === 'long'
        ? entryPrice * (1 + strategy.signals.exit.takeProfit / 100)
        : entryPrice * (1 - strategy.signals.exit.takeProfit / 100);
    }

    // Record the trade
    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random()}`,
      symbol,
      action: signal,
      quantity,
      price: entryPrice,
      timestamp: bar.timestamp,
      status: 'FILLED',
      agent_signals: position.signals
    };

    trades.push(trade);
    return position;
  }

  private closePosition(
    position: BacktestPosition,
    bar: MarketData,
    exitReason: string,
    trades: Trade[],
    strategy: TradingViewStrategyConfig
  ): void {
    const exitPrice = bar.close * (1 - strategy.riskManagement.slippage / 100);
    const commission = (position.entryPrice + exitPrice) * position.quantity * strategy.riskManagement.commission / 100;
    
    position.exitTime = bar.timestamp;
    position.exitPrice = exitPrice;
    position.status = 'closed';

    // Calculate P&L
    if (position.side === 'long') {
      position.pnl = (exitPrice - position.entryPrice) * position.quantity - commission;
    } else {
      position.pnl = (position.entryPrice - exitPrice) * position.quantity - commission;
    }

    position.pnlPercent = (position.pnl / (position.entryPrice * position.quantity)) * 100;

    // Record the exit trade
    const exitTrade: Trade = {
      id: `trade_${Date.now()}_${Math.random()}`,
      symbol: position.symbol,
      action: position.side === 'long' ? 'SELL' : 'BUY',
      quantity: position.quantity,
      price: exitPrice,
      timestamp: bar.timestamp,
      status: 'FILLED',
      agent_signals: [`${exitReason}_${bar.timestamp.getTime()}`],
      metadata: { exitReason, originalEntry: position.entryTime }
    };

    trades.push(exitTrade);
  }

  private calculateMetrics(
    trades: Trade[],
    initialCapital: number,
    finalCapital: number,
    equity: Array<{ time: number; value: number }>,
    marketData: MarketData[]
  ): BacktestMetrics {
    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
    const periodDays = (marketData[marketData.length - 1].timestamp.getTime() - marketData[0].timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const annualizedReturn = (Math.pow(finalCapital / initialCapital, 365 / periodDays) - 1) * 100;

    // Calculate drawdown
    let maxEquity = initialCapital;
    let maxDrawdown = 0;
    
    for (const point of equity) {
      if (point.value > maxEquity) {
        maxEquity = point.value;
      }
      const drawdown = (maxEquity - point.value) / maxEquity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Group trades by pairs (entry/exit)
    const tradePairs: Array<{ entry: Trade; exit: Trade; pnl: number }> = [];
    const entryTrades = trades.filter(t => t.action === 'BUY' || t.action === 'SELL');
    const exitTrades = trades.filter(t => t.metadata?.exitReason);

    // Simple pairing - this could be improved
    for (let i = 0; i < Math.min(entryTrades.length, exitTrades.length); i++) {
      const entry = entryTrades[i];
      const exit = exitTrades[i];
      const pnl = entry.action === 'BUY' 
        ? (exit.price - entry.price) * entry.quantity
        : (entry.price - exit.price) * entry.quantity;
      
      tradePairs.push({ entry, exit, pnl });
    }

    const winningTrades = tradePairs.filter(t => t.pnl > 0);
    const losingTrades = tradePairs.filter(t => t.pnl <= 0);
    
    const winRate = tradePairs.length > 0 ? (winningTrades.length / tradePairs.length) * 100 : 0;
    const avgWinningTrade = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLosingTrade = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;
    const profitFactor = Math.abs(avgLosingTrade) > 0 ? Math.abs(avgWinningTrade / avgLosingTrade) : 0;

    // Calculate Sharpe ratio (simplified)
    const returns = equity.map((point, i) => {
      if (i === 0) return 0;
      return (point.value - equity[i - 1].value) / equity[i - 1].value;
    }).slice(1);

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const returnStd = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = returnStd > 0 ? (avgReturn / returnStd) * Math.sqrt(252) : 0; // Annualized

    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      sortinoratio: sharpeRatio, // Simplified
      maxDrawdown: maxDrawdown * 100,
      winRate,
      profitFactor,
      totalTrades: tradePairs.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWinningTrade,
      avgLosingTrade,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0,
      avgTradeReturn: tradePairs.length > 0 ? tradePairs.reduce((sum, t) => sum + t.pnl, 0) / tradePairs.length : 0,
      avgHoldingPeriod: 0, // Calculate based on position holding times
      calmarRatio: maxDrawdown > 0 ? annualizedReturn / (maxDrawdown * 100) : 0,
      recoveryFactor: 0, // Calculate based on recovery from drawdowns
      payoffRatio: Math.abs(avgLosingTrade) > 0 ? avgWinningTrade / Math.abs(avgLosingTrade) : 0
    };
  }

  public getBacktestProgress(backtestId: string): { status: string; progress: number } | null {
    return this.runningBacktests.get(backtestId) || null;
  }

  public cancelBacktest(backtestId: string): boolean {
    if (this.runningBacktests.has(backtestId)) {
      this.runningBacktests.delete(backtestId);
      this.emit('backtestCancelled', backtestId);
      return true;
    }
    return false;
  }

  public async disconnect(): Promise<void> {
    // Cancel all running backtests
    for (const backtestId of this.runningBacktests.keys()) {
      this.cancelBacktest(backtestId);
    }

    await this.dataService.disconnect();
    await this.client.disconnect();
    
    this.emit('disconnected');
  }
}