import { BacktestPortfolioTracker, PortfolioSnapshot, PortfolioMetrics } from '../../src/backtesting/BacktestPortfolioTracker';
import { Portfolio, Position, Trade, MarketData } from '../../src/types';

describe('BacktestPortfolioTracker', () => {
  let tracker: BacktestPortfolioTracker;
  let mockPortfolio: Portfolio;
  let mockPositions: Position[];
  let mockTrades: Trade[];

  beforeEach(() => {
    tracker = new BacktestPortfolioTracker(100000);

    mockPositions = [
      {
        symbol: 'AAPL',
        quantity: 100,
        entry_price: 150,
        current_price: 160,
        unrealized_pnl: 1000,
        realized_pnl: 0,
        timestamp: new Date('2023-01-01')
      },
      {
        symbol: 'MSFT',
        quantity: 50,
        entry_price: 300,
        current_price: 310,
        unrealized_pnl: 500,
        realized_pnl: 0,
        timestamp: new Date('2023-01-01')
      }
    ];

    mockPortfolio = {
      id: 'test-portfolio',
      timestamp: new Date('2023-01-01'),
      total_value: 110000,
      cash: 94000,
      positions: mockPositions,
      daily_pnl: 1500,
      total_pnl: 1500
    };

    mockTrades = [
      {
        id: 'trade-1',
        symbol: 'AAPL',
        action: 'BUY',
        quantity: 100,
        price: 150,
        timestamp: new Date('2023-01-01'),
        status: 'FILLED',
        agent_signals: ['signal-1'],
        metadata: { realized_pnl: 500 }
      },
      {
        id: 'trade-2',
        symbol: 'MSFT',
        action: 'BUY',
        quantity: 50,
        price: 300,
        timestamp: new Date('2023-01-02'),
        status: 'FILLED',
        agent_signals: ['signal-2'],
        metadata: { realized_pnl: -200 }
      },
      {
        id: 'trade-3',
        symbol: 'AAPL',
        action: 'SELL',
        quantity: 25,
        price: 155,
        timestamp: new Date('2023-01-03'),
        status: 'FILLED',
        agent_signals: ['signal-3'],
        metadata: { realized_pnl: 125 }
      }
    ];
  });

  describe('Portfolio Updates', () => {
    it('should update portfolio and create snapshot', () => {
      const eventListener = jest.fn();
      tracker.on('portfolioUpdated', eventListener);

      tracker.updatePortfolio(mockPortfolio);

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: mockPortfolio.timestamp,
          portfolio: expect.objectContaining({
            total_value: 110000,
            cash: 94000
          }),
          metrics: expect.any(Object),
          attribution: expect.any(Array)
        })
      );

      const snapshots = tracker.getSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].portfolio.total_value).toBe(110000);
    });

    it('should calculate portfolio metrics correctly', () => {
      tracker.updatePortfolio(mockPortfolio);

      const latestSnapshot = tracker.getLatestSnapshot();
      expect(latestSnapshot).not.toBeNull();
      expect(latestSnapshot!.metrics).toBeDefined();
      expect(latestSnapshot!.metrics.totalReturn).toBe(0.1); // (110000 - 100000) / 100000
      expect(latestSnapshot!.metrics.cumulativeReturn).toBe(0.1);
    });

    it('should calculate position attribution correctly', () => {
      tracker.updatePortfolio(mockPortfolio);

      const latestSnapshot = tracker.getLatestSnapshot();
      expect(latestSnapshot!.attribution).toHaveLength(2);

      const aaplAttribution = latestSnapshot!.attribution.find(a => a.symbol === 'AAPL');
      expect(aaplAttribution).toBeDefined();
      expect(aaplAttribution!.weight).toBeCloseTo(16000 / 110000); // (100 * 160) / 110000
      expect(aaplAttribution!.return).toBeCloseTo((160 - 150) / 150); // (current - entry) / entry
      expect(aaplAttribution!.pnl).toBe(1000); // unrealized + realized
    });

    it('should track multiple portfolio updates', () => {
      // First update
      tracker.updatePortfolio(mockPortfolio);

      // Second update with different values
      const updatedPortfolio = {
        ...mockPortfolio,
        timestamp: new Date('2023-01-02'),
        total_value: 115000,
        cash: 95000
      };

      tracker.updatePortfolio(updatedPortfolio);

      const snapshots = tracker.getSnapshots();
      expect(snapshots).toHaveLength(2);
      expect(snapshots[1].portfolio.total_value).toBe(115000);
    });
  });

  describe('Trade Tracking', () => {
    it('should add trades and emit events', () => {
      const eventListener = jest.fn();
      tracker.on('tradeAdded', eventListener);

      tracker.addTrade(mockTrades[0]);

      expect(eventListener).toHaveBeenCalledWith(mockTrades[0]);
    });

    it('should track trade history', () => {
      mockTrades.forEach(trade => tracker.addTrade(trade));

      // Access trade history through portfolio updates that trigger metric calculations
      tracker.updatePortfolio(mockPortfolio);
      const snapshot = tracker.getLatestSnapshot();
      
      expect(snapshot!.metrics.totalTrades).toBe(3);
      expect(snapshot!.metrics.winningTrades).toBe(2); // trades with positive P&L
      expect(snapshot!.metrics.losingTrades).toBe(1); // trades with negative P&L
    });
  });

  describe('Metrics Calculation', () => {
    beforeEach(() => {
      // Add some trades for metric calculations
      mockTrades.forEach(trade => tracker.addTrade(trade));
      
      // Add multiple portfolio snapshots to calculate returns
      const portfolios = [
        { ...mockPortfolio, timestamp: new Date('2023-01-01'), total_value: 100000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-02'), total_value: 105000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-03'), total_value: 110000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-04'), total_value: 108000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-05'), total_value: 115000 }
      ];

      portfolios.forEach(portfolio => tracker.updatePortfolio(portfolio));
    });

    it('should calculate total and cumulative returns', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(latestSnapshot.metrics.totalReturn).toBe(0.15); // (115000 - 100000) / 100000
      expect(latestSnapshot.metrics.cumulativeReturn).toBe(0.15);
    });

    it('should calculate daily returns', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      // Daily return should be a valid number
      expect(typeof latestSnapshot.metrics.dailyReturn).toBe('number');
      expect(latestSnapshot.metrics.dailyReturn).toBeGreaterThan(-1); // Should be > -100%
      expect(latestSnapshot.metrics.dailyReturn).toBeLessThan(10); // Should be < 1000%
    });

    it('should calculate volatility', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(latestSnapshot.metrics.volatility).toBeGreaterThan(0);
      expect(typeof latestSnapshot.metrics.volatility).toBe('number');
    });

    it('should calculate Sharpe ratio', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(typeof latestSnapshot.metrics.sharpeRatio).toBe('number');
    });

    it('should calculate Sortino ratio', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(typeof latestSnapshot.metrics.sortinoRatio).toBe('number');
    });

    it('should calculate maximum drawdown', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      // Max drawdown should be calculated from the peak to trough
      // Peak: 110000, Trough: 108000 => (110000 - 108000) / 110000
      expect(latestSnapshot.metrics.maxDrawdown).toBeCloseTo((110000 - 108000) / 110000);
    });

    it('should calculate current drawdown', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(latestSnapshot.metrics.currentDrawdown).toBeGreaterThanOrEqual(0);
      expect(typeof latestSnapshot.metrics.currentDrawdown).toBe('number');
    });

    it('should calculate win rate', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      // 2 winning trades out of 3 total = 66.67%
      expect(latestSnapshot.metrics.winRate).toBeCloseTo(2/3);
    });

    it('should calculate profit factor', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      // Total profits: 500 + 125 = 625, Total losses: 200
      expect(latestSnapshot.metrics.profitFactor).toBeCloseTo(625 / 200);
    });

    it('should calculate average win and loss', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      // Average win: (500 + 125) / 2 = 312.5
      expect(latestSnapshot.metrics.averageWin).toBeCloseTo(312.5);
      
      // Average loss: 200 / 1 = 200
      expect(latestSnapshot.metrics.averageLoss).toBeCloseTo(200);
    });

    it('should calculate largest win and loss', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(latestSnapshot.metrics.largestWin).toBe(500);
      expect(latestSnapshot.metrics.largestLoss).toBe(-200);
    });
  });

  describe('Time Series Data', () => {
    beforeEach(() => {
      const portfolios = [
        { ...mockPortfolio, timestamp: new Date('2023-01-01'), total_value: 100000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-02'), total_value: 105000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-03'), total_value: 110000 }
      ];

      portfolios.forEach(portfolio => tracker.updatePortfolio(portfolio));
    });

    it('should return metrics time series', () => {
      const timeSeries = tracker.getMetricsTimeSeries();
      
      expect(timeSeries).toHaveLength(3);
      expect(timeSeries[0]).toHaveProperty('timestamp');
      expect(timeSeries[0]).toHaveProperty('metrics');
      expect(timeSeries[0].metrics).toHaveProperty('totalReturn');
    });

    it('should return returns time series', () => {
      const returnsSeries = tracker.getReturnsTimeSeries();
      
      expect(returnsSeries).toHaveLength(3);
      expect(returnsSeries[0]).toHaveProperty('timestamp');
      expect(returnsSeries[0]).toHaveProperty('return');
      expect(returnsSeries[0]).toHaveProperty('cumulativeReturn');
    });

    it('should return drawdown time series', () => {
      const drawdownSeries = tracker.getDrawdownTimeSeries();
      
      expect(drawdownSeries).toHaveLength(3);
      expect(drawdownSeries[0]).toHaveProperty('timestamp');
      expect(drawdownSeries[0]).toHaveProperty('drawdown');
    });

    it('should return position attribution history', () => {
      const aaplHistory = tracker.getPositionAttributionHistory('AAPL');
      
      expect(aaplHistory).toHaveLength(3); // Present in all 3 snapshots
      expect(aaplHistory[0]).toHaveProperty('symbol', 'AAPL');
      expect(aaplHistory[0]).toHaveProperty('weight');
      expect(aaplHistory[0]).toHaveProperty('return');
    });
  });

  describe('Benchmark Comparison', () => {
    beforeEach(() => {
      // Set benchmark returns for comparison
      const benchmarkReturns = [0.01, 0.02, -0.01, 0.015]; // Daily benchmark returns
      tracker.setBenchmarkReturns(benchmarkReturns);

      const portfolios = [
        { ...mockPortfolio, timestamp: new Date('2023-01-01'), total_value: 100000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-02'), total_value: 105000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-03'), total_value: 110000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-04'), total_value: 108000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-05'), total_value: 115000 }
      ];

      portfolios.forEach(portfolio => tracker.updatePortfolio(portfolio));
    });

    it('should calculate beta', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(typeof latestSnapshot.metrics.beta).toBe('number');
    });

    it('should calculate alpha', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(typeof latestSnapshot.metrics.alpha).toBe('number');
    });

    it('should calculate information ratio', () => {
      const latestSnapshot = tracker.getLatestSnapshot()!;
      
      expect(typeof latestSnapshot.metrics.informationRatio).toBe('number');
    });
  });

  describe('CSV Export', () => {
    beforeEach(() => {
      const portfolios = [
        { ...mockPortfolio, timestamp: new Date('2023-01-01'), total_value: 100000, cash: 90000 },
        { ...mockPortfolio, timestamp: new Date('2023-01-02'), total_value: 105000, cash: 95000 }
      ];

      portfolios.forEach(portfolio => tracker.updatePortfolio(portfolio));
    });

    it('should export portfolio data to CSV format', () => {
      const csv = tracker.exportToCSV();
      
      expect(csv).toContain('timestamp,total_value,cash');
      expect(csv).toContain('2023-01-01');
      expect(csv).toContain('100000.00');
      expect(csv).toContain('90000.00');
    });

    it('should include calculated metrics in CSV', () => {
      const csv = tracker.exportToCSV();
      
      expect(csv).toContain('daily_return');
      expect(csv).toContain('cumulative_return');
      expect(csv).toContain('drawdown');
      expect(csv).toContain('sharpe_ratio');
      expect(csv).toContain('volatility');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty portfolio', () => {
      const emptyPortfolio: Portfolio = {
        id: 'empty',
        timestamp: new Date(),
        total_value: 100000,
        cash: 100000,
        positions: [],
        daily_pnl: 0,
        total_pnl: 0
      };

      tracker.updatePortfolio(emptyPortfolio);
      
      const snapshot = tracker.getLatestSnapshot()!;
      expect(snapshot.attribution).toHaveLength(0);
      expect(snapshot.metrics.totalReturn).toBe(0);
    });

    it('should handle single snapshot', () => {
      tracker.updatePortfolio(mockPortfolio);
      
      const snapshot = tracker.getLatestSnapshot()!;
      expect(snapshot.metrics.dailyReturn).toBe(0); // No previous snapshot
      expect(snapshot.metrics.volatility).toBe(0); // Insufficient data
    });

    it('should handle no trades', () => {
      tracker.updatePortfolio(mockPortfolio);
      
      const snapshot = tracker.getLatestSnapshot()!;
      expect(snapshot.metrics.totalTrades).toBe(0);
      expect(snapshot.metrics.winRate).toBe(0);
      expect(snapshot.metrics.averageWin).toBe(0);
      expect(snapshot.metrics.averageLoss).toBe(0);
    });

    it('should handle portfolio with no positions', () => {
      const noPositionsPortfolio = {
        ...mockPortfolio,
        positions: [],
        total_value: 100000,
        cash: 100000
      };

      tracker.updatePortfolio(noPositionsPortfolio);
      
      const snapshot = tracker.getLatestSnapshot()!;
      expect(snapshot.attribution).toHaveLength(0);
    });

    it('should return null for latest snapshot when no updates', () => {
      const snapshot = tracker.getLatestSnapshot();
      expect(snapshot).toBeNull();
    });

    it('should return empty array for snapshots when no updates', () => {
      const snapshots = tracker.getSnapshots();
      expect(snapshots).toHaveLength(0);
    });

    it('should handle position attribution for non-existent symbol', () => {
      tracker.updatePortfolio(mockPortfolio);
      
      const history = tracker.getPositionAttributionHistory('NONEXISTENT');
      expect(history).toHaveLength(0);
    });
  });

  describe('Position History Tracking', () => {
    it('should track position history across updates', () => {
      // First update
      tracker.updatePortfolio(mockPortfolio);

      // Second update with modified positions
      const updatedPositions = [
        {
          ...mockPositions[0],
          current_price: 170, // Price increased
          unrealized_pnl: 2000
        },
        mockPositions[1] // MSFT unchanged
      ];

      const updatedPortfolio = {
        ...mockPortfolio,
        timestamp: new Date('2023-01-02'),
        positions: updatedPositions
      };

      tracker.updatePortfolio(updatedPortfolio);

      const aaplHistory = tracker.getPositionAttributionHistory('AAPL');
      expect(aaplHistory).toHaveLength(2);
      expect(aaplHistory[0].currentPrice).toBe(160);
      expect(aaplHistory[1].currentPrice).toBe(170);
    });
  });
});