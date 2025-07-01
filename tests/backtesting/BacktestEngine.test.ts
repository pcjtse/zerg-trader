import { BacktestEngine, BacktestConfig } from '../../src/backtesting/BacktestEngine';
import { MarketData, AgentConfig } from '../../src/types';

describe('BacktestEngine', () => {
  let backtestEngine: BacktestEngine;
  let config: BacktestConfig;
  let mockHistoricalData: Map<string, MarketData[]>;
  let agentConfigs: AgentConfig[];
  let riskConfig: any;

  beforeEach(() => {
    config = {
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-10'),
      initialCapital: 100000,
      symbols: ['AAPL', 'MSFT'],
      commission: 5,
      slippage: 0.001,
      dataSource: 'mock',
      rebalanceFrequency: 'DAILY'
    };

    agentConfigs = [
      {
        id: 'agent-1',
        name: 'Test Technical Agent',
        type: 'TECHNICAL',
        enabled: true,
        parameters: { sma_period: 20, rsi_period: 14 },
        weight: 1.0
      },
      {
        id: 'agent-2',
        name: 'Test Fundamental Agent',
        type: 'FUNDAMENTAL',
        enabled: true,
        parameters: { pe_threshold: 15 },
        weight: 0.8
      }
    ];

    riskConfig = {
      maxPositionSize: 0.1,
      maxDailyLoss: 0.05,
      maxDrawdown: 0.2,
      stopLossPercentage: 0.05,
      maxLeverage: 2.0,
      maxConcentrationPerSector: 0.3,
      maxConcentrationPerSymbol: 0.15,
      minCashReserve: 0.05
    };

    // Create mock historical data
    mockHistoricalData = new Map();
    const symbols = ['AAPL', 'MSFT'];
    
    symbols.forEach(symbol => {
      const data: MarketData[] = [];
      for (let i = 0; i < 10; i++) {
        const date = new Date('2023-01-01');
        date.setDate(date.getDate() + i);
        
        const basePrice = symbol === 'AAPL' ? 150 : 250;
        const randomFactor = 0.95 + Math.random() * 0.1; // ±5% random variation
        
        data.push({
          symbol,
          timestamp: date,
          open: basePrice * randomFactor,
          high: basePrice * randomFactor * 1.02,
          low: basePrice * randomFactor * 0.98,
          close: basePrice * randomFactor,
          volume: 1000000 + Math.random() * 500000
        });
      }
      mockHistoricalData.set(symbol, data);
    });

    backtestEngine = new BacktestEngine(config, agentConfigs, riskConfig);
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(backtestEngine).toBeDefined();
      
      // Check that event listeners are set up (they should not throw)
      expect(() => {
        backtestEngine.emit('test');
      }).not.toThrow();
    });

    it('should initialize portfolio and risk managers', () => {
      // The constructor should create portfolio and risk managers without error
      expect(backtestEngine).toBeInstanceOf(BacktestEngine);
    });
  });

  describe('Historical Data Loading', () => {
    it('should load historical data successfully', async () => {
      await expect(backtestEngine.loadHistoricalData(mockHistoricalData)).resolves.not.toThrow();
    });

    it('should validate data integrity', async () => {
      // Create invalid data (empty data set)
      const invalidData = new Map<string, MarketData[]>();
      invalidData.set('AAPL', []);
      
      // This should throw an error due to missing data for configured symbols
      await expect(backtestEngine.loadHistoricalData(invalidData)).rejects.toThrow();
    });
  });

  describe('Backtest Execution', () => {
    beforeEach(async () => {
      await backtestEngine.loadHistoricalData(mockHistoricalData);
    });

    it('should run backtest successfully', async () => {
      const startedListener = jest.fn();
      const progressListener = jest.fn();
      const completedListener = jest.fn();
      
      backtestEngine.on('backtestStarted', startedListener);
      backtestEngine.on('backtestProgress', progressListener);
      backtestEngine.on('backtestCompleted', completedListener);

      const result = await backtestEngine.runBacktest();
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.start_date).toEqual(config.startDate);
      expect(result.end_date).toEqual(config.endDate);
      expect(result.initial_capital).toBe(config.initialCapital);
      expect(typeof result.final_capital).toBe('number');
      expect(typeof result.total_return).toBe('number');
      expect(typeof result.sharpe_ratio).toBe('number');
      expect(typeof result.max_drawdown).toBe('number');
      expect(Array.isArray(result.trades)).toBe(true);
      
      expect(startedListener).toHaveBeenCalled();
      expect(progressListener).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: expect.any(Number),
          currentIndex: expect.any(Number)
        })
      );
      expect(completedListener).toHaveBeenCalledWith(result);
    });

    it('should prevent running multiple backtests simultaneously', async () => {
      // Start first backtest
      const firstBacktest = backtestEngine.runBacktest();
      
      // Try to start second backtest immediately
      await expect(backtestEngine.runBacktest()).rejects.toThrow('Backtest is already running');
      
      // Wait for first backtest to complete
      await firstBacktest;
    });

    it('should handle backtest errors gracefully', async () => {
      const errorListener = jest.fn();
      backtestEngine.on('backtestError', errorListener);
      
      // Force an error by providing invalid data - this should fail at loadHistoricalData stage
      await expect(backtestEngine.loadHistoricalData(new Map())).rejects.toThrow('No historical data provided');
      
      // The error listener should NOT be called for data loading errors,
      // only for errors during backtest execution
      expect(errorListener).not.toHaveBeenCalled();
    });

    it('should allow stopping backtest', async () => {
      const stoppedListener = jest.fn();
      backtestEngine.on('backtestStopped', stoppedListener);
      
      // Start backtest and immediately stop it
      const backtestPromise = backtestEngine.runBacktest();
      backtestEngine.stop();
      
      expect(stoppedListener).toHaveBeenCalled();
      
      // The backtest should still complete (though potentially with partial results)
      await expect(backtestPromise).resolves.toBeDefined();
    });
  });

  describe('Parameter Sweep', () => {
    beforeEach(async () => {
      await backtestEngine.loadHistoricalData(mockHistoricalData);
    });

    it('should run parameter sweep', async () => {
      const parameterRanges = new Map([
        ['sma_period', [10, 20, 30]],
        ['rsi_period', [14, 21]]
      ]);

      const progressListener = jest.fn();
      backtestEngine.on('parameterSweepProgress', progressListener);

      const results = await backtestEngine.runParameterSweep(parameterRanges);
      
      expect(results.size).toBe(6); // 3 * 2 = 6 combinations
      expect(progressListener).toHaveBeenCalled();
      
      // Check that all results are valid BacktestResult objects
      for (const [key, result] of results) {
        expect(result.id).toBeDefined();
        expect(result.initial_capital).toBe(config.initialCapital);
        expect(typeof result.total_return).toBe('number');
      }
    });
  });

  describe('Snapshot Management', () => {
    beforeEach(async () => {
      await backtestEngine.loadHistoricalData(mockHistoricalData);
    });

    it('should capture snapshots during backtest', async () => {
      await backtestEngine.runBacktest();
      
      const snapshots = backtestEngine.getSnapshots();
      expect(snapshots.length).toBeGreaterThan(0);
      
      const firstSnapshot = snapshots[0];
      expect(firstSnapshot.timestamp).toBeInstanceOf(Date);
      expect(firstSnapshot.portfolio).toBeDefined();
      expect(firstSnapshot.marketData).toBeInstanceOf(Map);
      expect(Array.isArray(firstSnapshot.signals)).toBe(true);
      expect(Array.isArray(firstSnapshot.trades)).toBe(true);
      expect(firstSnapshot.metrics).toBeDefined();
      expect(typeof firstSnapshot.metrics.totalReturn).toBe('number');
    });

    it('should return limited snapshots when requested', async () => {
      await backtestEngine.runBacktest();
      
      const allSnapshots = backtestEngine.getSnapshots();
      const limitedSnapshots = backtestEngine.getSnapshots(3);
      
      expect(limitedSnapshots.length).toBeLessThanOrEqual(3);
      expect(limitedSnapshots.length).toBeLessThanOrEqual(allSnapshots.length);
      
      if (allSnapshots.length >= 3) {
        expect(limitedSnapshots.length).toBe(3);
        // Should return last 3 snapshots
        expect(limitedSnapshots).toEqual(allSnapshots.slice(-3));
      }
    });

    it('should return current snapshot', async () => {
      // Before running backtest
      expect(backtestEngine.getCurrentSnapshot()).toBeNull();
      
      // After running backtest
      await backtestEngine.runBacktest();
      const currentSnapshot = backtestEngine.getCurrentSnapshot();
      
      expect(currentSnapshot).not.toBeNull();
      expect(currentSnapshot?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Results Management', () => {
    beforeEach(async () => {
      await backtestEngine.loadHistoricalData(mockHistoricalData);
    });

    it('should return null results before backtest', () => {
      expect(backtestEngine.getResults()).toBeNull();
    });

    it('should return valid results after backtest', async () => {
      const result = await backtestEngine.runBacktest();
      const storedResult = backtestEngine.getResults();
      
      expect(storedResult).toEqual(result);
      expect(storedResult?.final_capital).toBeGreaterThan(0);
    });

    it('should calculate performance metrics correctly', async () => {
      const result = await backtestEngine.runBacktest();
      
      // Total return should be calculated correctly
      const expectedReturn = (result.final_capital - result.initial_capital) / result.initial_capital;
      expect(Math.abs(result.total_return - expectedReturn)).toBeLessThan(0.001);
      
      // Max drawdown should be non-negative
      expect(result.max_drawdown).toBeGreaterThanOrEqual(0);
      
      // Win rate should be between 0 and 1
      expect(result.win_rate).toBeGreaterThanOrEqual(0);
      expect(result.win_rate).toBeLessThanOrEqual(1);
      
      // Trade counts should be consistent
      expect(result.total_trades).toBe(result.trades.length);
      expect(result.winning_trades).toBeLessThanOrEqual(result.total_trades);
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await backtestEngine.loadHistoricalData(mockHistoricalData);
    });

    it('should emit all expected events during backtest', async () => {
      const events = {
        backtestStarted: jest.fn(),
        backtestProgress: jest.fn(),
        backtestCompleted: jest.fn(),
        backtestError: jest.fn(),
        backtestStopped: jest.fn()
      };

      // Register all event listeners
      Object.entries(events).forEach(([event, listener]) => {
        backtestEngine.on(event, listener);
      });

      await backtestEngine.runBacktest();
      
      expect(events.backtestStarted).toHaveBeenCalled();
      expect(events.backtestProgress).toHaveBeenCalled();
      expect(events.backtestCompleted).toHaveBeenCalled();
      expect(events.backtestError).not.toHaveBeenCalled();
    });
  });
});