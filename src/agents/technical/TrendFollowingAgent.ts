import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, MarketData, TechnicalIndicator } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class TrendFollowingAgent extends BaseAgent {
  private dataBuffer: Map<string, MarketData[]> = new Map();
  private indicatorBuffer: Map<string, TechnicalIndicator[]> = new Map();

  constructor(config: AgentConfig) {
    super(config);
  }

  protected async onStart(): Promise<void> {
    this.log('info', 'Trend Following Agent started');
    // Subscribe to market data updates
    this.emit('subscribe', { type: 'market-data', symbols: this.config.parameters.symbols || [] });
  }

  protected async onStop(): Promise<void> {
    this.log('info', 'Trend Following Agent stopped');
    this.dataBuffer.clear();
    this.indicatorBuffer.clear();
  }

  protected onMessage(message: any): void {
    if (message.type === 'DATA' && message.payload.type === 'market-data') {
      this.updateMarketData(message.payload.symbol, message.payload.data);
    }
  }

  public async analyze(data: { symbol: string; marketData: MarketData[]; indicators: TechnicalIndicator[] }): Promise<Signal[]> {
    const { symbol, marketData, indicators } = data;
    
    if (!marketData || marketData.length < 50) {
      return []; // Need sufficient data for trend analysis
    }

    const signals: Signal[] = [];
    
    // Update internal buffers
    this.dataBuffer.set(symbol, marketData);
    this.indicatorBuffer.set(symbol, indicators);

    // Analyze different trend indicators
    const smaSignal = this.analyzeSMASignal(symbol, indicators);
    const emaSignal = this.analyzeEMASignal(symbol, indicators);
    const macdSignal = this.analyzeMACDSignal(symbol, indicators);
    const momentumSignal = this.analyzeMomentumSignal(symbol, marketData);

    // Combine signals
    if (smaSignal) signals.push(smaSignal);
    if (emaSignal) signals.push(emaSignal);
    if (macdSignal) signals.push(macdSignal);
    if (momentumSignal) signals.push(momentumSignal);

    // Generate composite trend signal
    const compositeSignal = this.generateCompositeSignal(symbol, signals);
    if (compositeSignal) {
      signals.push(compositeSignal);
      this.emitSignal(compositeSignal);
    }

    this.lastUpdate = new Date();
    return signals;
  }

  private analyzeSMASignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const sma20 = indicators.filter(i => i.name === 'SMA_20').slice(-1)[0];
    const sma50 = indicators.filter(i => i.name === 'SMA_50').slice(-1)[0];
    const sma200 = indicators.filter(i => i.name === 'SMA_200').slice(-1)[0];

    if (!sma20 || !sma50 || !sma200) return null;

    const marketData = this.dataBuffer.get(symbol);
    if (!marketData || marketData.length === 0) return null;

    const currentPrice = marketData[marketData.length - 1].close;
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // Golden Cross: SMA20 > SMA50 > SMA200 and price > SMA20
    if (sma20.value > sma50.value && sma50.value > sma200.value && currentPrice > sma20.value) {
      action = 'BUY';
      confidence = 0.7;
      reasoning = 'Golden Cross pattern detected - all SMAs aligned bullishly';
    }
    // Death Cross: SMA20 < SMA50 < SMA200 and price < SMA20
    else if (sma20.value < sma50.value && sma50.value < sma200.value && currentPrice < sma20.value) {
      action = 'SELL';
      confidence = 0.7;
      reasoning = 'Death Cross pattern detected - all SMAs aligned bearishly';
    }
    // Partial bullish alignment
    else if (sma20.value > sma50.value && currentPrice > sma20.value) {
      action = 'BUY';
      confidence = 0.4;
      reasoning = 'Partial bullish SMA alignment';
    }
    // Partial bearish alignment
    else if (sma20.value < sma50.value && currentPrice < sma20.value) {
      action = 'SELL';
      confidence = 0.4;
      reasoning = 'Partial bearish SMA alignment';
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength: confidence * 0.8, // SMA signals are reliable but not the strongest
      timestamp: new Date(),
      reasoning,
      metadata: {
        sma20: sma20.value,
        sma50: sma50.value,
        sma200: sma200.value,
        currentPrice,
        indicator: 'SMA'
      }
    };
  }

  private analyzeEMASignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const ema12 = indicators.filter(i => i.name === 'EMA_12').slice(-1)[0];
    const ema26 = indicators.filter(i => i.name === 'EMA_26').slice(-1)[0];

    if (!ema12 || !ema26) return null;

    const marketData = this.dataBuffer.get(symbol);
    if (!marketData || marketData.length === 0) return null;

    const currentPrice = marketData[marketData.length - 1].close;
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // EMA crossover signals
    if (ema12.value > ema26.value && currentPrice > ema12.value) {
      const spread = (ema12.value - ema26.value) / ema26.value;
      if (spread > 0.01) { // 1% spread threshold
        action = 'BUY';
        confidence = Math.min(0.8, 0.5 + spread * 10);
        reasoning = 'EMA12 above EMA26 with strong momentum';
      }
    } else if (ema12.value < ema26.value && currentPrice < ema12.value) {
      const spread = (ema26.value - ema12.value) / ema26.value;
      if (spread > 0.01) {
        action = 'SELL';
        confidence = Math.min(0.8, 0.5 + spread * 10);
        reasoning = 'EMA12 below EMA26 with strong momentum';
      }
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength: confidence * 0.9, // EMA signals are more responsive
      timestamp: new Date(),
      reasoning,
      metadata: {
        ema12: ema12.value,
        ema26: ema26.value,
        currentPrice,
        indicator: 'EMA'
      }
    };
  }

  private analyzeMACDSignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const macd = indicators.filter(i => i.name === 'MACD').slice(-1)[0];
    const signal = indicators.filter(i => i.name === 'MACD_SIGNAL').slice(-1)[0];
    const histogram = indicators.filter(i => i.name === 'MACD_HISTOGRAM').slice(-1)[0];

    if (!macd || !signal || !histogram) return null;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // MACD bullish crossover
    if (macd.value > signal.value && histogram.value > 0) {
      const momentum = Math.abs(histogram.value) / Math.abs(macd.value);
      action = 'BUY';
      confidence = Math.min(0.8, 0.5 + momentum);
      reasoning = 'MACD bullish crossover with positive histogram';
    }
    // MACD bearish crossover
    else if (macd.value < signal.value && histogram.value < 0) {
      const momentum = Math.abs(histogram.value) / Math.abs(macd.value);
      action = 'SELL';
      confidence = Math.min(0.8, 0.5 + momentum);
      reasoning = 'MACD bearish crossover with negative histogram';
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength: confidence * 0.85,
      timestamp: new Date(),
      reasoning,
      metadata: {
        macd: macd.value,
        signal: signal.value,
        histogram: histogram.value,
        indicator: 'MACD'
      }
    };
  }

  private analyzeMomentumSignal(symbol: string, marketData: MarketData[]): Signal | null {
    if (marketData.length < 20) return null;

    const recent = marketData.slice(-20);
    const current = recent[recent.length - 1];
    const previous = recent[recent.length - 2];
    
    // Calculate momentum indicators
    const priceChange = (current.close - previous.close) / previous.close;
    const volumeRatio = current.volume / (recent.slice(-5).reduce((sum, d) => sum + d.volume, 0) / 5);
    
    // High volume momentum
    if (Math.abs(priceChange) > 0.02 && volumeRatio > 1.5) {
      const action = priceChange > 0 ? 'BUY' : 'SELL';
      const confidence = Math.min(0.7, Math.abs(priceChange) * 10 + (volumeRatio - 1) * 0.2);
      
      return {
        id: uuidv4(),
        agent_id: this.config.id,
        symbol,
        action,
        confidence,
        strength: confidence * 0.9,
        timestamp: new Date(),
        reasoning: `Strong momentum with ${priceChange > 0 ? 'positive' : 'negative'} price change and high volume`,
        metadata: {
          priceChange,
          volumeRatio,
          currentPrice: current.close,
          indicator: 'MOMENTUM'
        }
      };
    }

    return null;
  }

  private generateCompositeSignal(symbol: string, signals: Signal[]): Signal | null {
    if (signals.length === 0) return null;

    const buySignals = signals.filter(s => s.action === 'BUY');
    const sellSignals = signals.filter(s => s.action === 'SELL');
    
    if (buySignals.length === 0 && sellSignals.length === 0) return null;

    // Calculate weighted scores
    const buyScore = buySignals.reduce((sum, s) => sum + s.confidence * s.strength, 0);
    const sellScore = sellSignals.reduce((sum, s) => sum + s.confidence * s.strength, 0);
    
    const totalScore = buyScore + sellScore;
    const netScore = buyScore - sellScore;
    
    // Require minimum threshold for signal generation
    const threshold = 0.3;
    if (Math.abs(netScore) < threshold) return null;

    const action = netScore > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.9, Math.abs(netScore) / totalScore * 2);
    const strength = confidence * 0.95;

    const supportingSignals = action === 'BUY' ? buySignals : sellSignals;
    const reasoning = `Composite trend signal based on ${supportingSignals.length} supporting indicators: ${supportingSignals.map(s => s.metadata?.indicator).join(', ')}`;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength,
      timestamp: new Date(),
      reasoning,
      metadata: {
        buyScore,
        sellScore,
        netScore,
        supportingSignals: supportingSignals.length,
        indicator: 'COMPOSITE_TREND'
      }
    };
  }

  private updateMarketData(symbol: string, data: MarketData[]): void {
    this.dataBuffer.set(symbol, data);
    // Trigger analysis when new data arrives
    this.analyze({ symbol, marketData: data, indicators: this.indicatorBuffer.get(symbol) || [] });
  }
}