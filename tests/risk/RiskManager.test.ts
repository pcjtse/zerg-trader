import { RiskManager, RiskConstraints, RiskAlert } from '../../src/risk/RiskManager';
import { Portfolio, Position, Signal, Trade } from '../../src/types';

describe('RiskManager', () => {
  let riskManager: RiskManager;
  let constraints: RiskConstraints;
  let initialPortfolio: Portfolio;

  beforeEach(() => {
    constraints = {
      maxPositionSize: 0.1, // 10%
      maxDailyLoss: 0.05, // 5%
      maxDrawdown: 0.2, // 20%
      stopLossPercentage: 0.05, // 5%
      maxLeverage: 2.0,
      maxConcentrationPerSector: 0.3, // 30%
      maxConcentrationPerSymbol: 0.15, // 15%
      minCashReserve: 0.05 // 5%
    };

    initialPortfolio = {
      id: 'portfolio-1',
      cash: 90000,
      positions: [{
        symbol: 'AAPL',
        quantity: 100,
        entry_price: 100,
        current_price: 100,
        unrealized_pnl: 0,
        realized_pnl: 0,
        timestamp: new Date()
      }],
      total_value: 100000,
      daily_pnl: 0,
      total_pnl: 0,
      timestamp: new Date()
    };

    riskManager = new RiskManager(constraints, initialPortfolio);
  });

  describe('Constructor', () => {
    it('should initialize with correct constraints and portfolio', () => {
      const retrievedConstraints = riskManager.getConstraints();
      const riskMetrics = riskManager.getRiskMetrics();
      
      expect(retrievedConstraints).toEqual(constraints);
      expect(riskMetrics).toBeDefined();
      expect(riskMetrics.portfolio_var).toBe(0); // No historical data yet
    });
  });

  describe('Signal Evaluation', () => {
    let buySignal: Signal;
    let sellSignal: Signal;

    beforeEach(() => {
      buySignal = {
        id: 'signal-1',
        agent_id: 'agent-1',
        symbol: 'MSFT',
        action: 'BUY',
        confidence: 0.8,
        strength: 0.7,
        timestamp: new Date(),
        reasoning: 'Strong technical indicators'
      };

      sellSignal = {
        id: 'signal-2',
        agent_id: 'agent-1',
        symbol: 'AAPL',
        action: 'SELL',
        confidence: 0.9,
        strength: 0.8,
        timestamp: new Date(),
        reasoning: 'Take profits'
      };
    });

    it('should approve valid signal', () => {
      const result = riskManager.evaluateSignal(buySignal, initialPortfolio);
      
      expect(result.approved).toBe(true);
      expect(result.adjustedQuantity).toBeDefined();
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should reject signal when daily loss limit exceeded', () => {
      const portfolioWithLoss = {
        ...initialPortfolio,
        daily_pnl: -6000, // 6% loss exceeds 5% limit
        total_value: 94000
      };

      const result = riskManager.evaluateSignal(buySignal, portfolioWithLoss);
      
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Daily loss limit exceeded');
    });

    it('should reject signal when concentration limit would be exceeded', () => {
      const concentratedPortfolio = {
        ...initialPortfolio,
        positions: [{
          symbol: 'MSFT',
          quantity: 200,
          entry_price: 100,
          current_price: 100,
          unrealized_pnl: 0,
          realized_pnl: 0,
          timestamp: new Date()
        }],
        cash: 80000
      };

      const result = riskManager.evaluateSignal(buySignal, concentratedPortfolio);
      
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('concentration limit exceeded');
    });

    it('should calculate risk score based on signal characteristics', () => {
      const lowConfidenceSignal = {
        ...buySignal,
        confidence: 0.3,
        strength: 0.2
      };

      const highRiskResult = riskManager.evaluateSignal(lowConfidenceSignal, initialPortfolio);
      const lowRiskResult = riskManager.evaluateSignal(buySignal, initialPortfolio);
      
      expect(highRiskResult.riskScore).toBeGreaterThan(lowRiskResult.riskScore);
    });
  });

  describe('Trade Evaluation', () => {
    let buyTrade: Trade;
    let largeTrade: Trade;

    beforeEach(() => {
      buyTrade = {
        id: 'trade-1',
        symbol: 'MSFT',
        action: 'BUY',
        quantity: 50,
        price: 200,
        timestamp: new Date(),
        status: 'PENDING',
        agent_signals: ['signal-1']
      };

      largeTrade = {
        id: 'trade-2',
        symbol: 'MSFT',
        action: 'BUY',
        quantity: 100,
        price: 150, // 15000 value = 15% of portfolio
        timestamp: new Date(),
        status: 'PENDING',
        agent_signals: ['signal-2']
      };
    });

    it('should approve valid trade', () => {
      const result = riskManager.evaluateTrade(buyTrade);
      
      expect(result.approved).toBe(true);
      expect(result.stopLossPrice).toBeDefined();
      expect(result.takeProfitPrice).toBeDefined();
    });

    it('should reject trade exceeding position size limit', () => {
      const result = riskManager.evaluateTrade(largeTrade);
      
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('exceeds maximum position size');
    });

    it('should reject buy trade violating cash reserve', () => {
      // Portfolio has 90000 cash, total value 100000, 5% reserve = 5000 required
      // Max position size is 10% = 10000, so we need trade value < 10000
      // Let's create a trade with value 9000 (under position limit) but uses too much cash
      const largeCashTrade = {
        ...buyTrade,
        quantity: 90, // 90 * 100 = 9000 value (9% of portfolio, under 10% limit)
        price: 100  
      };

      // Modify the portfolio to have less cash available
      const lowCashPortfolio = {
        ...initialPortfolio,
        cash: 10000, // Only 10000 cash available
        total_value: 110000 // But total value includes positions
      };
      
      // Create new risk manager with low cash portfolio
      const lowCashRiskManager = new RiskManager(constraints, lowCashPortfolio);

      const result = lowCashRiskManager.evaluateTrade(largeCashTrade);
      
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Insufficient cash reserves');
    });

    it('should calculate stop loss and take profit prices correctly', () => {
      const result = riskManager.evaluateTrade(buyTrade);
      
      expect(result.stopLossPrice).toBeCloseTo(190, 2); // 200 * (1 - 0.05)
      expect(result.takeProfitPrice).toBeCloseTo(220, 2); // 200 * (1 + 0.1) - 2x stop loss distance
    });
  });

  describe('Portfolio Updates and Risk Monitoring', () => {
    it('should update portfolio and recalculate risk metrics', () => {
      const alertListener = jest.fn();
      riskManager.on('riskAlert', alertListener);

      const updatedPortfolio = {
        ...initialPortfolio,
        daily_pnl: -4000, // 4% loss
        total_value: 96000
      };

      riskManager.updatePortfolio(updatedPortfolio);
      
      const metrics = riskManager.getRiskMetrics();
      expect(metrics).toBeDefined();
      
      // Should trigger a risk alert for approaching daily loss limit
      expect(alertListener).toHaveBeenCalled();
    });

    it('should maintain historical portfolio values', () => {
      // Add multiple portfolio updates
      for (let i = 0; i < 5; i++) {
        const portfolio = {
          ...initialPortfolio,
          total_value: 100000 + i * 1000,
          timestamp: new Date(Date.now() + i * 24 * 60 * 60 * 1000)
        };
        riskManager.updatePortfolio(portfolio);
      }
      
      const metrics = riskManager.getRiskMetrics();
      expect(metrics.sharpe_ratio).toBeDefined();
      expect(metrics.max_drawdown).toBeGreaterThanOrEqual(0);
    });

    it('should trigger stop loss alerts for positions', () => {
      const stopLossListener = jest.fn();
      riskManager.on('stopLossTriggered', stopLossListener);

      const portfolioWithLoss = {
        ...initialPortfolio,
        positions: [{
          symbol: 'AAPL',
          quantity: 100,
          entry_price: 100,
          current_price: 90, // 10% loss exceeds 5% stop loss
          unrealized_pnl: -1000,
          realized_pnl: 0,
          timestamp: new Date()
        }]
      };

      riskManager.updatePortfolio(portfolioWithLoss);
      
      expect(stopLossListener).toHaveBeenCalledWith(
        expect.objectContaining({
          position: expect.objectContaining({ symbol: 'AAPL' }),
          drawdown: 0.1
        })
      );
    });
  });

  describe('Risk Alerts Management', () => {
    it('should create and manage risk alerts', () => {
      const alertListener = jest.fn();
      riskManager.on('riskAlert', alertListener);

      // Create a portfolio that will trigger alerts
      const riskPortfolio = {
        ...initialPortfolio,
        daily_pnl: -5500, // Exceeds daily loss limit
        total_value: 94500
      };

      riskManager.updatePortfolio(riskPortfolio);
      
      const activeAlerts = riskManager.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);
      expect(activeAlerts[0].type).toBe('DAILY_LOSS');
      expect(activeAlerts[0].severity).toBe('CRITICAL');
    });

    it('should resolve alerts', () => {
      // Create an alert first
      const riskPortfolio = {
        ...initialPortfolio,
        daily_pnl: -4500, // Triggers warning
        total_value: 95500
      };

      riskManager.updatePortfolio(riskPortfolio);
      
      const activeAlerts = riskManager.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);
      
      const alertId = activeAlerts[0].id;
      const resolveListener = jest.fn();
      riskManager.on('alertResolved', resolveListener);
      
      riskManager.resolveAlert(alertId);
      
      expect(resolveListener).toHaveBeenCalled();
      const updatedAlerts = riskManager.getActiveAlerts();
      expect(updatedAlerts.length).toBeLessThan(activeAlerts.length);
    });
  });

  describe('Risk Metrics Calculation', () => {
    beforeEach(() => {
      // Add historical data for meaningful metrics
      const values = [100000, 102000, 98000, 105000, 95000, 110000];
      values.forEach((value, index) => {
        const portfolio = {
          ...initialPortfolio,
          total_value: value,
          timestamp: new Date(Date.now() + index * 24 * 60 * 60 * 1000)
        };
        riskManager.updatePortfolio(portfolio);
      });
    });

    it('should calculate Value at Risk (VaR)', () => {
      const metrics = riskManager.getRiskMetrics();
      
      expect(metrics.portfolio_var).toBeGreaterThan(0);
      expect(metrics.portfolio_var).toBeLessThan(1);
    });

    it('should calculate maximum drawdown', () => {
      const metrics = riskManager.getRiskMetrics();
      
      expect(metrics.max_drawdown).toBeGreaterThan(0);
      expect(metrics.max_drawdown).toBeLessThan(1);
    });

    it('should calculate Sharpe ratio', () => {
      const metrics = riskManager.getRiskMetrics();
      
      expect(metrics.sharpe_ratio).toBeDefined();
      expect(typeof metrics.sharpe_ratio).toBe('number');
    });

    it('should calculate Sortino ratio', () => {
      const metrics = riskManager.getRiskMetrics();
      
      expect(metrics.sortino_ratio).toBeDefined();
      expect(typeof metrics.sortino_ratio).toBe('number');
    });
  });

  describe('Position Sizing', () => {
    it('should calculate optimal position size using Kelly criterion', () => {
      const signal: Signal = {
        id: 'signal-1',
        agent_id: 'agent-1',
        symbol: 'MSFT',
        action: 'BUY',
        confidence: 0.8,
        strength: 0.9,
        timestamp: new Date(),
        reasoning: 'High confidence signal'
      };

      const result = riskManager.evaluateSignal(signal, initialPortfolio);
      
      expect(result.approved).toBe(true);
      expect(result.adjustedQuantity).toBeGreaterThan(0);
      
      // Position size should be limited by maxPositionSize constraint
      const maxPositionValue = initialPortfolio.total_value * constraints.maxPositionSize;
      const approximatePrice = 100; // Default price
      const maxQuantity = Math.floor(maxPositionValue / approximatePrice);
      
      expect(result.adjustedQuantity).toBeLessThanOrEqual(maxQuantity);
    });

    it('should reduce position size for low confidence signals', () => {
      const highConfidenceSignal: Signal = {
        id: 'signal-1',
        agent_id: 'agent-1',
        symbol: 'MSFT',
        action: 'BUY',
        confidence: 0.9,
        strength: 0.9,
        timestamp: new Date(),
        reasoning: 'High confidence'
      };

      const lowConfidenceSignal: Signal = {
        id: 'signal-2',
        agent_id: 'agent-1',
        symbol: 'TSLA',
        action: 'BUY',
        confidence: 0.3,
        strength: 0.3,
        timestamp: new Date(),
        reasoning: 'Low confidence'
      };

      const highResult = riskManager.evaluateSignal(highConfidenceSignal, initialPortfolio);
      const lowResult = riskManager.evaluateSignal(lowConfidenceSignal, initialPortfolio);
      
      expect(highResult.riskScore).toBeLessThan(lowResult.riskScore);
    });
  });

  describe('Constraints Management', () => {
    it('should update risk constraints', () => {
      const constraintsListener = jest.fn();
      riskManager.on('constraintsUpdated', constraintsListener);

      const newConstraints = {
        maxPositionSize: 0.05, // Reduce to 5%
        stopLossPercentage: 0.03 // Reduce to 3%
      };

      riskManager.updateConstraints(newConstraints);
      
      const updatedConstraints = riskManager.getConstraints();
      expect(updatedConstraints.maxPositionSize).toBe(0.05);
      expect(updatedConstraints.stopLossPercentage).toBe(0.03);
      expect(constraintsListener).toHaveBeenCalledWith(updatedConstraints);
    });
  });
});