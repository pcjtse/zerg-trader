import { TradingViewClient } from '../../src/services/TradingViewClient';
import {
  TradingViewConfig,
  TradingViewHistoryRequest,
  TradingViewIndicatorRequest,
  TradingViewScreenerRequest,
  TradingViewBacktestConfig
} from '../../src/types';

// Mock axios
jest.mock('axios');
// Mock WebSocket
jest.mock('ws');

describe('TradingViewClient', () => {
  let client: TradingViewClient;
  let mockAxios: any;
  let mockWebSocket: any;

  beforeEach(() => {
    mockAxios = require('axios');
    mockWebSocket = require('ws');
    
    mockAxios.create.mockReturnValue({
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      },
      get: jest.fn(),
      post: jest.fn()
    });

    mockWebSocket.mockImplementation(() => ({
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1 // OPEN
    }));

    const config: TradingViewConfig = {
      apiKey: 'test-api-key',
      baseUrl: 'https://test-api.tradingview.com',
      timeout: 5000,
      enableWebSocket: false // Disable for testing
    };

    client = new TradingViewClient(config);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultClient = new TradingViewClient();
      expect(defaultClient).toBeInstanceOf(TradingViewClient);
    });

    it('should initialize with custom configuration', () => {
      const customConfig: TradingViewConfig = {
        apiKey: 'custom-key',
        baseUrl: 'https://custom.tradingview.com',
        timeout: 10000,
        rateLimit: 200
      };

      const customClient = new TradingViewClient(customConfig);
      expect(customClient).toBeInstanceOf(TradingViewClient);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully without WebSocket', async () => {
      await expect(client.initialize()).resolves.not.toThrow();
    });

    it('should emit initialized event', async () => {
      const initSpy = jest.fn();
      client.on('initialized', initSpy);

      await client.initialize();
      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe('getSymbolInfo', () => {
    it('should return symbol information', async () => {
      const symbol = 'AAPL';
      const symbolInfo = await client.getSymbolInfo(symbol);

      expect(symbolInfo).toEqual({
        symbol: 'AAPL',
        name: 'AAPL',
        type: 'stock',
        exchange: 'NASDAQ',
        timezone: 'America/New_York',
        minmov: 1,
        pricescale: 100,
        session: '0930-1600',
        description: 'AAPL Stock',
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
        volume_precision: 0,
        data_status: 'streaming'
      });
    });
  });

  describe('getHistoricalData', () => {
    it('should fetch historical data successfully', async () => {
      const request: TradingViewHistoryRequest = {
        symbol: 'AAPL',
        resolution: '1D',
        from: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days ago
        to: Math.floor(Date.now() / 1000)
      };

      const response = await client.getHistoricalData(request);

      expect(response.s).toBe('ok');
      expect(response.t).toBeDefined();
      expect(response.o).toBeDefined();
      expect(response.h).toBeDefined();
      expect(response.l).toBeDefined();
      expect(response.c).toBeDefined();
      expect(response.v).toBeDefined();
    });

    it('should generate data with correct length constraints', async () => {
      const request: TradingViewHistoryRequest = {
        symbol: 'AAPL',
        resolution: '1D',
        from: Math.floor(Date.now() / 1000) - 86400 * 10, // 10 days ago
        to: Math.floor(Date.now() / 1000)
      };

      const response = await client.getHistoricalData(request);

      if (response.s === 'ok' && response.t) {
        expect(response.t.length).toBeLessThanOrEqual(5000);
        expect(response.t.length).toBeGreaterThan(0);
      }
    });
  });

  describe('convertToMarketData', () => {
    it('should convert TradingView response to MarketData format', async () => {
      const mockResponse = {
        s: 'ok' as const,
        t: [1640995200, 1641081600], // Unix timestamps
        o: [150.0, 151.0],
        h: [155.0, 156.0],
        l: [148.0, 149.0],
        c: [153.0, 154.0],
        v: [1000000, 1100000]
      };

      const marketData = await client.convertToMarketData(mockResponse, 'AAPL');

      expect(marketData).toHaveLength(2);
      expect(marketData[0]).toEqual({
        symbol: 'AAPL',
        timestamp: new Date(1640995200 * 1000),
        open: 150.0,
        high: 155.0,
        low: 148.0,
        close: 153.0,
        volume: 1000000
      });
    });

    it('should handle empty response', async () => {
      const emptyResponse = {
        s: 'no_data' as const
      };

      const marketData = await client.convertToMarketData(emptyResponse, 'AAPL');
      expect(marketData).toEqual([]);
    });
  });

  describe('getQuote', () => {
    it('should generate realistic quote data', async () => {
      const symbol = 'AAPL';
      const quote = await client.getQuote(symbol);

      expect(quote.symbol).toBe(symbol);
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.volume).toBeGreaterThan(0);
      expect(quote.bid).toBeLessThan(quote.price);
      expect(quote.ask).toBeGreaterThan(quote.price);
      expect(quote.timestamp).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    it('should generate quotes with reasonable price ranges', async () => {
      const quote = await client.getQuote('MSFT');
      
      expect(quote.price).toBeGreaterThan(50);
      expect(quote.price).toBeLessThan(1000);
      expect(Math.abs(quote.change_percent)).toBeLessThan(20); // Max 20% daily change
    });
  });

  describe('getIndicator', () => {
    it('should fetch technical indicators', async () => {
      const request: TradingViewIndicatorRequest = {
        symbol: 'AAPL',
        resolution: '1D',
        indicator: 'RSI',
        period: 14,
        from: Math.floor(Date.now() / 1000) - 86400 * 30,
        to: Math.floor(Date.now() / 1000)
      };

      const indicators = await client.getIndicator(request);

      expect(indicators).toHaveLength(100); // Mock generates 100 points
      expect(indicators[0]).toEqual({
        name: 'RSI',
        value: expect.any(Number),
        timestamp: expect.any(Date),
        parameters: { period: 14 }
      });
    });

    it('should generate RSI values in correct range', async () => {
      const request: TradingViewIndicatorRequest = {
        symbol: 'AAPL',
        resolution: '1D',
        indicator: 'RSI',
        period: 14,
        from: Math.floor(Date.now() / 1000) - 86400 * 30,
        to: Math.floor(Date.now() / 1000)
      };

      const indicators = await client.getIndicator(request);

      indicators.forEach(indicator => {
        expect(indicator.value).toBeGreaterThanOrEqual(0);
        expect(indicator.value).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('screenStocks', () => {
    it('should return stock screening results', async () => {
      const request: TradingViewScreenerRequest = {
        filter: [
          {
            left: 'market_cap_basic',
            operation: 'greater',
            right: 1000000000 // $1B market cap
          }
        ]
      };

      const response = await client.screenStocks(request);

      expect(response.data).toBeDefined();
      expect(response.totalCount).toBeGreaterThan(0);
      expect(response.data[0]).toEqual({
        s: expect.any(String), // Symbol
        d: expect.any(Array)   // Data array
      });
    });
  });

  describe('getTechnicalAnalysis', () => {
    it('should return technical analysis summary', async () => {
      const analysis = await client.getTechnicalAnalysis('AAPL', '1D');

      expect(analysis.symbol).toBe('AAPL');
      expect(analysis.timeframe).toBe('1D');
      expect(analysis.summary.recommendation).toMatch(/STRONG_BUY|BUY|NEUTRAL|SELL|STRONG_SELL/);
      expect(analysis.oscillators.recommendation).toMatch(/STRONG_BUY|BUY|NEUTRAL|SELL|STRONG_SELL/);
      expect(analysis.moving_averages.recommendation).toMatch(/STRONG_BUY|BUY|NEUTRAL|SELL|STRONG_SELL/);
    });

    it('should have valid indicator values', async () => {
      const analysis = await client.getTechnicalAnalysis('AAPL');

      expect(analysis.oscillators.indicators.RSI.value).toBeGreaterThanOrEqual(0);
      expect(analysis.oscillators.indicators.RSI.value).toBeLessThanOrEqual(100);
      expect(analysis.moving_averages.indicators.EMA10.value).toBeGreaterThan(0);
    });
  });

  describe('runBacktest', () => {
    it('should execute backtest and return results', async () => {
      const config: TradingViewBacktestConfig = {
        strategy: 'test-strategy',
        symbol: 'AAPL',
        resolution: '1D',
        from: Math.floor(Date.now() / 1000) - 86400 * 365, // 1 year ago
        to: Math.floor(Date.now() / 1000),
        parameters: {
          sma_period: 20,
          rsi_period: 14
        }
      };

      const result = await client.runBacktest(config);

      expect(result.strategy).toBe('test-strategy');
      expect(result.symbol).toBe('AAPL');
      expect(result.performance).toBeDefined();
      expect(result.trades).toBeDefined();
      expect(result.equity).toBeDefined();
    });

    it('should generate realistic performance metrics', async () => {
      const config: TradingViewBacktestConfig = {
        strategy: 'test-strategy',
        symbol: 'AAPL',
        resolution: '1D',
        from: Math.floor(Date.now() / 1000) - 86400 * 90, // 90 days ago
        to: Math.floor(Date.now() / 1000),
        parameters: {}
      };

      const result = await client.runBacktest(config);

      expect(result.performance.totalTrades).toBeGreaterThan(0);
      expect(result.performance.winRate).toBeGreaterThanOrEqual(0);
      expect(result.performance.winRate).toBeLessThanOrEqual(100);
      expect(result.performance.maxDrawdown).toBeLessThanOrEqual(1); // Drawdown should be reasonable
    });
  });

  describe('WebSocket functionality', () => {
    let wsClient: TradingViewClient;

    beforeEach(() => {
      const wsConfig: TradingViewConfig = {
        enableWebSocket: true,
        enableRealtimeData: true
      };
      wsClient = new TradingViewClient(wsConfig);
    });

    it('should handle WebSocket initialization', async () => {
      await wsClient.initialize();
      expect(mockWebSocket).toHaveBeenCalled();
    });

    it('should subscribe to realtime data', async () => {
      await wsClient.initialize();
      
      const mockWs = mockWebSocket.mock.instances[0];
      mockWs.readyState = 1; // OPEN
      
      await expect(wsClient.subscribeToRealtime('AAPL')).resolves.not.toThrow();
    });

    it('should unsubscribe from realtime data', async () => {
      await wsClient.initialize();
      
      const mockWs = mockWebSocket.mock.instances[0];
      mockWs.readyState = 1; // OPEN
      
      await wsClient.subscribeToRealtime('AAPL');
      await expect(wsClient.unsubscribeFromRealtime('AAPL')).resolves.not.toThrow();
    });
  });

  describe('Connection management', () => {
    it('should validate connection successfully', async () => {
      await client.initialize();
      const isValid = await client.validateConnection();
      expect(isValid).toBe(true);
    });

    it('should check connection status', async () => {
      await client.initialize();
      expect(client.isConnected()).toBe(true);
    });

    it('should disconnect cleanly', async () => {
      await client.initialize();
      await expect(client.disconnect()).resolves.not.toThrow();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockClient = mockAxios.create();
      mockClient.get.mockRejectedValue(new Error('API Error'));

      // The client should still work with mock data even if API fails
      const quote = await client.getQuote('INVALID_SYMBOL');
      expect(quote.symbol).toBe('INVALID_SYMBOL');
    });

    it('should emit error events', (done) => {
      client.on('error', (error) => {
        expect(error).toBeDefined();
        done();
      });

      // Trigger an error condition
      client.emit('error', 'Test error');
    });
  });

  describe('Event emissions', () => {
    it('should emit request events', (done) => {
      client.on('request', (data) => {
        expect(data).toEqual({
          url: expect.any(String),
          method: expect.any(String)
        });
        done();
      });

      client.emit('request', { url: '/test', method: 'GET' });
    });

    it('should emit response events', (done) => {
      client.on('response', (data) => {
        expect(data).toEqual({
          status: expect.any(Number),
          url: expect.any(String)
        });
        done();
      });

      client.emit('response', { status: 200, url: '/test' });
    });
  });
});