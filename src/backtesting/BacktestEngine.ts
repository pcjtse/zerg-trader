import { EventEmitter } from 'events';
import { MarketData, Portfolio, Trade, Signal, BacktestResult, AgentConfig } from '../types';
import { PortfolioManager, PortfolioConfig } from '../portfolio/PortfolioManager';
import { RiskManager } from '../risk/RiskManager';
import { AgentManager } from '../agents/AgentManager';
import { TrendFollowingAgent } from '../agents/technical/TrendFollowingAgent';
import { MeanReversionAgent } from '../agents/technical/MeanReversionAgent';
import { ValuationAgent } from '../agents/fundamental/ValuationAgent';
import { DecisionFusionAgent } from '../agents/fusion/DecisionFusionAgent';
import { v4 as uuidv4 } from 'uuid';

export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  symbols: string[];
  commission: number;
  slippage: number;
  dataSource: 'historical' | 'mock';
  rebalanceFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export interface BacktestSnapshot {
  timestamp: Date;
  portfolio: Portfolio;
  marketData: Map<string, MarketData>;
  signals: Signal[];
  trades: Trade[];
  metrics: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
  };
}

export class BacktestEngine extends EventEmitter {
  private config: BacktestConfig;
  private portfolioManager: PortfolioManager;
  private riskManager: RiskManager;
  private agentManager: AgentManager;
  private historicalData: Map<string, MarketData[]> = new Map();
  private currentIndex: number = 0;
  private snapshots: BacktestSnapshot[] = [];
  private results: BacktestResult | null = null;
  private isRunning: boolean = false;

  constructor(
    config: BacktestConfig,
    agentConfigs: AgentConfig[],
    riskConfig: any
  ) {
    super();
    this.config = config;

    // Initialize managers for backtesting
    const initialPortfolio = {
      id: 'backtest-portfolio',
      cash: config.initialCapital,
      positions: [],
      total_value: config.initialCapital,
      daily_pnl: 0,
      total_pnl: 0,
      timestamp: new Date()
    };
    this.riskManager = new RiskManager(riskConfig, initialPortfolio);
    
    const portfolioConfig: PortfolioConfig = {
      initialCash: config.initialCapital,
      rebalanceFrequency: config.rebalanceFrequency || 'DAILY',
      maxPositions: 20,
      minTradeSize: 100,
      transactionCosts: {
        commission: config.commission,
        spreadCost: 0.001,
        slippage: config.slippage
      }
    };

    this.portfolioManager = new PortfolioManager(portfolioConfig, this.riskManager);
    this.agentManager = new AgentManager();
    
    // Initialize and register agents based on configs
    this.initializeAgents(agentConfigs);

    this.setupEventHandlers();
  }

  private initializeAgents(agentConfigs: AgentConfig[]): void {
    const sharedMemoryService = this.agentManager.getMemoryService();
    const enableClaude = true; // Enable for backtesting
    const enableA2A = false; // Disable A2A for backtesting
    
    agentConfigs.forEach(agentConfig => {
      let agent;
      
      switch (agentConfig.type) {
        case 'TECHNICAL':
          if (agentConfig.name.includes('Trend')) {
            agent = new TrendFollowingAgent(agentConfig, enableClaude, true);
          } else if (agentConfig.name.includes('Mean')) {
            agent = new MeanReversionAgent(agentConfig, enableClaude);
          }
          break;
        case 'FUNDAMENTAL':
          agent = new ValuationAgent(agentConfig, enableClaude);
          break;
        case 'FUSION':
          agent = new DecisionFusionAgent(agentConfig, enableClaude);
          break;
        default:
          console.warn(`Unknown agent type: ${agentConfig.type}`);
      }
      
      if (agent) {
        this.agentManager.registerAgent(agent);
        console.log(`Registered ${agentConfig.type} agent: ${agentConfig.name}`);
      }
    });
  }

  public async loadHistoricalData(data: Map<string, MarketData[]>): Promise<void> {
    this.historicalData = data;
    this.validateDataIntegrity();
  }

  public async runBacktest(): Promise<BacktestResult> {
    if (this.isRunning) {
      throw new Error('Backtest is already running');
    }

    this.isRunning = true;
    this.currentIndex = 0;
    this.snapshots = [];
    
    try {
      this.emit('backtestStarted', {
        config: this.config,
        totalDataPoints: this.getTotalDataPoints()
      });

      // Main backtest loop
      while (this.hasMoreData()) {
        await this.processTimeStep();
        this.currentIndex++;
        
        // Emit progress
        const progress = this.currentIndex / this.getTotalDataPoints();
        this.emit('backtestProgress', { progress, currentIndex: this.currentIndex });
      }

      // Calculate final results
      this.results = this.calculateResults();
      
      this.emit('backtestCompleted', this.results);
      return this.results;

    } catch (error) {
      this.emit('backtestError', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  public async runParameterSweep(
    parameterRanges: Map<string, number[]>
  ): Promise<Map<string, BacktestResult>> {
    const results = new Map<string, BacktestResult>();
    const combinations = this.generateParameterCombinations(parameterRanges);

    for (const [key, params] of combinations) {
      // Update agent parameters
      this.updateAgentParameters(params);
      
      // Run backtest with these parameters
      const result = await this.runBacktest();
      results.set(key, result);
      
      this.emit('parameterSweepProgress', {
        completed: results.size,
        total: combinations.size,
        currentParams: params,
        result
      });
    }

    return results;
  }

  public getSnapshots(limit?: number): BacktestSnapshot[] {
    return limit ? this.snapshots.slice(-limit) : [...this.snapshots];
  }

  public getCurrentSnapshot(): BacktestSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  public getResults(): BacktestResult | null {
    return this.results;
  }

  public stop(): void {
    this.isRunning = false;
    this.emit('backtestStopped');
  }

  private async processTimeStep(): Promise<void> {
    const currentDate = this.getCurrentDate();
    if (!currentDate) return;

    // Get market data for current timestamp
    const marketData = this.getCurrentMarketData();
    
    // Update portfolio with current market prices
    const prices = new Map<string, number>();
    marketData.forEach((data, symbol) => {
      prices.set(symbol, data.close);
    });
    this.portfolioManager.updateMarketPrices(prices);

    // Generate signals from agents
    const signals = await this.generateSignals(marketData);

    // Process signals and execute trades
    const executedTrades: Trade[] = [];
    for (const signal of signals) {
      const tradeResult = this.portfolioManager.processSignal(signal);
      if (tradeResult.approved && tradeResult.trade) {
        const executionResult = this.portfolioManager.executeTrade(tradeResult.trade);
        if (executionResult.success && executionResult.executedTrade) {
          executedTrades.push(executionResult.executedTrade);
        }
      }
    }

    // Create snapshot
    const snapshot: BacktestSnapshot = {
      timestamp: currentDate,
      portfolio: this.portfolioManager.getPortfolio(),
      marketData,
      signals,
      trades: executedTrades,
      metrics: this.calculateCurrentMetrics()
    };

    this.snapshots.push(snapshot);
    this.emit('timestepProcessed', snapshot);
  }

  private async generateSignals(marketData: Map<string, MarketData>): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    // Get all active agents
    const allAgents = this.agentManager.getAllAgents().filter(agent => agent.isEnabled());
    
    // Process each symbol with each agent
    for (const [symbol, data] of marketData) {
      // Get historical data for analysis (last 100 data points)
      const historicalData = this.getHistoricalDataForSymbol(symbol, 100);
      
      if (historicalData.length === 0) continue;
      
      // Calculate technical indicators
      const indicators = this.calculateIndicators(historicalData);
      
      for (const agent of allAgents) {
        try {
          let agentSignals: Signal[] = [];
          
          switch (agent.getType()) {
            case 'TECHNICAL':
              agentSignals = await agent.analyze({ 
                symbol, 
                marketData: historicalData, 
                indicators 
              });
              break;
            case 'FUNDAMENTAL':
              // For backtesting, we'll use simplified fundamental data
              const fundamentalData = this.generateMockFundamentalData(symbol);
              agentSignals = await agent.analyze({ 
                symbol, 
                fundamentalData, 
                marketData: historicalData 
              });
              break;
            case 'FUSION':
              // Fusion agent needs signals from other agents
              const otherSignals = signals.filter(s => s.symbol === symbol);
              if (otherSignals.length > 0) {
                agentSignals = await agent.analyze({ 
                  symbol, 
                  signals: otherSignals 
                });
              }
              break;
          }
          
          signals.push(...agentSignals);
        } catch (error) {
          console.error(`Error generating signals from agent ${agent.getId()}:`, error);
        }
      }
    }
    
    return signals;
  }

  private getCurrentDate(): Date | null {
    if (!this.hasMoreData()) return null;
    
    // Get the earliest timestamp from all symbols at current index
    let earliestDate: Date | null = null;
    
    for (const [symbol, data] of this.historicalData) {
      if (this.currentIndex < data.length) {
        const timestamp = data[this.currentIndex].timestamp;
        if (!earliestDate || timestamp < earliestDate) {
          earliestDate = timestamp;
        }
      }
    }
    
    return earliestDate;
  }

  private getCurrentMarketData(): Map<string, MarketData> {
    const currentData = new Map<string, MarketData>();
    
    for (const [symbol, data] of this.historicalData) {
      if (this.currentIndex < data.length) {
        currentData.set(symbol, data[this.currentIndex]);
      }
    }
    
    return currentData;
  }

  private hasMoreData(): boolean {
    for (const [symbol, data] of this.historicalData) {
      if (this.currentIndex < data.length) {
        return true;
      }
    }
    return false;
  }

  private getTotalDataPoints(): number {
    let maxLength = 0;
    for (const [symbol, data] of this.historicalData) {
      maxLength = Math.max(maxLength, data.length);
    }
    return maxLength;
  }

  private validateDataIntegrity(): void {
    if (this.historicalData.size === 0) {
      throw new Error('No historical data provided');
    }

    // Check for required symbols
    for (const symbol of this.config.symbols) {
      if (!this.historicalData.has(symbol)) {
        throw new Error(`Missing historical data for symbol: ${symbol}`);
      }
    }

    // Validate date ranges
    for (const [symbol, data] of this.historicalData) {
      if (data.length === 0) {
        throw new Error(`Empty data for symbol: ${symbol}`);
      }
      
      const firstDate = data[0].timestamp;
      const lastDate = data[data.length - 1].timestamp;
      
      if (firstDate > this.config.startDate) {
        console.warn(`Data for ${symbol} starts after backtest start date`);
      }
      
      if (lastDate < this.config.endDate) {
        console.warn(`Data for ${symbol} ends before backtest end date`);
      }
    }
  }

  private calculateCurrentMetrics(): any {
    const portfolio = this.portfolioManager.getPortfolio();
    const performance = this.portfolioManager.getPerformanceMetrics();
    
    return {
      totalReturn: performance.totalReturn,
      sharpeRatio: performance.sharpeRatio,
      maxDrawdown: performance.maxDrawdown,
      winRate: performance.winRate
    };
  }

  private calculateResults(): BacktestResult {
    const finalPortfolio = this.portfolioManager.getPortfolio();
    const trades = this.portfolioManager.getTradeHistory();
    const performance = this.portfolioManager.getPerformanceMetrics();
    
    const winningTrades = trades.filter(trade => {
      // Simplified win calculation - in reality would need to track P&L per trade
      return trade.metadata?.realized_pnl && trade.metadata.realized_pnl > 0;
    }).length;

    return {
      id: uuidv4(),
      start_date: this.config.startDate,
      end_date: this.config.endDate,
      initial_capital: this.config.initialCapital,
      final_capital: finalPortfolio.total_value,
      total_return: performance.totalReturn,
      max_drawdown: performance.maxDrawdown,
      sharpe_ratio: performance.sharpeRatio,
      total_trades: trades.length,
      winning_trades: winningTrades,
      win_rate: trades.length > 0 ? winningTrades / trades.length : 0,
      trades
    };
  }

  private generateParameterCombinations(
    parameterRanges: Map<string, number[]>
  ): Map<string, Map<string, number>> {
    const combinations = new Map<string, Map<string, number>>();
    const paramNames = Array.from(parameterRanges.keys());
    const paramValues = Array.from(parameterRanges.values());
    
    const generateCombinations = (index: number, current: Map<string, number>): void => {
      if (index === paramNames.length) {
        const key = Array.from(current.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        combinations.set(key, new Map(current));
        return;
      }
      
      const paramName = paramNames[index];
      const values = paramValues[index];
      
      for (const value of values) {
        current.set(paramName, value);
        generateCombinations(index + 1, current);
      }
    };
    
    generateCombinations(0, new Map());
    return combinations;
  }

  private updateAgentParameters(params: Map<string, number>): void {
    // This would update agent parameters for parameter sweep
    // Implementation depends on agent architecture
  }

  private getHistoricalDataForSymbol(symbol: string, limit: number): MarketData[] {
    const data = this.historicalData.get(symbol) || [];
    const endIndex = Math.min(this.currentIndex + 1, data.length);
    const startIndex = Math.max(0, endIndex - limit);
    return data.slice(startIndex, endIndex);
  }

  private calculateIndicators(data: MarketData[]): any[] {
    // Simple indicator calculation for backtesting
    if (data.length < 20) return [];
    
    const closes = data.map(d => d.close);
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = data.length >= 50 ? this.calculateSMA(closes, 50) : null;
    const rsi = this.calculateRSI(closes, 14);
    
    return [
      { name: 'SMA_20', value: sma20, timestamp: data[data.length - 1].timestamp },
      ...(sma50 ? [{ name: 'SMA_50', value: sma50, timestamp: data[data.length - 1].timestamp }] : []),
      { name: 'RSI', value: rsi, timestamp: data[data.length - 1].timestamp }
    ];
  }

  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return 0;
    const sum = values.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateRSI(values: number[], period: number): number {
    if (values.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;
    
    return 100 - (100 / (1 + rs));
  }

  private generateMockFundamentalData(symbol: string): any {
    // Generate mock fundamental data for backtesting
    return {
      symbol,
      timestamp: new Date(),
      pe_ratio: 15 + Math.random() * 20,
      eps: 2 + Math.random() * 10,
      debt_to_equity: Math.random() * 2,
      roe: 0.05 + Math.random() * 0.25,
      roa: 0.02 + Math.random() * 0.15,
      revenue: 1000000 + Math.random() * 10000000
    };
  }

  private setupEventHandlers(): void {
    this.portfolioManager.on('tradeExecuted', (trade: Trade) => {
      this.emit('tradeExecuted', trade);
    });

    this.portfolioManager.on('portfolioUpdated', (portfolio: Portfolio) => {
      this.emit('portfolioUpdated', portfolio);
    });

    this.portfolioManager.on('riskAlert', (alert: any) => {
      this.emit('riskAlert', alert);
    });
  }
}