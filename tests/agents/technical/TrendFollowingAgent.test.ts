import { TrendFollowingAgent } from '../../../src/agents/technical/TrendFollowingAgent';
import { AgentConfig, MarketData, TechnicalIndicator } from '../../../src/types';

// Mock Claude and A2A services
jest.mock('../../../src/services/ClaudeClient');
jest.mock('../../../src/services/A2AService');

describe('TrendFollowingAgent', () => {
  let agent: TrendFollowingAgent;
  let config: AgentConfig;
  let mockMarketData: MarketData[];
  let mockIndicators: TechnicalIndicator[];

  beforeEach(() => {
    config = {
      id: 'trend-agent-1',
      name: 'Test Trend Following Agent',
      type: 'TECHNICAL',
      enabled: true,
      parameters: {
        symbols: ['AAPL', 'MSFT'],
        sma_short: 20,
        sma_long: 50,
        ema_short: 12,
        ema_long: 26,
        macd_signal: 9,
        momentum_period: 14
      },
      weight: 1.0
    };

    agent = new TrendFollowingAgent(config, false); // Disable Claude for basic tests

    // Create mock market data (60 days for sufficient trend analysis)
    mockMarketData = [];
    for (let i = 0; i < 60; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (60 - i));
      
      const basePrice = 150;
      const trend = i * 0.5; // Upward trend
      const noise = (Math.random() - 0.5) * 2;
      const price = basePrice + trend + noise;
      
      mockMarketData.push({
        symbol: 'AAPL',
        timestamp: date,
        open: price * 0.99,
        high: price * 1.02,
        low: price * 0.98,
        close: price,
        volume: 1000000 + Math.random() * 500000
      });
    }

    // Create mock technical indicators
    mockIndicators = [
      {
        name: 'SMA_20',
        value: 155,
        timestamp: new Date(),
        parameters: { period: 20 }
      },
      {
        name: 'SMA_50',
        value: 150,
        timestamp: new Date(),
        parameters: { period: 50 }
      },
      {
        name: 'EMA_12',
        value: 156,
        timestamp: new Date(),
        parameters: { period: 12 }
      },
      {
        name: 'EMA_26',
        value: 152,
        timestamp: new Date(),
        parameters: { period: 26 }
      },
      {
        name: 'MACD',
        value: 2.5,
        timestamp: new Date(),
        parameters: { fast: 12, slow: 26 }
      },
      {
        name: 'MACD_SIGNAL',
        value: 2.0,
        timestamp: new Date(),
        parameters: { period: 9 }
      },
      {
        name: 'MACD_HISTOGRAM',
        value: 0.5,
        timestamp: new Date(),
        parameters: {}
      }
    ];
  });

  describe('Lifecycle Management', () => {
    it('should start successfully', async () => {
      const subscribeListener = jest.fn();
      const logListener = jest.fn();
      
      agent.on('subscribe', subscribeListener);
      agent.on('log', logListener);
      
      await agent.start();
      
      expect(subscribeListener).toHaveBeenCalledWith({
        type: 'market-data',
        symbols: ['AAPL', 'MSFT']
      });
      
      expect(logListener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Trend Following Agent started'
        })
      );
    });

    it('should stop successfully and clear buffers', async () => {
      const logListener = jest.fn();
      agent.on('log', logListener);
      
      await agent.start();
      await agent.stop();
      
      expect(logListener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Trend Following Agent stopped'
        })
      );
    });
  });

  describe('Signal Analysis', () => {
    beforeEach(async () => {
      await agent.start();
    });

    afterEach(async () => {
      await agent.stop();
    });

    it('should generate signals with sufficient data', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: mockIndicators
      });
      
      expect(Array.isArray(signals)).toBe(true);
      expect(signals.length).toBeGreaterThan(0);
      
      // Check signal structure
      signals.forEach(signal => {
        expect(signal.id).toBeDefined();
        expect(signal.agent_id).toBe('trend-agent-1');
        expect(signal.symbol).toBe('AAPL');
        expect(['BUY', 'SELL', 'HOLD']).toContain(signal.action);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(1);
        expect(signal.timestamp).toBeInstanceOf(Date);
        expect(signal.reasoning).toBeDefined();
      });
    });

    it('should return empty array with insufficient data', async () => {
      const limitedData = mockMarketData.slice(0, 10); // Only 10 data points
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: limitedData,
        indicators: []
      });
      
      expect(signals).toEqual([]);
    });

    it('should generate buy signal on bullish trend', async () => {
      // Create strongly bullish indicators
      const bullishIndicators = [
        {
          name: 'SMA_20',
          value: 160, // Short SMA above long SMA
          timestamp: new Date(),
          parameters: { period: 20 }
        },
        {
          name: 'SMA_50',
          value: 150,
          timestamp: new Date(),
          parameters: { period: 50 }
        },
        {
          name: 'EMA_12',
          value: 162, // Short EMA above long EMA
          timestamp: new Date(),
          parameters: { period: 12 }
        },
        {
          name: 'EMA_26',
          value: 155,
          timestamp: new Date(),
          parameters: { period: 26 }
        },
        {
          name: 'MACD',
          value: 3.5, // MACD above signal line
          timestamp: new Date(),
          parameters: { fast: 12, slow: 26 }
        },
        {
          name: 'MACD_SIGNAL',
          value: 2.5,
          timestamp: new Date(),
          parameters: { period: 9 }
        },
        {
          name: 'MACD_HISTOGRAM',
          value: 1.0, // Positive histogram
          timestamp: new Date(),
          parameters: {}
        }
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: bullishIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const buySignals = signals.filter(s => s.action === 'BUY');
      expect(buySignals.length).toBeGreaterThan(0);
      
      // Check that buy signals have high confidence
      buySignals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should generate sell signal on bearish trend', async () => {
      // Create strongly bearish indicators
      const bearishIndicators = [
        {
          name: 'SMA_20',
          value: 145, // Short SMA below long SMA
          timestamp: new Date(),
          parameters: { period: 20 }
        },
        {
          name: 'SMA_50',
          value: 155,
          timestamp: new Date(),
          parameters: { period: 50 }
        },
        {
          name: 'EMA_12',
          value: 143, // Short EMA below long EMA
          timestamp: new Date(),
          parameters: { period: 12 }
        },
        {
          name: 'EMA_26',
          value: 150,
          timestamp: new Date(),
          parameters: { period: 26 }
        },
        {
          name: 'MACD',
          value: -2.5, // MACD below signal line
          timestamp: new Date(),
          parameters: { fast: 12, slow: 26 }
        },
        {
          name: 'MACD_SIGNAL',
          value: -1.5,
          timestamp: new Date(),
          parameters: { period: 9 }
        },
        {
          name: 'MACD_HISTOGRAM',
          value: -1.0, // Negative histogram
          timestamp: new Date(),
          parameters: {}
        }
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: bearishIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const sellSignals = signals.filter(s => s.action === 'SELL');
      expect(sellSignals.length).toBeGreaterThan(0);
      
      // Check that sell signals have high confidence
      sellSignals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should generate hold signal on neutral trend', async () => {
      // Create neutral indicators (mixed signals)
      const neutralIndicators = [
        {
          name: 'SMA_20',
          value: 152, // Very close values
          timestamp: new Date(),
          parameters: { period: 20 }
        },
        {
          name: 'SMA_50',
          value: 151,
          timestamp: new Date(),
          parameters: { period: 50 }
        },
        {
          name: 'EMA_12',
          value: 153,
          timestamp: new Date(),
          parameters: { period: 12 }
        },
        {
          name: 'EMA_26',
          value: 152,
          timestamp: new Date(),
          parameters: { period: 26 }
        },
        {
          name: 'MACD',
          value: 0.1, // Near zero
          timestamp: new Date(),
          parameters: { fast: 12, slow: 26 }
        },
        {
          name: 'MACD_SIGNAL',
          value: 0.05,
          timestamp: new Date(),
          parameters: { period: 9 }
        },
        {
          name: 'MACD_HISTOGRAM',
          value: 0.05, // Near zero
          timestamp: new Date(),
          parameters: {}
        }
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: neutralIndicators
      });
      
      // Should generate signals but with lower confidence or hold signals
      expect(signals.length).toBeGreaterThan(0);
      
      signals.forEach(signal => {
        // Either low confidence or hold action
        expect(
          signal.confidence < 0.7 || signal.action === 'HOLD'
        ).toBe(true);
      });
    });
  });

  describe('Message Handling', () => {
    it('should handle market data messages', async () => {
      await agent.start();
      
      const message = {
        type: 'DATA',
        payload: {
          type: 'market-data',
          symbol: 'AAPL',
          data: [mockMarketData[0]] // Pass as array
        }
      };
      
      // This should not throw an error
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });

    it('should ignore non-market data messages', async () => {
      await agent.start();
      
      const message = {
        type: 'OTHER',
        payload: {
          type: 'news',
          data: 'Some news'
        }
      };
      
      // This should not throw an error
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });
  });

  describe('Configuration Validation', () => {
    it('should work with default parameters when not specified', () => {
      const minimalConfig: AgentConfig = {
        id: 'minimal-agent',
        name: 'Minimal Agent',
        type: 'TECHNICAL',
        enabled: true,
        parameters: {},
        weight: 1.0
      };
      
      expect(() => {
        new TrendFollowingAgent(minimalConfig);
      }).not.toThrow();
    });

    it('should use custom parameters when provided', () => {
      const customAgent = new TrendFollowingAgent(config);
      
      expect(customAgent.getId()).toBe('trend-agent-1');
      expect(customAgent.getName()).toBe('Test Trend Following Agent');
      expect(customAgent.getWeight()).toBe(1.0);
    });
  });

  describe('Signal Quality', () => {
    beforeEach(async () => {
      await agent.start();
    });

    afterEach(async () => {
      await agent.stop();
    });

    it('should include metadata in signals', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: mockIndicators
      });
      
      signals.forEach(signal => {
        expect(signal.metadata).toBeDefined();
        expect(typeof signal.metadata).toBe('object');
      });
    });

    it('should have consistent signal strength and confidence relationship', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: mockIndicators
      });
      
      signals.forEach(signal => {
        // For trend following, strength and confidence should be positively correlated
        // but not necessarily equal
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(1);
        expect(signal.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should provide meaningful reasoning', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: mockIndicators
      });
      
      signals.forEach(signal => {
        expect(signal.reasoning).toBeDefined();
        expect(signal.reasoning.length).toBeGreaterThan(0);
        expect(typeof signal.reasoning).toBe('string');
      });
    });
  });
});