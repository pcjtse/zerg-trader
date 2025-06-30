import { MarketData } from '../types';
import axios from 'axios';

export interface DataProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  rateLimit?: number; // requests per minute
}

export interface DataRequest {
  symbol: string;
  startDate: Date;
  endDate: Date;
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';
}

export abstract class BaseDataProvider {
  protected config: DataProviderConfig;
  protected requestQueue: DataRequest[] = [];
  protected isProcessing: boolean = false;

  constructor(config: DataProviderConfig) {
    this.config = config;
  }

  public abstract fetchHistoricalData(request: DataRequest): Promise<MarketData[]>;

  public async fetchMultipleSymbols(requests: DataRequest[]): Promise<Map<string, MarketData[]>> {
    const results = new Map<string, MarketData[]>();
    
    for (const request of requests) {
      try {
        const data = await this.fetchHistoricalData(request);
        results.set(request.symbol, data);
        
        // Rate limiting
        if (this.config.rateLimit) {
          await this.delay(60000 / this.config.rateLimit);
        }
      } catch (error) {
        console.error(`Failed to fetch data for ${request.symbol}:`, error);
        results.set(request.symbol, []);
      }
    }
    
    return results;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected formatTimestamp(dateString: string): Date {
    return new Date(dateString);
  }
}

export class AlphaVantageProvider extends BaseDataProvider {
  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://www.alphavantage.co/query',
      rateLimit: 5 // 5 requests per minute for free tier
    });
  }

  public async fetchHistoricalData(request: DataRequest): Promise<MarketData[]> {
    const function_name = this.getFunctionName(request.interval);
    const url = `${this.config.baseUrl}?function=${function_name}&symbol=${request.symbol}&apikey=${this.config.apiKey}&outputsize=full&datatype=json`;

    try {
      const response = await axios.get(url);
      const data = response.data;

      if (data['Error Message']) {
        throw new Error(`API Error: ${data['Error Message']}`);
      }

      if (data['Note']) {
        throw new Error(`API Rate Limit: ${data['Note']}`);
      }

      const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));
      if (!timeSeriesKey) {
        throw new Error('Invalid response format from Alpha Vantage');
      }

      const timeSeries = data[timeSeriesKey];
      const marketData: MarketData[] = [];

      for (const [timestamp, values] of Object.entries(timeSeries as Record<string, any>)) {
        const date = this.formatTimestamp(timestamp);
        
        // Filter by date range
        if (date >= request.startDate && date <= request.endDate) {
          marketData.push({
            symbol: request.symbol,
            timestamp: date,
            open: parseFloat(values['1. open']),
            high: parseFloat(values['2. high']),
            low: parseFloat(values['3. low']),
            close: parseFloat(values['4. close']),
            volume: parseInt(values['5. volume'])
          });
        }
      }

      // Sort by timestamp ascending
      return marketData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    } catch (error) {
      throw new Error(`Failed to fetch data from Alpha Vantage: ${error}`);
    }
  }

  private getFunctionName(interval: string): string {
    const mapping: Record<string, string> = {
      '1m': 'TIME_SERIES_INTRADAY',
      '5m': 'TIME_SERIES_INTRADAY',
      '15m': 'TIME_SERIES_INTRADAY',
      '30m': 'TIME_SERIES_INTRADAY',
      '1h': 'TIME_SERIES_INTRADAY',
      '1d': 'TIME_SERIES_DAILY',
      '1w': 'TIME_SERIES_WEEKLY',
      '1M': 'TIME_SERIES_MONTHLY'
    };
    
    return mapping[interval] || 'TIME_SERIES_DAILY';
  }
}

export class MockDataProvider extends BaseDataProvider {
  private mockData: Map<string, MarketData[]> = new Map();

  constructor() {
    super({ rateLimit: 0 });
    this.generateMockData();
  }

  public async fetchHistoricalData(request: DataRequest): Promise<MarketData[]> {
    const data = this.mockData.get(request.symbol) || [];
    
    return data.filter(d => 
      d.timestamp >= request.startDate && 
      d.timestamp <= request.endDate
    );
  }

  public addMockData(symbol: string, data: MarketData[]): void {
    this.mockData.set(symbol, data);
  }

  private generateMockData(): void {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN'];
    const startDate = new Date('2023-01-01');
    const endDate = new Date('2024-01-01');
    
    for (const symbol of symbols) {
      const data = this.generateSymbolData(symbol, startDate, endDate);
      this.mockData.set(symbol, data);
    }
  }

  private generateSymbolData(symbol: string, startDate: Date, endDate: Date): MarketData[] {
    const data: MarketData[] = [];
    let currentPrice = 100 + Math.random() * 100; // Starting price
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      // Generate realistic price movements
      const volatility = 0.02; // 2% daily volatility
      const drift = 0.0005; // Small upward drift
      const change = (Math.random() - 0.5) * volatility + drift;
      
      const open = currentPrice;
      const close = currentPrice * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = Math.floor(1000000 + Math.random() * 5000000);
      
      data.push({
        symbol,
        timestamp: new Date(currentDate),
        open,
        high,
        low,
        close,
        volume
      });
      
      currentPrice = close;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return data;
  }
}

export class CSVDataProvider extends BaseDataProvider {
  private csvData: Map<string, MarketData[]> = new Map();

  constructor() {
    super({ rateLimit: 0 });
  }

  public async fetchHistoricalData(request: DataRequest): Promise<MarketData[]> {
    const data = this.csvData.get(request.symbol) || [];
    
    return data.filter(d => 
      d.timestamp >= request.startDate && 
      d.timestamp <= request.endDate
    );
  }

  public async loadFromCSV(symbol: string, csvContent: string): Promise<void> {
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Find column indices
    const indices = {
      date: this.findColumnIndex(headers, ['date', 'timestamp', 'time']),
      open: this.findColumnIndex(headers, ['open']),
      high: this.findColumnIndex(headers, ['high']),
      low: this.findColumnIndex(headers, ['low']),
      close: this.findColumnIndex(headers, ['close', 'adj close', 'adjusted_close']),
      volume: this.findColumnIndex(headers, ['volume'])
    };

    const data: MarketData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',');
      
      try {
        data.push({
          symbol,
          timestamp: new Date(values[indices.date]),
          open: parseFloat(values[indices.open]),
          high: parseFloat(values[indices.high]),
          low: parseFloat(values[indices.low]),
          close: parseFloat(values[indices.close]),
          volume: parseInt(values[indices.volume]) || 0
        });
      } catch (error) {
        console.warn(`Skipping invalid data row ${i + 1}: ${line}`);
      }
    }
    
    // Sort by timestamp ascending
    data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    this.csvData.set(symbol, data);
  }

  private findColumnIndex(headers: string[], candidates: string[]): number {
    for (const candidate of candidates) {
      const index = headers.findIndex(h => h.includes(candidate));
      if (index >= 0) return index;
    }
    return -1;
  }
}

export class DataProviderFactory {
  public static create(type: 'alphavantage' | 'mock' | 'csv', config?: any): BaseDataProvider {
    switch (type) {
      case 'alphavantage':
        if (!config?.apiKey) {
          throw new Error('Alpha Vantage API key is required');
        }
        return new AlphaVantageProvider(config.apiKey);
      
      case 'mock':
        return new MockDataProvider();
      
      case 'csv':
        return new CSVDataProvider();
      
      default:
        throw new Error(`Unknown data provider type: ${type}`);
    }
  }
}