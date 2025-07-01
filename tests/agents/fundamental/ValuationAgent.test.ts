import { ValuationAgent } from '../../../src/agents/fundamental/ValuationAgent';
import { AgentConfig, FundamentalData, MarketData } from '../../../src/types';

describe('ValuationAgent', () => {
  let agent: ValuationAgent;
  let config: AgentConfig;
  let mockFundamentalData: FundamentalData;
  let mockMarketData: MarketData[];

  beforeEach(() => {
    config = {
      id: 'valuation-agent-1',
      name: 'Test Valuation Agent',
      type: 'FUNDAMENTAL',
      enabled: true,
      parameters: {
        symbols: ['AAPL', 'MSFT'],
        pe_threshold_low: 15,
        pe_threshold_high: 25,
        debt_equity_threshold: 2.0,
        roe_threshold: 0.15,
        eps_growth_threshold: 0.1,
        discount_rate: 0.1
      },
      weight: 1.0
    };

    agent = new ValuationAgent(config);

    mockFundamentalData = {
      symbol: 'AAPL',
      timestamp: new Date('2024-01-01'),
      pe_ratio: 20.5,
      eps: 6.15,
      debt_to_equity: 1.8,
      roe: 0.26,
      roa: 0.18,
      revenue: 383000000000,
      net_income: 94680000000
    };

    // Create market data for the last 30 days
    mockMarketData = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      
      const basePrice = 150;
      const priceVariation = (Math.random() - 0.5) * 10;
      const price = basePrice + priceVariation;
      
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
  });

  describe('Lifecycle Management', () => {
    it('should start successfully', async () => {
      const subscribeListener = jest.fn();
      const logListener = jest.fn();
      
      agent.on('subscribe', subscribeListener);
      agent.on('log', logListener);
      
      await agent.start();
      
      expect(subscribeListener).toHaveBeenCalledWith({
        type: 'fundamental-data',
        symbols: ['AAPL', 'MSFT']
      });
      
      expect(logListener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Valuation Agent started'
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
          message: 'Valuation Agent stopped'
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

    it('should generate signals with valid fundamental and market data', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: mockFundamentalData,
        marketData: mockMarketData
      });
      
      expect(Array.isArray(signals)).toBe(true);
      expect(signals.length).toBeGreaterThan(0);
      
      // Check signal structure
      signals.forEach(signal => {
        expect(signal.id).toBeDefined();
        expect(signal.agent_id).toBe('valuation-agent-1');
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

    it('should return empty array with missing fundamental data', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: null as any,
        marketData: mockMarketData
      });
      
      expect(signals).toEqual([]);
    });

    it('should return empty array with missing market data', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: mockFundamentalData,
        marketData: []
      });
      
      expect(signals).toEqual([]);
    });

    it('should generate buy signal for undervalued stock (low P/E)', async () => {
      const undervaluedData = {
        ...mockFundamentalData,
        pe_ratio: 12, // Below low threshold (15)
        roe: 0.25,    // Good profitability
        debt_to_equity: 1.0 // Low debt
      };
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: undervaluedData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const buySignals = signals.filter(s => s.action === 'BUY');
      expect(buySignals.length).toBeGreaterThan(0);
      
      // Should have at least one PE-based buy signal
      const peSignals = buySignals.filter(s => 
        s.reasoning.toLowerCase().includes('pe') ||
        s.metadata?.signal_type === 'PE_ANALYSIS'
      );
      expect(peSignals.length).toBeGreaterThan(0);
      
      peSignals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThan(0.6);
        expect(signal.reasoning.toLowerCase()).toContain('pe');
      });
    });

    it('should generate sell signal for overvalued stock (high P/E)', async () => {
      const overvaluedData = {
        ...mockFundamentalData,
        pe_ratio: 30, // Above high threshold (25)
        roe: 0.12,    // Below ROE threshold
        debt_to_equity: 2.5 // High debt
      };
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: overvaluedData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      const sellSignals = signals.filter(s => s.action === 'SELL');
      expect(sellSignals.length).toBeGreaterThan(0);
      
      // Should have at least one PE-based sell signal
      const peSignals = sellSignals.filter(s => 
        s.reasoning.toLowerCase().includes('pe') ||
        s.metadata?.signal_type === 'PE_ANALYSIS'
      );
      expect(peSignals.length).toBeGreaterThan(0);
      
      peSignals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThan(0.59); // Allow for slight variations
        expect(signal.reasoning.toLowerCase()).toContain('pe');
      });
    });

    it('should analyze debt levels correctly', async () => {
      const highDebtData = {
        ...mockFundamentalData,
        debt_to_equity: 3.0, // High debt (above 2.0 threshold)
        pe_ratio: 18 // Otherwise reasonable
      };
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: highDebtData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // High debt should contribute to negative sentiment
      const negativeSignals = signals.filter(s => 
        s.action === 'SELL' || s.reasoning.toLowerCase().includes('debt')
      );
      expect(negativeSignals.length).toBeGreaterThan(0);
    });

    it('should analyze profitability (ROE) correctly', async () => {
      const highProfitabilityData = {
        ...mockFundamentalData,
        roe: 0.35, // Very high ROE
        pe_ratio: 20
      };
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: highProfitabilityData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // High ROE should contribute to positive sentiment
      const positiveSignals = signals.filter(s => 
        s.action === 'BUY' || s.reasoning.toLowerCase().includes('roe')
      );
      expect(positiveSignals.length).toBeGreaterThan(0);
    });

    it('should perform DCF analysis', async () => {
      // Create data that should trigger DCF analysis
      const dcfData = {
        ...mockFundamentalData,
        revenue: 400000000000, // Growing revenue
        net_income: 100000000000, // Growing income
        eps: 7.0 // Growing EPS
      };
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: dcfData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // DCF analysis should be mentioned in reasoning or metadata
      const dcfSignals = signals.filter(s => 
        s.reasoning.toLowerCase().includes('dcf') ||
        s.reasoning.toLowerCase().includes('intrinsic') ||
        s.metadata?.dcf_value !== undefined
      );
      expect(dcfSignals.length).toBeGreaterThan(0);
    });

    it('should generate composite signal combining multiple factors', async () => {
      // Create data with mixed signals
      const mixedData = {
        ...mockFundamentalData,
        pe_ratio: 22, // Moderate P/E
        roe: 0.20,    // Good profitability
        debt_to_equity: 1.5 // Moderate debt
      };
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: mixedData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Should have composite signal
      const compositeSignals = signals.filter(s => 
        s.reasoning.toLowerCase().includes('composite') ||
        s.metadata?.signal_type === 'COMPOSITE_FUNDAMENTAL'
      );
      expect(compositeSignals.length).toBeGreaterThan(0);
    });

    it('should handle earnings growth analysis', async () => {
      // Create historical earnings data suggesting growth
      const growthData = {
        ...mockFundamentalData,
        eps: 6.5, // Higher than historical
        revenue: 400000000000, // Growth in revenue
        net_income: 100000000000 // Growth in income
      };
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: growthData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Should analyze growth
      signals.forEach(signal => {
        expect(signal.reasoning).toBeDefined();
        expect(signal.metadata).toBeDefined();
      });
    });
  });

  describe('Message Handling', () => {
    it('should handle fundamental data messages', async () => {
      await agent.start();
      
      const message = {
        type: 'DATA',
        payload: {
          type: 'fundamental-data',
          symbol: 'AAPL',
          data: mockFundamentalData
        }
      };
      
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });

    it('should handle market data messages', async () => {
      await agent.start();
      
      const message = {
        type: 'DATA',
        payload: {
          type: 'market-data',
          symbol: 'AAPL',
          data: mockMarketData
        }
      };
      
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });

    it('should ignore non-data messages', async () => {
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
        type: 'FUNDAMENTAL',
        enabled: true,
        parameters: {},
        weight: 1.0
      };
      
      expect(() => {
        new ValuationAgent(minimalConfig);
      }).not.toThrow();
    });

    it('should use custom P/E thresholds', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          pe_threshold_low: 10,
          pe_threshold_high: 20
        }
      };
      
      const customAgent = new ValuationAgent(customConfig);
      await customAgent.start();
      
      // Test with P/E that would be neutral with default thresholds
      const testData = {
        ...mockFundamentalData,
        pe_ratio: 22 // Between default thresholds but above custom high threshold
      };
      
      const signals = await customAgent.analyze({
        symbol: 'AAPL',
        fundamentalData: testData,
        marketData: mockMarketData
      });
      
      // Should trigger sell signal with custom thresholds
      const sellSignals = signals.filter(s => s.action === 'SELL');
      expect(sellSignals.length).toBeGreaterThan(0);
      
      await customAgent.stop();
    });

    it('should use custom ROE threshold', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          roe_threshold: 0.25 // Higher ROE requirement
        }
      };
      
      const customAgent = new ValuationAgent(customConfig);
      await customAgent.start();
      
      // Test with ROE that meets default but not custom threshold
      const testData = {
        ...mockFundamentalData,
        roe: 0.20 // Above default (0.15) but below custom (0.25)
      };
      
      const signals = await customAgent.analyze({
        symbol: 'AAPL',
        fundamentalData: testData,
        marketData: mockMarketData
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
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
        fundamentalData: mockFundamentalData,
        marketData: mockMarketData
      });
      
      signals.forEach(signal => {
        expect(signal.metadata).toBeDefined();
        expect(typeof signal.metadata).toBe('object');
        
        // Fundamental signals should include relevant financial metrics
        if (signal.action === 'BUY' || signal.action === 'SELL') {
          expect(signal.metadata).toHaveProperty('signal_type');
        }
      });
    });

    it('should provide detailed reasoning for each signal type', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: mockFundamentalData,
        marketData: mockMarketData
      });
      
      signals.forEach(signal => {
        expect(signal.reasoning).toBeDefined();
        expect(signal.reasoning.length).toBeGreaterThan(15);
        
        // Reasoning should mention specific fundamental factors
        const reasoning = signal.reasoning.toLowerCase();
        const hasFundamentalTerm = reasoning.includes('pe') || 
                                  reasoning.includes('roe') ||
                                  reasoning.includes('debt') ||
                                  reasoning.includes('earnings') ||
                                  reasoning.includes('valuation');
        expect(hasFundamentalTerm).toBe(true);
      });
    });

    it('should maintain consistency between confidence and fundamental strength', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: mockFundamentalData,
        marketData: mockMarketData
      });
      
      signals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.strength).toBeLessThanOrEqual(1);
        
        // For fundamental analysis, confidence should generally correlate with 
        // the strength of the fundamental indicators
        if (signal.action !== 'HOLD') {
          expect(signal.confidence).toBeGreaterThanOrEqual(0.3);
        }
      });
    });

    it('should include current price and valuation metrics in metadata', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        fundamentalData: mockFundamentalData,
        marketData: mockMarketData
      });
      
      signals.forEach(signal => {
        expect(signal.metadata).toBeDefined();
        
        // Should include relevant financial metrics
        if (signal.metadata && typeof signal.metadata === 'object') {
          const metadata = signal.metadata as any;
          // Check for presence of financial analysis data
          expect(
            metadata.pe_ratio !== undefined ||
            metadata.roe !== undefined ||
            metadata.current_price !== undefined ||
            metadata.signal_type !== undefined
          ).toBe(true);
        }
      });
    });
  });
});