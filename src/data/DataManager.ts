import { EventEmitter } from 'events';
import axios from 'axios';
import { MarketData, FundamentalData, NewsData, TechnicalIndicator } from '../types';

export interface DataSource {
  name: string;
  type: 'MARKET' | 'FUNDAMENTAL' | 'NEWS';
  enabled: boolean;
  config: Record<string, any>;
}

export class DataManager extends EventEmitter {
  private dataSources: Map<string, DataSource> = new Map();
  private marketDataCache: Map<string, MarketData[]> = new Map();
  private fundamentalDataCache: Map<string, FundamentalData> = new Map();
  private newsDataCache: Map<string, NewsData[]> = new Map();
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.setupDefaultDataSources();
  }

  private setupDefaultDataSources(): void {
    // Alpha Vantage for market data
    this.dataSources.set('alphavantage', {
      name: 'Alpha Vantage',
      type: 'MARKET',
      enabled: !!process.env.ALPHA_VANTAGE_API_KEY,
      config: {
        apiKey: process.env.ALPHA_VANTAGE_API_KEY,
        baseUrl: 'https://www.alphavantage.co/query',
        rateLimit: 5 // requests per minute
      }
    });

    // Yahoo Finance for additional market data
    this.dataSources.set('yahoo', {
      name: 'Yahoo Finance',
      type: 'MARKET',
      enabled: true,
      config: {
        baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart'
      }
    });

    // News API for sentiment data
    this.dataSources.set('newsapi', {
      name: 'News API',
      type: 'NEWS',
      enabled: !!process.env.NEWS_API_KEY,
      config: {
        apiKey: process.env.NEWS_API_KEY,
        baseUrl: 'https://newsapi.org/v2'
      }
    });
  }

  public async getMarketData(symbol: string, period: string = '1d', limit: number = 100): Promise<MarketData[]> {
    const cacheKey = `${symbol}_${period}`;
    
    // Check cache first
    if (this.marketDataCache.has(cacheKey)) {
      const cached = this.marketDataCache.get(cacheKey)!;
      if (cached.length > 0 && this.isDataFresh(cached[cached.length - 1].timestamp)) {
        return cached.slice(-limit);
      }
    }

    try {
      // Try Alpha Vantage first
      let data = await this.fetchFromAlphaVantage(symbol, period);
      
      if (!data || data.length === 0) {
        // Fallback to Yahoo Finance
        data = await this.fetchFromYahoo(symbol, period);
      }

      if (data && data.length > 0) {
        this.marketDataCache.set(cacheKey, data);
        this.emit('marketDataUpdated', { symbol, data: data.slice(-limit) });
        return data.slice(-limit);
      }
    } catch (error) {
      this.emit('error', { source: 'market-data', symbol, error });
    }

    return [];
  }

  public async getFundamentalData(symbol: string): Promise<FundamentalData | null> {
    // Check cache first
    if (this.fundamentalDataCache.has(symbol)) {
      const cached = this.fundamentalDataCache.get(symbol)!;
      if (this.isDataFresh(cached.timestamp, 24 * 60 * 60 * 1000)) { // 24 hours
        return cached;
      }
    }

    try {
      const data = await this.fetchFundamentalData(symbol);
      if (data) {
        this.fundamentalDataCache.set(symbol, data);
        this.emit('fundamentalDataUpdated', { symbol, data });
        return data;
      }
    } catch (error) {
      this.emit('error', { source: 'fundamental-data', symbol, error });
    }

    return null;
  }

  public async getNewsData(symbol: string, limit: number = 10): Promise<NewsData[]> {
    const cacheKey = symbol;
    
    // Check cache first
    if (this.newsDataCache.has(cacheKey)) {
      const cached = this.newsDataCache.get(cacheKey)!;
      if (cached.length > 0 && this.isDataFresh(cached[0].timestamp, 30 * 60 * 1000)) { // 30 minutes
        return cached.slice(0, limit);
      }
    }

    try {
      const data = await this.fetchNewsData(symbol);
      if (data && data.length > 0) {
        this.newsDataCache.set(cacheKey, data);
        this.emit('newsDataUpdated', { symbol, data: data.slice(0, limit) });
        return data.slice(0, limit);
      }
    } catch (error) {
      this.emit('error', { source: 'news-data', symbol, error });
    }

    return [];
  }

  public calculateTechnicalIndicators(data: MarketData[], indicators: string[]): TechnicalIndicator[] {
    const results: TechnicalIndicator[] = [];
    
    for (const indicator of indicators) {
      switch (indicator.toLowerCase()) {
        case 'sma':
          results.push(...this.calculateSMA(data, [20, 50, 200]));
          break;
        case 'ema':
          results.push(...this.calculateEMA(data, [12, 26]));
          break;
        case 'rsi':
          results.push(...this.calculateRSI(data, 14));
          break;
        case 'macd':
          results.push(...this.calculateMACD(data));
          break;
      }
    }
    
    return results;
  }

  private async fetchFromAlphaVantage(symbol: string, period: string): Promise<MarketData[]> {
    const source = this.dataSources.get('alphavantage');
    if (!source || !source.enabled) return [];

    const response = await axios.get(source.config.baseUrl, {
      params: {
        function: 'TIME_SERIES_DAILY',
        symbol,
        apikey: source.config.apiKey,
        outputsize: 'compact'
      }
    });

    const timeSeries = response.data['Time Series (Daily)'];
    if (!timeSeries) return [];

    return Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
      symbol,
      timestamp: new Date(date),
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume'])
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private async fetchFromYahoo(symbol: string, period: string): Promise<MarketData[]> {
    const source = this.dataSources.get('yahoo');
    if (!source || !source.enabled) return [];

    const response = await axios.get(`${source.config.baseUrl}/${symbol}`, {
      params: {
        interval: '1d',
        range: '1y'
      }
    });

    const result = response.data.chart.result[0];
    if (!result) return [];

    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    
    return timestamps.map((timestamp: number, index: number) => ({
      symbol,
      timestamp: new Date(timestamp * 1000),
      open: quotes.open[index],
      high: quotes.high[index],
      low: quotes.low[index],
      close: quotes.close[index],
      volume: quotes.volume[index]
    })).filter((data: MarketData) => 
      data.open !== null && data.high !== null && data.low !== null && data.close !== null
    );
  }

  private async fetchFundamentalData(symbol: string): Promise<FundamentalData | null> {
    const source = this.dataSources.get('alphavantage');
    if (!source || !source.enabled) return null;

    const response = await axios.get(source.config.baseUrl, {
      params: {
        function: 'OVERVIEW',
        symbol,
        apikey: source.config.apiKey
      }
    });

    const data = response.data;
    if (!data || Object.keys(data).length === 0) return null;

    return {
      symbol,
      timestamp: new Date(),
      pe_ratio: parseFloat(data.PERatio) || undefined,
      eps: parseFloat(data.EPS) || undefined,
      debt_to_equity: parseFloat(data.DebtToEquity) || undefined,
      roe: parseFloat(data.ReturnOnEquityTTM) || undefined,
      roa: parseFloat(data.ReturnOnAssetsTTM) || undefined,
      revenue: parseFloat(data.RevenueTTM) || undefined
    };
  }

  private async fetchNewsData(symbol: string): Promise<NewsData[]> {
    const source = this.dataSources.get('newsapi');
    if (!source || !source.enabled) return [];

    const response = await axios.get(`${source.config.baseUrl}/everything`, {
      params: {
        q: symbol,
        sortBy: 'publishedAt',
        pageSize: 20,
        apiKey: source.config.apiKey
      }
    });

    return response.data.articles.map((article: any) => ({
      id: article.url,
      symbol,
      title: article.title,
      content: article.description || article.content,
      sentiment: this.analyzeSentiment(article.title + ' ' + (article.description || '')),
      timestamp: new Date(article.publishedAt),
      source: article.source.name
    }));
  }

  private analyzeSentiment(text: string): number {
    // Simple sentiment analysis - in production, use a proper NLP service
    const positiveWords = ['good', 'great', 'excellent', 'positive', 'up', 'gain', 'profit', 'bull'];
    const negativeWords = ['bad', 'terrible', 'negative', 'down', 'loss', 'drop', 'bear', 'decline'];
    
    const words = text.toLowerCase().split(/\\s+/);
    let score = 0;
    
    for (const word of words) {
      if (positiveWords.includes(word)) score += 1;
      if (negativeWords.includes(word)) score -= 1;
    }
    
    return Math.max(-1, Math.min(1, score / words.length * 10));
  }

  // Technical indicator calculations
  private calculateSMA(data: MarketData[], periods: number[]): TechnicalIndicator[] {
    const results: TechnicalIndicator[] = [];
    
    for (const period of periods) {
      if (data.length < period) continue;
      
      for (let i = period - 1; i < data.length; i++) {
        const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
        const sma = sum / period;
        
        results.push({
          name: `SMA_${period}`,
          value: sma,
          timestamp: data[i].timestamp,
          parameters: { period }
        });
      }
    }
    
    return results;
  }

  private calculateEMA(data: MarketData[], periods: number[]): TechnicalIndicator[] {
    const results: TechnicalIndicator[] = [];
    
    for (const period of periods) {
      if (data.length < period) continue;
      
      const multiplier = 2 / (period + 1);
      let ema = data.slice(0, period).reduce((acc, d) => acc + d.close, 0) / period;
      
      results.push({
        name: `EMA_${period}`,
        value: ema,
        timestamp: data[period - 1].timestamp,
        parameters: { period }
      });
      
      for (let i = period; i < data.length; i++) {
        ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
        results.push({
          name: `EMA_${period}`,
          value: ema,
          timestamp: data[i].timestamp,
          parameters: { period }
        });
      }
    }
    
    return results;
  }

  private calculateRSI(data: MarketData[], period: number): TechnicalIndicator[] {
    if (data.length < period + 1) return [];
    
    const results: TechnicalIndicator[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      
      results.push({
        name: 'RSI',
        value: rsi,
        timestamp: data[i + 1].timestamp,
        parameters: { period }
      });
    }
    
    return results;
  }

  private calculateMACD(data: MarketData[]): TechnicalIndicator[] {
    const ema12 = this.calculateEMA(data, [12]);
    const ema26 = this.calculateEMA(data, [26]);
    
    if (ema12.length === 0 || ema26.length === 0) return [];
    
    const results: TechnicalIndicator[] = [];
    const macdLine: number[] = [];
    
    const minLength = Math.min(ema12.length, ema26.length);
    for (let i = 0; i < minLength; i++) {
      const macd = ema12[i].value - ema26[i].value;
      macdLine.push(macd);
      
      results.push({
        name: 'MACD',
        value: macd,
        timestamp: ema12[i].timestamp,
        parameters: { fast: 12, slow: 26 }
      });
    }
    
    // Calculate signal line (9-period EMA of MACD)
    if (macdLine.length >= 9) {
      const multiplier = 2 / 10;
      let signal = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
      
      for (let i = 9; i < macdLine.length; i++) {
        signal = (macdLine[i] * multiplier) + (signal * (1 - multiplier));
        
        results.push({
          name: 'MACD_SIGNAL',
          value: signal,
          timestamp: results[i].timestamp,
          parameters: { period: 9 }
        });
        
        results.push({
          name: 'MACD_HISTOGRAM',
          value: macdLine[i] - signal,
          timestamp: results[i].timestamp,
          parameters: {}
        });
      }
    }
    
    return results;
  }

  private isDataFresh(timestamp: Date, maxAge: number = 5 * 60 * 1000): boolean {
    return Date.now() - timestamp.getTime() < maxAge;
  }

  public startRealTimeUpdates(symbols: string[], interval: number = 60000): void {
    for (const symbol of symbols) {
      if (this.updateIntervals.has(symbol)) {
        clearInterval(this.updateIntervals.get(symbol)!);
      }
      
      const intervalId = setInterval(async () => {
        try {
          await this.getMarketData(symbol, '1d', 1);
        } catch (error) {
          this.emit('error', { source: 'real-time-update', symbol, error });
        }
      }, interval);
      
      this.updateIntervals.set(symbol, intervalId);
    }
  }

  public stopRealTimeUpdates(symbol?: string): void {
    if (symbol) {
      const intervalId = this.updateIntervals.get(symbol);
      if (intervalId) {
        clearInterval(intervalId);
        this.updateIntervals.delete(symbol);
      }
    } else {
      this.updateIntervals.forEach(intervalId => clearInterval(intervalId));
      this.updateIntervals.clear();
    }
  }
}