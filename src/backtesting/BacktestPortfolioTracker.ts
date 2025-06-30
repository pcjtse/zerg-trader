import { Portfolio, Position, Trade, MarketData } from '../types';
import { EventEmitter } from 'events';

export interface PortfolioSnapshot {
  timestamp: Date;
  portfolio: Portfolio;
  metrics: PortfolioMetrics;
  attribution: PositionAttribution[];
}

export interface PortfolioMetrics {
  totalReturn: number;
  cumulativeReturn: number;
  dailyReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  largestWin: number;
  largestLoss: number;
  averageHoldingPeriod: number;
  beta: number;
  alpha: number;
  informationRatio: number;
}

export interface PositionAttribution {
  symbol: string;
  weight: number;
  return: number;
  contribution: number;
  pnl: number;
  averagePrice: number;
  currentPrice: number;
  quantity: number;
  holdingPeriod: number;
}

export class BacktestPortfolioTracker extends EventEmitter {
  private snapshots: PortfolioSnapshot[] = [];
  private benchmarkReturns: number[] = [];
  private initialValue: number;
  private currentPortfolio: Portfolio | null = null;
  private tradeHistory: Trade[] = [];
  private positionHistory: Map<string, Position[]> = new Map();
  private riskFreeRate: number = 0.02; // 2% annual risk-free rate

  constructor(initialValue: number) {
    super();
    this.initialValue = initialValue;
  }

  public updatePortfolio(portfolio: Portfolio, marketData?: Map<string, MarketData>): void {
    this.currentPortfolio = portfolio;
    
    const metrics = this.calculateMetrics(portfolio);
    const attribution = this.calculateAttribution(portfolio);
    
    const snapshot: PortfolioSnapshot = {
      timestamp: portfolio.timestamp,
      portfolio: { ...portfolio },
      metrics,
      attribution
    };
    
    this.snapshots.push(snapshot);
    this.updatePositionHistory(portfolio);
    
    this.emit('portfolioUpdated', snapshot);
  }

  public addTrade(trade: Trade): void {
    this.tradeHistory.push(trade);
    this.emit('tradeAdded', trade);
  }

  public setBenchmarkReturns(returns: number[]): void {
    this.benchmarkReturns = returns;
  }

  public getSnapshots(): PortfolioSnapshot[] {
    return [...this.snapshots];
  }

  public getLatestSnapshot(): PortfolioSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  public getMetricsTimeSeries(): Array<{ timestamp: Date; metrics: PortfolioMetrics }> {
    return this.snapshots.map(s => ({
      timestamp: s.timestamp,
      metrics: s.metrics
    }));
  }

  public getReturnsTimeSeries(): Array<{ timestamp: Date; return: number; cumulativeReturn: number }> {
    return this.snapshots.map(s => ({
      timestamp: s.timestamp,
      return: s.metrics.dailyReturn,
      cumulativeReturn: s.metrics.cumulativeReturn
    }));
  }

  public getDrawdownTimeSeries(): Array<{ timestamp: Date; drawdown: number }> {
    return this.snapshots.map(s => ({
      timestamp: s.timestamp,
      drawdown: s.metrics.currentDrawdown
    }));
  }

  public getPositionAttributionHistory(symbol: string): PositionAttribution[] {
    return this.snapshots
      .map(s => s.attribution.find(a => a.symbol === symbol))
      .filter(a => a !== undefined) as PositionAttribution[];
  }

  public exportToCSV(): string {
    const headers = [
      'timestamp',
      'total_value',
      'cash',
      'positions_value',
      'daily_return',
      'cumulative_return',
      'drawdown',
      'sharpe_ratio',
      'volatility',
      'total_trades'
    ];

    const rows = this.snapshots.map(snapshot => [
      snapshot.timestamp.toISOString(),
      snapshot.portfolio.total_value.toFixed(2),
      snapshot.portfolio.cash.toFixed(2),
      (snapshot.portfolio.total_value - snapshot.portfolio.cash).toFixed(2),
      (snapshot.metrics.dailyReturn * 100).toFixed(4),
      (snapshot.metrics.cumulativeReturn * 100).toFixed(2),
      (snapshot.metrics.currentDrawdown * 100).toFixed(2),
      snapshot.metrics.sharpeRatio.toFixed(3),
      (snapshot.metrics.volatility * 100).toFixed(2),
      snapshot.metrics.totalTrades.toString()
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  private calculateMetrics(portfolio: Portfolio): PortfolioMetrics {
    const returns = this.calculateReturns();
    const trades = this.getCompletedTrades();
    
    return {
      totalReturn: this.calculateTotalReturn(portfolio.total_value),
      cumulativeReturn: this.calculateCumulativeReturn(portfolio.total_value),
      dailyReturn: this.calculateDailyReturn(),
      volatility: this.calculateVolatility(returns),
      sharpeRatio: this.calculateSharpeRatio(returns),
      sortinoRatio: this.calculateSortinoRatio(returns),
      maxDrawdown: this.calculateMaxDrawdown(),
      currentDrawdown: this.calculateCurrentDrawdown(),
      calmarRatio: this.calculateCalmarRatio(),
      winRate: this.calculateWinRate(trades),
      profitFactor: this.calculateProfitFactor(trades),
      averageWin: this.calculateAverageWin(trades),
      averageLoss: this.calculateAverageLoss(trades),
      totalTrades: trades.length,
      winningTrades: trades.filter(t => this.getTradePnL(t) > 0).length,
      losingTrades: trades.filter(t => this.getTradePnL(t) < 0).length,
      largestWin: this.calculateLargestWin(trades),
      largestLoss: this.calculateLargestLoss(trades),
      averageHoldingPeriod: this.calculateAverageHoldingPeriod(trades),
      beta: this.calculateBeta(returns),
      alpha: this.calculateAlpha(returns),
      informationRatio: this.calculateInformationRatio(returns)
    };
  }

  private calculateAttribution(portfolio: Portfolio): PositionAttribution[] {
    return portfolio.positions.map(position => {
      const positionValue = position.quantity * position.current_price;
      const weight = positionValue / portfolio.total_value;
      const positionReturn = (position.current_price - position.entry_price) / position.entry_price;
      const contribution = weight * positionReturn;
      
      return {
        symbol: position.symbol,
        weight,
        return: positionReturn,
        contribution,
        pnl: position.unrealized_pnl + position.realized_pnl,
        averagePrice: position.entry_price,
        currentPrice: position.current_price,
        quantity: position.quantity,
        holdingPeriod: this.calculateHoldingPeriod(position)
      };
    });
  }

  private calculateReturns(): number[] {
    if (this.snapshots.length < 2) return [];
    
    const returns: number[] = [];
    for (let i = 1; i < this.snapshots.length; i++) {
      const previousValue = this.snapshots[i - 1].portfolio.total_value;
      const currentValue = this.snapshots[i].portfolio.total_value;
      const dailyReturn = (currentValue - previousValue) / previousValue;
      returns.push(dailyReturn);
    }
    
    return returns;
  }

  private calculateTotalReturn(currentValue: number): number {
    return (currentValue - this.initialValue) / this.initialValue;
  }

  private calculateCumulativeReturn(currentValue: number): number {
    return this.calculateTotalReturn(currentValue);
  }

  private calculateDailyReturn(): number {
    if (this.snapshots.length < 2) return 0;
    
    const previous = this.snapshots[this.snapshots.length - 2];
    const current = this.snapshots[this.snapshots.length - 1];
    
    return (current.portfolio.total_value - previous.portfolio.total_value) / previous.portfolio.total_value;
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 252); // Annualized volatility
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const volatility = this.calculateVolatility(returns) / Math.sqrt(252); // Daily volatility
    const riskFreeDaily = this.riskFreeRate / 252;
    
    return volatility > 0 ? (meanReturn - riskFreeDaily) / volatility : 0;
  }

  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const downSideReturns = returns.filter(r => r < 0);
    
    if (downSideReturns.length === 0) return meanReturn > 0 ? Infinity : 0;
    
    const downSideVariance = downSideReturns.reduce((sum, r) => sum + r * r, 0) / downSideReturns.length;
    const downSideVolatility = Math.sqrt(downSideVariance * 252);
    const riskFreeDaily = this.riskFreeRate / 252;
    
    return downSideVolatility > 0 ? (meanReturn - riskFreeDaily) / (downSideVolatility / Math.sqrt(252)) : 0;
  }

  private calculateMaxDrawdown(): number {
    if (this.snapshots.length < 2) return 0;
    
    let maxDrawdown = 0;
    let peak = this.snapshots[0].portfolio.total_value;
    
    for (const snapshot of this.snapshots) {
      const value = snapshot.portfolio.total_value;
      peak = Math.max(peak, value);
      const drawdown = (peak - value) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateCurrentDrawdown(): number {
    if (this.snapshots.length === 0) return 0;
    
    const currentValue = this.snapshots[this.snapshots.length - 1].portfolio.total_value;
    let peak = 0;
    
    for (const snapshot of this.snapshots) {
      peak = Math.max(peak, snapshot.portfolio.total_value);
    }
    
    return peak > 0 ? (peak - currentValue) / peak : 0;
  }

  private calculateCalmarRatio(): number {
    const totalReturn = this.snapshots.length > 0 ? 
      this.calculateTotalReturn(this.snapshots[this.snapshots.length - 1].portfolio.total_value) : 0;
    const maxDrawdown = this.calculateMaxDrawdown();
    
    return maxDrawdown > 0 ? totalReturn / maxDrawdown : 0;
  }

  private getCompletedTrades(): Trade[] {
    return this.tradeHistory.filter(t => t.status === 'FILLED');
  }

  private getTradePnL(trade: Trade): number {
    // Simplified P&L calculation - in practice would need more sophisticated tracking
    return trade.metadata?.realized_pnl || 0;
  }

  private calculateWinRate(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    const winningTrades = trades.filter(t => this.getTradePnL(t) > 0).length;
    return winningTrades / trades.length;
  }

  private calculateProfitFactor(trades: Trade[]): number {
    let totalProfit = 0;
    let totalLoss = 0;
    
    for (const trade of trades) {
      const pnl = this.getTradePnL(trade);
      if (pnl > 0) {
        totalProfit += pnl;
      } else {
        totalLoss += Math.abs(pnl);
      }
    }
    
    return totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
  }

  private calculateAverageWin(trades: Trade[]): number {
    const winningTrades = trades.filter(t => this.getTradePnL(t) > 0);
    if (winningTrades.length === 0) return 0;
    
    const totalWins = winningTrades.reduce((sum, t) => sum + this.getTradePnL(t), 0);
    return totalWins / winningTrades.length;
  }

  private calculateAverageLoss(trades: Trade[]): number {
    const losingTrades = trades.filter(t => this.getTradePnL(t) < 0);
    if (losingTrades.length === 0) return 0;
    
    const totalLosses = losingTrades.reduce((sum, t) => sum + Math.abs(this.getTradePnL(t)), 0);
    return totalLosses / losingTrades.length;
  }

  private calculateLargestWin(trades: Trade[]): number {
    const winningTrades = trades.filter(t => this.getTradePnL(t) > 0);
    return winningTrades.length > 0 ? Math.max(...winningTrades.map(t => this.getTradePnL(t))) : 0;
  }

  private calculateLargestLoss(trades: Trade[]): number {
    const losingTrades = trades.filter(t => this.getTradePnL(t) < 0);
    return losingTrades.length > 0 ? Math.min(...losingTrades.map(t => this.getTradePnL(t))) : 0;
  }

  private calculateAverageHoldingPeriod(trades: Trade[]): number {
    // Simplified calculation - would need entry/exit tracking in practice
    return 0;
  }

  private calculateHoldingPeriod(position: Position): number {
    const now = new Date();
    const entry = position.timestamp;
    return (now.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24); // Days
  }

  private calculateBeta(returns: number[]): number {
    if (this.benchmarkReturns.length === 0 || returns.length === 0) return 0;
    
    const minLength = Math.min(returns.length, this.benchmarkReturns.length);
    const portfolioReturns = returns.slice(-minLength);
    const benchmarkReturns = this.benchmarkReturns.slice(-minLength);
    
    const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const benchmarkMean = benchmarkReturns.reduce((sum, r) => sum + r, 0) / benchmarkReturns.length;
    
    let covariance = 0;
    let benchmarkVariance = 0;
    
    for (let i = 0; i < minLength; i++) {
      const portfolioDeviation = portfolioReturns[i] - portfolioMean;
      const benchmarkDeviation = benchmarkReturns[i] - benchmarkMean;
      
      covariance += portfolioDeviation * benchmarkDeviation;
      benchmarkVariance += benchmarkDeviation * benchmarkDeviation;
    }
    
    covariance /= minLength;
    benchmarkVariance /= minLength;
    
    return benchmarkVariance > 0 ? covariance / benchmarkVariance : 0;
  }

  private calculateAlpha(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const portfolioReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const benchmarkReturn = this.benchmarkReturns.length > 0 ? 
      this.benchmarkReturns.reduce((sum, r) => sum + r, 0) / this.benchmarkReturns.length : 0;
    const beta = this.calculateBeta(returns);
    const riskFreeDaily = this.riskFreeRate / 252;
    
    return portfolioReturn - (riskFreeDaily + beta * (benchmarkReturn - riskFreeDaily));
  }

  private calculateInformationRatio(returns: number[]): number {
    if (this.benchmarkReturns.length === 0 || returns.length === 0) return 0;
    
    const minLength = Math.min(returns.length, this.benchmarkReturns.length);
    const excessReturns = returns.slice(-minLength).map((r, i) => r - this.benchmarkReturns[i]);
    
    const meanExcessReturn = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;
    const trackingError = this.calculateVolatility(excessReturns) / Math.sqrt(252);
    
    return trackingError > 0 ? meanExcessReturn / trackingError : 0;
  }

  private updatePositionHistory(portfolio: Portfolio): void {
    for (const position of portfolio.positions) {
      const history = this.positionHistory.get(position.symbol) || [];
      history.push({ ...position });
      this.positionHistory.set(position.symbol, history);
    }
  }
}