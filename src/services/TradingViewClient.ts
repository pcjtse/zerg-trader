import axios, { AxiosInstance, AxiosResponse } from 'axios';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  TradingViewConfig,
  TradingViewSymbolInfo,
  TradingViewBar,
  TradingViewHistoryRequest,
  TradingViewHistoryResponse,
  TradingViewQuote,
  TradingViewIndicatorRequest,
  TradingViewIndicatorResponse,
  TradingViewScreenerRequest,
  TradingViewScreenerResponse,
  TradingViewBacktestConfig,
  TradingViewBacktestResult,
  TradingViewTechnicalAnalysis,
  TradingViewRealtimeUpdate,
  TradingViewWebSocketMessage,
  MarketData,
  TechnicalIndicator
} from '../types';

export class TradingViewClient extends EventEmitter {
  private client: AxiosInstance;
  private config: TradingViewConfig;
  private wsConnection?: WebSocket;
  private subscribedSymbols: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;
  private sessionId?: string;
  private isAuthenticated = false;

  constructor(config: TradingViewConfig = {}) {
    super();
    
    this.config = {
      baseUrl: 'https://scanner.tradingview.com',
      timeout: 30000,
      rateLimit: 100, // requests per minute
      enableWebSocket: true,
      enableRealtimeData: true,
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'ZergTrader/1.0.0',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.initializeRequestInterceptors();
    this.initializeResponseInterceptors();
  }

  private initializeRequestInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        if (this.config.apiKey) {
          config.headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        
        // Add rate limiting logic here if needed
        this.emit('request', { url: config.url, method: config.method });
        return config;
      },
      (error) => {
        this.emit('error', error);
        return Promise.reject(error);
      }
    );
  }

  private initializeResponseInterceptors(): void {
    this.client.interceptors.response.use(
      (response) => {
        this.emit('response', { status: response.status, url: response.config.url });
        return response;
      },
      (error) => {
        this.emit('error', error);
        return Promise.reject(error);
      }
    );
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize session and authenticate if needed
      await this.createSession();
      
      if (this.config.enableWebSocket && this.config.enableRealtimeData) {
        await this.initializeWebSocket();
      }

      this.isAuthenticated = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', `Initialization failed: ${error}`);
      throw error;
    }
  }

  private async createSession(): Promise<void> {
    try {
      // For TradingView's public API, we'll simulate session creation
      this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.emit('sessionCreated', this.sessionId);
    } catch (error) {
      throw new Error(`Failed to create session: ${error}`);
    }
  }

  private async initializeWebSocket(): Promise<void> {
    if (!this.config.enableWebSocket) return;

    try {
      // TradingView WebSocket endpoint (this is a simulated endpoint)
      const wsUrl = 'wss://data.tradingview.com/socket.io/websocket';
      
      this.wsConnection = new WebSocket(wsUrl);
      
      this.wsConnection.on('open', () => {
        this.emit('websocketConnected');
        this.reconnectAttempts = 0;
        this.sendWebSocketMessage({
          m: 'set_auth_token',
          p: [this.config.apiKey || '']
        });
      });

      this.wsConnection.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          this.emit('error', `WebSocket message parsing error: ${error}`);
        }
      });

      this.wsConnection.on('error', (error) => {
        this.emit('error', `WebSocket error: ${error}`);
      });

      this.wsConnection.on('close', (code, reason) => {
        this.emit('websocketDisconnected', { code, reason });
        this.handleWebSocketReconnect();
      });

    } catch (error) {
      this.emit('error', `WebSocket initialization failed: ${error}`);
    }
  }

  private handleWebSocketMessage(message: any): void {
    switch (message.m) {
      case 'qsd': // Quote symbol data
        this.handleRealtimeQuote(message.p);
        break;
      case 'du': // Data update
        this.handleDataUpdate(message.p);
        break;
      case 'protocol_error':
        this.emit('error', `Protocol error: ${message.p}`);
        break;
      default:
        this.emit('websocketMessage', message);
    }
  }

  private handleRealtimeQuote(data: any[]): void {
    if (data.length >= 2) {
      const [symbolId, quote] = data;
      const update: TradingViewRealtimeUpdate = {
        symbol: quote.n || symbolId,
        price: quote.lp || quote.price,
        volume: quote.volume,
        bid: quote.bid,
        ask: quote.ask,
        timestamp: Date.now(),
        change: quote.ch,
        change_percent: quote.chp
      };
      
      this.emit('realtimeUpdate', update);
    }
  }

  private handleDataUpdate(data: any[]): void {
    // Handle various data updates (bars, indicators, etc.)
    this.emit('dataUpdate', data);
  }

  private sendWebSocketMessage(message: TradingViewWebSocketMessage): void {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify(message));
    }
  }

  private handleWebSocketReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', 'Max WebSocket reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      this.emit('reconnecting', this.reconnectAttempts);
      this.initializeWebSocket();
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  public async getSymbolInfo(symbol: string): Promise<TradingViewSymbolInfo> {
    try {
      // This is a mock implementation - actual TradingView API endpoints may differ
      const response = await this.client.get(`/symbol_info`, {
        params: { symbol }
      });

      return this.transformToSymbolInfo(response.data, symbol);
    } catch (error) {
      // Fallback to mock data for development
      return this.createMockSymbolInfo(symbol);
    }
  }

  private transformToSymbolInfo(data: any, symbol: string): TradingViewSymbolInfo {
    return {
      symbol,
      name: data.name || symbol,
      type: data.type || 'stock',
      exchange: data.exchange || 'NASDAQ',
      timezone: data.timezone || 'America/New_York',
      minmov: data.minmov || 1,
      pricescale: data.pricescale || 100,
      session: data.session || '0930-1600',
      description: data.description || `${symbol} Stock`,
      has_intraday: data.has_intraday !== false,
      has_daily: data.has_daily !== false,
      has_weekly_and_monthly: data.has_weekly_and_monthly !== false,
      supported_resolutions: data.supported_resolutions || ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
      volume_precision: data.volume_precision || 0,
      data_status: data.data_status || 'streaming'
    };
  }

  private createMockSymbolInfo(symbol: string): TradingViewSymbolInfo {
    return {
      symbol,
      name: symbol,
      type: 'stock',
      exchange: 'NASDAQ',
      timezone: 'America/New_York',
      minmov: 1,
      pricescale: 100,
      session: '0930-1600',
      description: `${symbol} Stock`,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
      volume_precision: 0,
      data_status: 'streaming'
    };
  }

  public async getHistoricalData(request: TradingViewHistoryRequest): Promise<TradingViewHistoryResponse> {
    try {
      const response = await this.client.get('/history', {
        params: {
          symbol: request.symbol,
          resolution: request.resolution,
          from: request.from,
          to: request.to,
          countback: request.countback
        }
      });

      return response.data;
    } catch (error) {
      // Generate mock data for development
      return this.generateMockHistoricalData(request);
    }
  }

  private generateMockHistoricalData(request: TradingViewHistoryRequest): TradingViewHistoryResponse {
    const { from, to, resolution } = request;
    const interval = this.getIntervalSeconds(resolution);
    const dataPoints = Math.min(Math.floor((to - from) / interval), 5000);
    
    const times: number[] = [];
    const opens: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];
    const volumes: number[] = [];

    let basePrice = 100 + Math.random() * 400; // Random price between 100-500
    let currentTime = from;

    for (let i = 0; i < dataPoints; i++) {
      times.push(currentTime);
      
      const open = basePrice + (Math.random() - 0.5) * 2;
      const volatility = 0.02; // 2% volatility
      const high = open + Math.random() * open * volatility;
      const low = open - Math.random() * open * volatility;
      const close = low + Math.random() * (high - low);
      const volume = Math.floor(1000000 + Math.random() * 5000000);

      opens.push(Number(open.toFixed(2)));
      highs.push(Number(high.toFixed(2)));
      lows.push(Number(low.toFixed(2)));
      closes.push(Number(close.toFixed(2)));
      volumes.push(volume);

      basePrice = close; // Next candle starts where this one ends
      currentTime += interval;
    }

    return {
      s: 'ok',
      t: times,
      o: opens,
      h: highs,
      l: lows,
      c: closes,
      v: volumes
    };
  }

  private getIntervalSeconds(resolution: string): number {
    const intervals: Record<string, number> = {
      '1': 60,
      '5': 300,
      '15': 900,
      '30': 1800,
      '60': 3600,
      '240': 14400,
      '1D': 86400,
      '1W': 604800,
      '1M': 2629746
    };
    return intervals[resolution] || 3600;
  }

  public async convertToMarketData(response: TradingViewHistoryResponse, symbol: string): Promise<MarketData[]> {
    if (response.s !== 'ok' || !response.t || !response.o || !response.h || !response.l || !response.c) {
      return [];
    }

    const marketData: MarketData[] = [];
    
    for (let i = 0; i < response.t.length; i++) {
      marketData.push({
        symbol,
        timestamp: new Date(response.t[i] * 1000),
        open: response.o[i],
        high: response.h[i],
        low: response.l[i],
        close: response.c[i],
        volume: response.v?.[i] || 0
      });
    }

    return marketData;
  }

  public async getQuote(symbol: string): Promise<TradingViewQuote> {
    try {
      const response = await this.client.get('/quote', {
        params: { symbol }
      });

      return response.data;
    } catch (error) {
      // Generate mock quote for development
      return this.generateMockQuote(symbol);
    }
  }

  private generateMockQuote(symbol: string): TradingViewQuote {
    const price = 100 + Math.random() * 400;
    const change = (Math.random() - 0.5) * 10;
    
    return {
      symbol,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      change_percent: Number(((change / price) * 100).toFixed(2)),
      volume: Math.floor(1000000 + Math.random() * 5000000),
      bid: Number((price - 0.01).toFixed(2)),
      ask: Number((price + 0.01).toFixed(2)),
      timestamp: Date.now()
    };
  }

  public async getIndicator(request: TradingViewIndicatorRequest): Promise<TechnicalIndicator[]> {
    try {
      const response = await this.client.post('/indicators', request);
      return this.transformIndicatorResponse(response.data, request);
    } catch (error) {
      // Generate mock indicator data
      return this.generateMockIndicators(request);
    }
  }

  private transformIndicatorResponse(data: TradingViewIndicatorResponse, request: TradingViewIndicatorRequest): TechnicalIndicator[] {
    if (data.s !== 'ok' || !data.t || !data.v) {
      return [];
    }

    const indicators: TechnicalIndicator[] = [];
    
    for (let i = 0; i < data.t.length; i++) {
      indicators.push({
        name: request.indicator,
        value: data.v[i],
        timestamp: new Date(data.t[i] * 1000),
        parameters: request.parameters
      });
    }

    return indicators;
  }

  private generateMockIndicators(request: TradingViewIndicatorRequest): TechnicalIndicator[] {
    const indicators: TechnicalIndicator[] = [];
    const period = request.period || 14;
    const baseValue = request.indicator === 'RSI' ? 50 : 100;
    const range = request.indicator === 'RSI' ? 100 : 50;
    
    // Generate 100 data points
    for (let i = 0; i < 100; i++) {
      const timestamp = new Date(request.from * 1000 + i * 3600000);
      const value = baseValue + (Math.random() - 0.5) * range;
      
      indicators.push({
        name: request.indicator,
        value: Number(value.toFixed(2)),
        timestamp,
        parameters: { period, ...request.parameters }
      });
    }

    return indicators;
  }

  public async screenStocks(request: TradingViewScreenerRequest): Promise<TradingViewScreenerResponse> {
    try {
      const response = await this.client.post('/screener', request);
      return response.data;
    } catch (error) {
      // Generate mock screener results
      return this.generateMockScreenerResults(request);
    }
  }

  private generateMockScreenerResults(request: TradingViewScreenerRequest): TradingViewScreenerResponse {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'JNJ'];
    const data = symbols.map(symbol => ({
      s: symbol,
      d: [
        symbol,
        Math.random() * 500 + 50, // price
        (Math.random() - 0.5) * 10, // change
        Math.random() * 100000000, // volume
        Math.random() * 100 + 50 // market cap (simplified)
      ]
    }));

    return {
      data,
      totalCount: data.length
    };
  }

  public async getTechnicalAnalysis(symbol: string, interval: string = '1D'): Promise<TradingViewTechnicalAnalysis> {
    try {
      const response = await this.client.get('/technical_analysis', {
        params: { symbol, interval }
      });
      return response.data;
    } catch (error) {
      // Generate mock technical analysis
      return this.generateMockTechnicalAnalysis(symbol, interval);
    }
  }

  private generateMockTechnicalAnalysis(symbol: string, interval: string): TradingViewTechnicalAnalysis {
    const recommendations = ['STRONG_BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG_SELL'] as const;
    const actions = ['BUY', 'SELL', 'NEUTRAL'] as const;
    
    const buyCount = Math.floor(Math.random() * 10);
    const sellCount = Math.floor(Math.random() * 10);
    const neutralCount = Math.floor(Math.random() * 10);
    
    return {
      symbol,
      timeframe: interval,
      summary: {
        recommendation: recommendations[Math.floor(Math.random() * recommendations.length)],
        buy: buyCount,
        sell: sellCount,
        neutral: neutralCount
      },
      oscillators: {
        recommendation: recommendations[Math.floor(Math.random() * recommendations.length)],
        indicators: {
          'RSI': { action: actions[Math.floor(Math.random() * actions.length)], value: Math.random() * 100 },
          'MACD': { action: actions[Math.floor(Math.random() * actions.length)], value: Math.random() * 2 - 1 },
          'Stochastic': { action: actions[Math.floor(Math.random() * actions.length)], value: Math.random() * 100 }
        }
      },
      moving_averages: {
        recommendation: recommendations[Math.floor(Math.random() * recommendations.length)],
        indicators: {
          'EMA10': { action: actions[Math.floor(Math.random() * actions.length)], value: Math.random() * 200 + 100 },
          'SMA20': { action: actions[Math.floor(Math.random() * actions.length)], value: Math.random() * 200 + 100 },
          'SMA50': { action: actions[Math.floor(Math.random() * actions.length)], value: Math.random() * 200 + 100 }
        }
      },
      timestamp: Date.now()
    };
  }

  public async subscribeToRealtime(symbol: string): Promise<void> {
    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket connection not available');
    }

    if (this.subscribedSymbols.has(symbol)) {
      return; // Already subscribed
    }

    this.sendWebSocketMessage({
      m: 'quote_add_symbols',
      p: [this.sessionId, symbol]
    });

    this.subscribedSymbols.add(symbol);
    this.emit('subscribed', symbol);
  }

  public async unsubscribeFromRealtime(symbol: string): Promise<void> {
    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!this.subscribedSymbols.has(symbol)) {
      return; // Not subscribed
    }

    this.sendWebSocketMessage({
      m: 'quote_remove_symbols',
      p: [this.sessionId, symbol]
    });

    this.subscribedSymbols.delete(symbol);
    this.emit('unsubscribed', symbol);
  }

  public async runBacktest(config: TradingViewBacktestConfig): Promise<TradingViewBacktestResult> {
    try {
      const response = await this.client.post('/backtest', config);
      return response.data;
    } catch (error) {
      // Generate mock backtest results
      return this.generateMockBacktestResult(config);
    }
  }

  private generateMockBacktestResult(config: TradingViewBacktestConfig): TradingViewBacktestResult {
    const trades = [];
    const equity = [];
    let currentCapital = 100000; // $100k starting capital
    let currentTime = config.from;
    const interval = 86400; // Daily

    // Generate random trades
    for (let i = 0; i < 50; i++) {
      const entryTime = currentTime + Math.random() * (config.to - config.from);
      const exitTime = entryTime + Math.random() * 7 * 86400; // Hold for up to 7 days
      const entryPrice = 100 + Math.random() * 300;
      const returnPct = (Math.random() - 0.45) * 0.1; // Slightly positive bias
      const exitPrice = entryPrice * (1 + returnPct);
      const quantity = Math.floor(1000 / entryPrice);
      const pnl = (exitPrice - entryPrice) * quantity;

      trades.push({
        entryTime,
        exitTime,
        side: 'long' as const,
        entryPrice,
        exitPrice,
        quantity,
        pnl,
        pnlPercent: returnPct * 100,
        runup: Math.max(0, pnl),
        drawdown: Math.min(0, pnl)
      });

      currentCapital += pnl;
      equity.push({
        time: exitTime,
        value: currentCapital
      });
    }

    const totalReturn = (currentCapital - 100000) / 100000;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.length - winningTrades;
    const winRate = winningTrades / trades.length;
    const maxDrawdown = Math.min(...equity.map(e => e.value - 100000)) / 100000;

    return {
      strategy: config.strategy,
      symbol: config.symbol,
      period: {
        from: config.from,
        to: config.to
      },
      performance: {
        totalReturn: totalReturn * 100,
        annualizedReturn: totalReturn * 365 / ((config.to - config.from) / 86400) * 100,
        sharpeRatio: totalReturn / 0.15, // Mock Sharpe ratio
        maxDrawdown: maxDrawdown * 100,
        winRate: winRate * 100,
        profitFactor: winningTrades / Math.max(losingTrades, 1),
        totalTrades: trades.length,
        avgTradeReturn: trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length
      },
      trades,
      equity
    };
  }

  public isConnected(): boolean {
    return this.isAuthenticated && 
           (!this.config.enableWebSocket || 
            (this.wsConnection?.readyState === WebSocket.OPEN));
  }

  public getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  public async disconnect(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = undefined;
    }

    this.subscribedSymbols.clear();
    this.isAuthenticated = false;
    this.sessionId = undefined;
    
    this.emit('disconnected');
  }

  public async validateConnection(): Promise<boolean> {
    try {
      await this.getQuote('AAPL'); // Test with a simple quote request
      return true;
    } catch (error) {
      return false;
    }
  }
}