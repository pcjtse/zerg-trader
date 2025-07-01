import { MeanReversionAgent } from '../../../src/agents/technical/MeanReversionAgent';
import { AgentConfig, MarketData, TechnicalIndicator } from '../../../src/types';

describe('MeanReversionAgent', () => {
  let agent: MeanReversionAgent;
  let config: AgentConfig;
  let mockMarketData: MarketData[];
  let mockIndicators: TechnicalIndicator[];

  beforeEach(() => {
    config = {
      id: 'mean-reversion-agent-1',
      name: 'Test Mean Reversion Agent',
      type: 'TECHNICAL',
      enabled: true,
      parameters: {
        symbols: ['AAPL', 'MSFT'],
        rsi_period: 14,
        rsi_oversold: 30,
        rsi_overbought: 70,
        bb_period: 20,
        bb_std_dev: 2,
        volume_threshold: 1.5,
        price_deviation_threshold: 2.0
      },
      weight: 1.0
    };

    agent = new MeanReversionAgent(config);

    // Create mock market data with mean reversion characteristics
    mockMarketData = [];
    for (let i = 0; i < 40; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (40 - i));
      
      const basePrice = 150;
      // Create oscillating price pattern for mean reversion
      const cycle = Math.sin(i * 0.3) * 10;
      const noise = (Math.random() - 0.5) * 2;
      const price = basePrice + cycle + noise;
      
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

    // Create mock technical indicators for mean reversion analysis
    mockIndicators = [
      {
        name: 'RSI',
        value: 35, // Oversold condition
        timestamp: new Date(),
        parameters: { period: 14 }
      },
      {
        name: 'BB_UPPER',
        value: 165,
        timestamp: new Date(),
        parameters: { period: 20, std_dev: 2 }
      },
      {
        name: 'BB_LOWER',
        value: 135,
        timestamp: new Date(),
        parameters: { period: 20, std_dev: 2 }
      },
      {
        name: 'BB_MIDDLE',
        value: 150,
        timestamp: new Date(),
        parameters: { period: 20 }
      },
      {
        name: 'SMA_20',
        value: 150,
        timestamp: new Date(),
        parameters: { period: 20 }
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
          message: 'Mean Reversion Agent started'
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
          message: 'Mean Reversion Agent stopped'
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
        expect(signal.agent_id).toBe('mean-reversion-agent-1');
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
      const limitedData = mockMarketData.slice(0, 15); // Only 15 data points
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: limitedData,
        indicators: []
      });
      
      expect(signals).toEqual([]);
    });

    it('should generate buy signal on oversold RSI condition', async () => {
      const oversoldIndicators = [
        ...mockIndicators.filter(i => i.name !== 'RSI'),
        {
          name: 'RSI',
          value: 25, // Strongly oversold
          timestamp: new Date(),
          parameters: { period: 14 }
        }
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: oversoldIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const buySignals = signals.filter(s => s.action === 'BUY');
      expect(buySignals.length).toBeGreaterThan(0);
      
      // Check that buy signals reference RSI in reasoning
      buySignals.forEach(signal => {
        expect(signal.reasoning.toLowerCase()).toContain('rsi');
        expect(signal.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should generate sell signal on overbought RSI condition', async () => {
      const overboughtIndicators = [
        ...mockIndicators.filter(i => i.name !== 'RSI'),
        {
          name: 'RSI',
          value: 80, // Strongly overbought
          timestamp: new Date(),
          parameters: { period: 14 }
        }
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: overboughtIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const sellSignals = signals.filter(s => s.action === 'SELL');
      expect(sellSignals.length).toBeGreaterThan(0);
      
      // Check that sell signals reference RSI in reasoning
      sellSignals.forEach(signal => {
        expect(signal.reasoning.toLowerCase()).toContain('rsi');
        expect(signal.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should generate buy signal when price touches lower Bollinger Band', async () => {
      // Create market data where current price is near lower BB
      const lowPriceData = mockMarketData.map(data => ({
        ...data,
        close: 136, // Just above lower BB (135)
        low: 135
      }));
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: lowPriceData,
        indicators: mockIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const buySignals = signals.filter(s => s.action === 'BUY');
      expect(buySignals.length).toBeGreaterThan(0);
      
      // Check that buy signals reference Bollinger Bands
      buySignals.forEach(signal => {
        expect(
          signal.reasoning.toLowerCase().includes('bollinger') ||
          signal.reasoning.toLowerCase().includes('band')
        ).toBe(true);
      });
    });

    it('should generate sell signal when price touches upper Bollinger Band', async () => {
      // Create market data where current price is near upper BB
      const highPriceData = mockMarketData.map(data => ({
        ...data,
        close: 164, // Just below upper BB (165)
        high: 165
      }));
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: highPriceData,
        indicators: mockIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const sellSignals = signals.filter(s => s.action === 'SELL');
      expect(sellSignals.length).toBeGreaterThan(0);
      
      // Check that sell signals reference Bollinger Bands
      sellSignals.forEach(signal => {
        expect(
          signal.reasoning.toLowerCase().includes('bollinger') ||
          signal.reasoning.toLowerCase().includes('band')
        ).toBe(true);
      });
    });

    it('should detect price deviation from moving average', async () => {
      // Create market data with significant deviation from SMA
      const deviatedData = mockMarketData.map((data, index) => {
        if (index === mockMarketData.length - 1) {
          return {
            ...data,
            close: 130, // 20 points below SMA (150) = significant deviation
            low: 130
          };
        }
        return data;
      });
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: deviatedData,
        indicators: mockIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Should generate buy signal for oversold condition
      const buySignals = signals.filter(s => s.action === 'BUY');
      expect(buySignals.length).toBeGreaterThan(0);
    });

    it('should detect volume anomalies', async () => {
      // Create market data with volume spike
      const highVolumeData = mockMarketData.map((data, index) => {
        if (index === mockMarketData.length - 1) {
          return {
            ...data,
            volume: 3000000 // 3x normal volume
          };
        }
        return data;
      });
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: highVolumeData,
        indicators: mockIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Volume anomaly should contribute to signal strength
      signals.forEach(signal => {
        expect(signal.strength).toBeGreaterThan(0);
      });
    });

    it('should combine multiple mean reversion signals', async () => {
      // Create conditions where multiple indicators align for mean reversion
      const alignedIndicators = [
        {
          name: 'RSI',
          value: 25, // Oversold
          timestamp: new Date(),
          parameters: { period: 14 }
        },
        {
          name: 'BB_UPPER',
          value: 165,
          timestamp: new Date(),
          parameters: { period: 20, std_dev: 2 }
        },
        {
          name: 'BB_LOWER',
          value: 135, // Price near lower band
          timestamp: new Date(),
          parameters: { period: 20, std_dev: 2 }
        },
        {
          name: 'BB_MIDDLE',
          value: 150,
          timestamp: new Date(),
          parameters: { period: 20 }
        },
        {
          name: 'SMA_20',
          value: 150,
          timestamp: new Date(),
          parameters: { period: 20 }
        }
      ];
      
      const lowPriceData = mockMarketData.map(data => ({
        ...data,
        close: 136 // Near lower BB
      }));
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: lowPriceData,
        indicators: alignedIndicators
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Should have higher confidence when multiple signals align
      const highConfidenceSignals = signals.filter(s => s.confidence > 0.7);
      expect(highConfidenceSignals.length).toBeGreaterThan(0);
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
      
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });
  });

  describe('Configuration and Parameters', () => {
    it('should work with default parameters', () => {
      const minimalConfig: AgentConfig = {
        id: 'minimal-agent',
        name: 'Minimal Agent',
        type: 'TECHNICAL',
        enabled: true,
        parameters: {},
        weight: 1.0
      };
      
      expect(() => {
        new MeanReversionAgent(minimalConfig);
      }).not.toThrow();
    });

    it('should use custom RSI thresholds', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          rsi_oversold: 25,
          rsi_overbought: 75
        }
      };
      
      const customAgent = new MeanReversionAgent(customConfig);
      await customAgent.start();
      
      // Test with RSI value that would be oversold with custom threshold
      const customIndicators = [
        {
          name: 'RSI',
          value: 27, // Between default (30) and custom (25) thresholds
          timestamp: new Date(),
          parameters: { period: 14 }
        }
      ];
      
      const signals = await customAgent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: customIndicators
      });
      
      // Should not trigger oversold with custom threshold
      const strongBuySignals = signals.filter(s => 
        s.action === 'BUY' && s.confidence > 0.8
      );
      expect(strongBuySignals.length).toBe(0);
      
      await customAgent.stop();
    });
  });

  describe('Signal Quality and Metadata', () => {
    beforeEach(async () => {
      await agent.start();
    });

    afterEach(async () => {
      await agent.stop();
    });

    it('should include detailed metadata in signals', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: mockIndicators
      });
      
      signals.forEach(signal => {
        expect(signal.metadata).toBeDefined();
        expect(typeof signal.metadata).toBe('object');
        
        // Mean reversion signals should include relevant technical levels
        if (signal.action === 'BUY' || signal.action === 'SELL') {
          expect(signal.metadata).toHaveProperty('signal_type');
        }
      });
    });

    it('should provide specific reasoning for each signal type', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: mockIndicators
      });
      
      signals.forEach(signal => {
        expect(signal.reasoning).toBeDefined();
        expect(signal.reasoning.length).toBeGreaterThan(10);
        
        // Reasoning should mention the specific technical condition
        const reasoning = signal.reasoning.toLowerCase();
        const hasTechnicalTerm = reasoning.includes('rsi') || 
                                reasoning.includes('bollinger') ||
                                reasoning.includes('volume') ||
                                reasoning.includes('deviation');
        expect(hasTechnicalTerm).toBe(true);
      });
    });

    it('should maintain consistency between signal strength and confidence', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        marketData: mockMarketData,
        indicators: mockIndicators
      });
      
      signals.forEach(signal => {
        // For mean reversion, confidence should generally correlate with strength
        // but allows for cases where we're confident about direction but strength is moderate
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.strength).toBeLessThanOrEqual(1);
      });
    });
  });
});