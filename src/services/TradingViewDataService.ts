import { EventEmitter } from 'events';
import { TradingViewClient } from './TradingViewClient';
import {
  TradingViewConfig,
  TradingViewHistoryRequest,
  TradingViewIndicatorRequest,
  MarketData,
  TechnicalIndicator,
  TradingViewQuote,
  TradingViewTechnicalAnalysis,
  TradingViewScreenerRequest,
  TradingViewRealtimeUpdate
} from '../types';

export interface DataSubscription {
  symbol: string;
  resolution: string;
  callback: (data: MarketData) => void;
}

export interface IndicatorSubscription {
  symbol: string;
  indicator: string;
  parameters: Record<string, any>;
  callback: (indicator: TechnicalIndicator) => void;
}

export class TradingViewDataService extends EventEmitter {
  private client: TradingViewClient;
  private dataSubscriptions: Map<string, DataSubscription> = new Map();
  private indicatorSubscriptions: Map<string, IndicatorSubscription> = new Map();
  private marketDataCache: Map<string, MarketData[]> = new Map();
  private indicatorCache: Map<string, TechnicalIndicator[]> = new Map();
  private quoteCache: Map<string, TradingViewQuote> = new Map();
  private updateInterval?: NodeJS.Timeout;
  private cacheExpiryTime = 60000; // 1 minute
  private isInitialized = false;

  constructor(config: TradingViewConfig = {}) {
    super();
    this.client = new TradingViewClient(config);
    this.setupClientEventHandlers();
  }

  private setupClientEventHandlers(): void {
    this.client.on('realtimeUpdate', (update: TradingViewRealtimeUpdate) => {
      this.handleRealtimeUpdate(update);
    });

    this.client.on('error', (error) => {
      this.emit('error', error);
    });

    this.client.on('websocketConnected', () => {
      this.emit('connected');
      this.resubscribeToSymbols();
    });

    this.client.on('websocketDisconnected', () => {
      this.emit('disconnected');
    });
  }

  public async initialize(): Promise<void> {
    try {
      await this.client.initialize();
      this.startPeriodicUpdates();
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', `TradingView Data Service initialization failed: ${error}`);
      throw error;
    }
  }

  private startPeriodicUpdates(): void {
    // Update cached data every 5 minutes for non-realtime symbols
    this.updateInterval = setInterval(async () => {
      await this.updateCachedData();
    }, 5 * 60 * 1000);
  }

  private async updateCachedData(): Promise<void> {
    try {
      const symbols = Array.from(new Set([
        ...this.dataSubscriptions.keys(),
        ...Array.from(this.indicatorSubscriptions.values()).map(sub => sub.symbol)
      ]));

      for (const symbol of symbols) {
        await this.refreshMarketData(symbol);
      }
    } catch (error) {
      this.emit('error', `Failed to update cached data: ${error}`);
    }
  }

  private async refreshMarketData(symbol: string): Promise<void> {
    try {
      const quote = await this.client.getQuote(symbol);
      this.quoteCache.set(symbol, quote);
      
      // Convert quote to market data format
      const marketData: MarketData = {
        symbol,
        timestamp: new Date(quote.timestamp),
        open: quote.price, // For real-time, we only have current price
        high: quote.price,
        low: quote.price,
        close: quote.price,
        volume: quote.volume
      };

      // Update subscriptions
      const subscription = this.dataSubscriptions.get(symbol);
      if (subscription) {
        subscription.callback(marketData);
      }

      this.emit('dataUpdate', { symbol, data: marketData });
    } catch (error) {
      this.emit('error', `Failed to refresh market data for ${symbol}: ${error}`);
    }
  }

  private handleRealtimeUpdate(update: TradingViewRealtimeUpdate): void {
    const marketData: MarketData = {
      symbol: update.symbol,
      timestamp: new Date(update.timestamp),
      open: update.price, // For real-time, we only have current price
      high: update.price,
      low: update.price,
      close: update.price,
      volume: update.volume || 0
    };

    // Update cache
    const cached = this.marketDataCache.get(update.symbol) || [];
    cached.push(marketData);
    
    // Keep only last 1000 data points in cache
    if (cached.length > 1000) {
      cached.splice(0, cached.length - 1000);
    }
    
    this.marketDataCache.set(update.symbol, cached);

    // Notify subscribers
    const subscription = this.dataSubscriptions.get(update.symbol);
    if (subscription) {
      subscription.callback(marketData);
    }

    this.emit('realtimeUpdate', marketData);
  }

  private resubscribeToSymbols(): void {
    // Resubscribe to all symbols after reconnection
    for (const symbol of this.dataSubscriptions.keys()) {
      this.client.subscribeToRealtime(symbol).catch(error => {
        this.emit('error', `Failed to resubscribe to ${symbol}: ${error}`);
      });
    }
  }

  public async getHistoricalData(
    symbol: string,
    resolution: '1' | '5' | '15' | '30' | '60' | '240' | '1D' | '1W' | '1M',
    from: Date,
    to: Date,
    useCache: boolean = true
  ): Promise<MarketData[]> {
    const cacheKey = `${symbol}_${resolution}_${from.getTime()}_${to.getTime()}`;
    
    if (useCache && this.marketDataCache.has(cacheKey)) {
      const cached = this.marketDataCache.get(cacheKey)!;
      const cacheAge = Date.now() - cached[cached.length - 1]?.timestamp.getTime();
      
      if (cacheAge < this.cacheExpiryTime) {
        return cached;
      }
    }

    try {
      const request: TradingViewHistoryRequest = {
        symbol,
        resolution,
        from: Math.floor(from.getTime() / 1000),
        to: Math.floor(to.getTime() / 1000),
        firstDataRequest: true
      };

      const response = await this.client.getHistoricalData(request);
      const marketData = await this.client.convertToMarketData(response, symbol);

      if (useCache) {
        this.marketDataCache.set(cacheKey, marketData);
      }

      this.emit('historicalDataLoaded', { symbol, resolution, data: marketData });
      return marketData;
    } catch (error) {
      this.emit('error', `Failed to get historical data for ${symbol}: ${error}`);
      throw error;
    }
  }

  public async getRealtimeQuote(symbol: string, useCache: boolean = true): Promise<TradingViewQuote> {
    if (useCache && this.quoteCache.has(symbol)) {
      const cached = this.quoteCache.get(symbol)!;
      const cacheAge = Date.now() - cached.timestamp;
      
      if (cacheAge < this.cacheExpiryTime) {
        return cached;
      }
    }

    try {
      const quote = await this.client.getQuote(symbol);
      
      if (useCache) {
        this.quoteCache.set(symbol, quote);
      }

      this.emit('quoteUpdate', quote);
      return quote;
    } catch (error) {
      this.emit('error', `Failed to get quote for ${symbol}: ${error}`);
      throw error;
    }
  }

  public async getTechnicalIndicators(
    symbol: string,
    indicator: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BB' | 'STOCH' | 'VWAP',
    resolution: string,
    period: number = 14,
    from: Date,
    to: Date,
    parameters?: Record<string, any>
  ): Promise<TechnicalIndicator[]> {
    const cacheKey = `${symbol}_${indicator}_${resolution}_${period}_${from.getTime()}_${to.getTime()}`;
    
    if (this.indicatorCache.has(cacheKey)) {
      const cached = this.indicatorCache.get(cacheKey)!;
      const cacheAge = Date.now() - cached[cached.length - 1]?.timestamp.getTime();
      
      if (cacheAge < this.cacheExpiryTime) {
        return cached;
      }
    }

    try {
      const request: TradingViewIndicatorRequest = {
        symbol,
        resolution,
        indicator,
        period,
        parameters,
        from: Math.floor(from.getTime() / 1000),
        to: Math.floor(to.getTime() / 1000)
      };

      const indicators = await this.client.getIndicator(request);
      this.indicatorCache.set(cacheKey, indicators);

      this.emit('indicatorsLoaded', { symbol, indicator, data: indicators });
      return indicators;
    } catch (error) {
      this.emit('error', `Failed to get ${indicator} for ${symbol}: ${error}`);
      throw error;
    }
  }

  public async getTechnicalAnalysis(
    symbol: string,
    interval: string = '1D'
  ): Promise<TradingViewTechnicalAnalysis> {
    try {
      const analysis = await this.client.getTechnicalAnalysis(symbol, interval);
      this.emit('technicalAnalysisUpdate', analysis);
      return analysis;
    } catch (error) {
      this.emit('error', `Failed to get technical analysis for ${symbol}: ${error}`);
      throw error;
    }
  }

  public async screenStocks(
    filters: Array<{
      field: string;
      operation: string;
      value: number | string | number[];
    }>,
    markets?: string[],
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    limit?: number
  ): Promise<Array<{ symbol: string; data: any[] }>> {
    try {
      const request: TradingViewScreenerRequest = {
        filter: filters.map(f => ({
          left: f.field,
          operation: f.operation as any,
          right: f.value
        })),
        markets,
        sort: sortBy ? { sortBy, sortOrder: sortOrder || 'desc' } : undefined,
        range: limit ? [0, limit] : undefined
      };

      const response = await this.client.screenStocks(request);
      this.emit('screenerResults', response);
      
      return response.data.map(item => ({
        symbol: item.s,
        data: item.d
      }));
    } catch (error) {
      this.emit('error', `Failed to screen stocks: ${error}`);
      throw error;
    }
  }

  public subscribeToMarketData(
    symbol: string,
    resolution: string,
    callback: (data: MarketData) => void
  ): string {
    const subscriptionId = `${symbol}_${resolution}_${Date.now()}`;
    
    const subscription: DataSubscription = {
      symbol,
      resolution,
      callback
    };

    this.dataSubscriptions.set(subscriptionId, subscription);

    // Subscribe to real-time updates if client supports it
    if (this.client.isConnected()) {
      this.client.subscribeToRealtime(symbol).catch(error => {
        this.emit('error', `Failed to subscribe to realtime data for ${symbol}: ${error}`);
      });
    }

    this.emit('subscribed', { symbol, resolution, subscriptionId });
    return subscriptionId;
  }

  public unsubscribeFromMarketData(subscriptionId: string): void {
    const subscription = this.dataSubscriptions.get(subscriptionId);
    if (!subscription) return;

    this.dataSubscriptions.delete(subscriptionId);

    // Check if any other subscriptions exist for this symbol
    const hasOtherSubscriptions = Array.from(this.dataSubscriptions.values())
      .some(sub => sub.symbol === subscription.symbol);

    if (!hasOtherSubscriptions && this.client.isConnected()) {
      this.client.unsubscribeFromRealtime(subscription.symbol).catch(error => {
        this.emit('error', `Failed to unsubscribe from realtime data for ${subscription.symbol}: ${error}`);
      });
    }

    this.emit('unsubscribed', { symbol: subscription.symbol, subscriptionId });
  }

  public subscribeToIndicator(
    symbol: string,
    indicator: string,
    parameters: Record<string, any>,
    callback: (indicator: TechnicalIndicator) => void
  ): string {
    const subscriptionId = `${symbol}_${indicator}_${Date.now()}`;
    
    const subscription: IndicatorSubscription = {
      symbol,
      indicator,
      parameters,
      callback
    };

    this.indicatorSubscriptions.set(subscriptionId, subscription);
    this.emit('indicatorSubscribed', { symbol, indicator, subscriptionId });
    
    return subscriptionId;
  }

  public unsubscribeFromIndicator(subscriptionId: string): void {
    const subscription = this.indicatorSubscriptions.get(subscriptionId);
    if (!subscription) return;

    this.indicatorSubscriptions.delete(subscriptionId);
    this.emit('indicatorUnsubscribed', { symbol: subscription.symbol, subscriptionId });
  }

  public getSubscribedSymbols(): string[] {
    const symbols = new Set<string>();
    
    for (const subscription of this.dataSubscriptions.values()) {
      symbols.add(subscription.symbol);
    }
    
    for (const subscription of this.indicatorSubscriptions.values()) {
      symbols.add(subscription.symbol);
    }

    return Array.from(symbols);
  }

  public getCachedMarketData(symbol: string): MarketData[] {
    return this.marketDataCache.get(symbol) || [];
  }

  public getCachedIndicators(symbol: string, indicator: string): TechnicalIndicator[] {
    const cacheKey = `${symbol}_${indicator}`;
    return this.indicatorCache.get(cacheKey) || [];
  }

  public getCachedQuote(symbol: string): TradingViewQuote | undefined {
    return this.quoteCache.get(symbol);
  }

  public clearCache(symbol?: string): void {
    if (symbol) {
      // Clear cache for specific symbol
      const keysToDelete = Array.from(this.marketDataCache.keys())
        .filter(key => key.startsWith(symbol));
      
      keysToDelete.forEach(key => this.marketDataCache.delete(key));
      
      const indicatorKeysToDelete = Array.from(this.indicatorCache.keys())
        .filter(key => key.startsWith(symbol));
      
      indicatorKeysToDelete.forEach(key => this.indicatorCache.delete(key));
      
      this.quoteCache.delete(symbol);
    } else {
      // Clear all cache
      this.marketDataCache.clear();
      this.indicatorCache.clear();
      this.quoteCache.clear();
    }

    this.emit('cacheCleared', symbol);
  }

  public isConnected(): boolean {
    return this.isInitialized && this.client.isConnected();
  }

  public getConnectionStatus(): {
    initialized: boolean;
    connected: boolean;
    subscribedSymbols: string[];
    activeSubscriptions: number;
    cacheSize: number;
  } {
    return {
      initialized: this.isInitialized,
      connected: this.client.isConnected(),
      subscribedSymbols: this.client.getSubscribedSymbols(),
      activeSubscriptions: this.dataSubscriptions.size + this.indicatorSubscriptions.size,
      cacheSize: this.marketDataCache.size + this.indicatorCache.size + this.quoteCache.size
    };
  }

  public async validateConnection(): Promise<boolean> {
    try {
      return await this.client.validateConnection();
    } catch (error) {
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    this.dataSubscriptions.clear();
    this.indicatorSubscriptions.clear();
    this.clearCache();

    await this.client.disconnect();
    this.isInitialized = false;
    
    this.emit('disconnected');
  }
}