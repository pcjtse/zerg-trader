import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, MarketData, TechnicalIndicator } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class MeanReversionAgent extends BaseAgent {
  private dataBuffer: Map<string, MarketData[]> = new Map();
  private indicatorBuffer: Map<string, TechnicalIndicator[]> = new Map();

  constructor(config: AgentConfig) {
    super(config);
  }

  protected async onStart(): Promise<void> {
    this.log('info', 'Mean Reversion Agent started');
    this.emit('subscribe', { type: 'market-data', symbols: this.config.parameters.symbols || [] });
  }

  protected async onStop(): Promise<void> {
    this.log('info', 'Mean Reversion Agent stopped');
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
    
    if (!marketData || marketData.length < 30) {
      return [];
    }

    const signals: Signal[] = [];
    
    this.dataBuffer.set(symbol, marketData);
    this.indicatorBuffer.set(symbol, indicators);

    // Mean reversion analysis
    const rsiSignal = this.analyzeRSISignal(symbol, indicators);
    const bollingerSignal = this.analyzeBollingerBands(symbol, marketData, indicators);
    const priceDeviationSignal = this.analyzePriceDeviation(symbol, marketData);
    const volumeSignal = this.analyzeVolumeAnomaly(symbol, marketData);

    if (rsiSignal) signals.push(rsiSignal);
    if (bollingerSignal) signals.push(bollingerSignal);
    if (priceDeviationSignal) signals.push(priceDeviationSignal);
    if (volumeSignal) signals.push(volumeSignal);

    // Generate composite mean reversion signal
    const compositeSignal = this.generateCompositeSignal(symbol, signals);
    if (compositeSignal) {
      signals.push(compositeSignal);
      this.emitSignal(compositeSignal);
    }

    this.lastUpdate = new Date();
    return signals;
  }

  private analyzeRSISignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const rsi = indicators.filter(i => i.name === 'RSI').slice(-1)[0];
    if (!rsi) return null;

    const oversoldThreshold = this.config.parameters.rsiOversold || 30;
    const overboughtThreshold = this.config.parameters.rsiOverbought || 70;
    const extremeOversoldThreshold = this.config.parameters.rsiExtremeOversold || 20;
    const extremeOverboughtThreshold = this.config.parameters.rsiExtremeOverbought || 80;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (rsi.value <= extremeOversoldThreshold) {
      action = 'BUY';
      confidence = 0.8;
      reasoning = `RSI extremely oversold at ${rsi.value.toFixed(2)}`;
    } else if (rsi.value <= oversoldThreshold) {
      action = 'BUY';
      confidence = 0.6;
      reasoning = `RSI oversold at ${rsi.value.toFixed(2)}`;
    } else if (rsi.value >= extremeOverboughtThreshold) {
      action = 'SELL';
      confidence = 0.8;
      reasoning = `RSI extremely overbought at ${rsi.value.toFixed(2)}`;
    } else if (rsi.value >= overboughtThreshold) {
      action = 'SELL';
      confidence = 0.6;
      reasoning = `RSI overbought at ${rsi.value.toFixed(2)}`;
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
        rsi: rsi.value,
        oversoldThreshold,
        overboughtThreshold,
        indicator: 'RSI'
      }
    };
  }

  private analyzeBollingerBands(symbol: string, marketData: MarketData[], indicators: TechnicalIndicator[]): Signal | null {
    if (marketData.length < 20) return null;

    const sma20 = indicators.filter(i => i.name === 'SMA_20').slice(-1)[0];
    if (!sma20) return null;

    const recent20 = marketData.slice(-20);
    const currentPrice = marketData[marketData.length - 1].close;
    
    // Calculate standard deviation
    const mean = sma20.value;
    const variance = recent20.reduce((sum, d) => sum + Math.pow(d.close - mean, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    
    const upperBand = mean + (2 * stdDev);
    const lowerBand = mean - (2 * stdDev);
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // Price touching or breaking lower band (oversold)
    if (currentPrice <= lowerBand) {
      const deviation = (lowerBand - currentPrice) / lowerBand;
      action = 'BUY';
      confidence = Math.min(0.8, 0.5 + deviation * 5);
      reasoning = `Price below lower Bollinger Band (${currentPrice.toFixed(2)} vs ${lowerBand.toFixed(2)})`;
    }
    // Price touching or breaking upper band (overbought)
    else if (currentPrice >= upperBand) {
      const deviation = (currentPrice - upperBand) / upperBand;
      action = 'SELL';
      confidence = Math.min(0.8, 0.5 + deviation * 5);
      reasoning = `Price above upper Bollinger Band (${currentPrice.toFixed(2)} vs ${upperBand.toFixed(2)})`;
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength: confidence * 0.8,
      timestamp: new Date(),
      reasoning,
      metadata: {
        currentPrice,
        upperBand,
        lowerBand,
        sma20: mean,
        stdDev,
        indicator: 'BOLLINGER_BANDS'
      }
    };
  }

  private analyzePriceDeviation(symbol: string, marketData: MarketData[]): Signal | null {
    if (marketData.length < 50) return null;

    const recent = marketData.slice(-50);
    const currentPrice = marketData[marketData.length - 1].close;
    
    // Calculate price statistics
    const prices = recent.map(d => d.close);
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    
    const zScore = (currentPrice - mean) / stdDev;
    const deviationThreshold = this.config.parameters.deviationThreshold || 2;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (zScore <= -deviationThreshold) {
      action = 'BUY';
      confidence = Math.min(0.9, Math.abs(zScore) / 3);
      reasoning = `Price significantly below mean (Z-score: ${zScore.toFixed(2)})`;
    } else if (zScore >= deviationThreshold) {
      action = 'SELL';
      confidence = Math.min(0.9, Math.abs(zScore) / 3);
      reasoning = `Price significantly above mean (Z-score: ${zScore.toFixed(2)})`;
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength: confidence * 0.75,
      timestamp: new Date(),
      reasoning,
      metadata: {
        currentPrice,
        mean,
        stdDev,
        zScore,
        indicator: 'PRICE_DEVIATION'
      }
    };
  }

  private analyzeVolumeAnomaly(symbol: string, marketData: MarketData[]): Signal | null {
    if (marketData.length < 20) return null;

    const recent = marketData.slice(-20);
    const current = recent[recent.length - 1];
    const previous = recent[recent.length - 2];
    
    const avgVolume = recent.slice(0, -1).reduce((sum, d) => sum + d.volume, 0) / (recent.length - 1);
    const volumeRatio = current.volume / avgVolume;
    const priceChange = (current.close - previous.close) / previous.close;

    // Look for volume anomalies with price reversals
    const volumeThreshold = this.config.parameters.volumeThreshold || 2;
    
    if (volumeRatio >= volumeThreshold) {
      // High volume with small price change might indicate reversal
      if (Math.abs(priceChange) < 0.01) {
        let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        let confidence = 0;
        let reasoning = '';

        // Determine direction based on recent trend
        const recentTrend = (current.close - recent[recent.length - 5].close) / recent[recent.length - 5].close;
        
        if (recentTrend > 0.05) { // Strong uptrend, possible reversal
          action = 'SELL';
          confidence = Math.min(0.7, (volumeRatio - 1) * 0.2);
          reasoning = `High volume with stalling price after uptrend suggests potential reversal`;
        } else if (recentTrend < -0.05) { // Strong downtrend, possible reversal
          action = 'BUY';
          confidence = Math.min(0.7, (volumeRatio - 1) * 0.2);
          reasoning = `High volume with stalling price after downtrend suggests potential reversal`;
        }

        if (action !== 'HOLD') {
          return {
            id: uuidv4(),
            agent_id: this.config.id,
            symbol,
            action,
            confidence,
            strength: confidence * 0.6, // Volume signals are less reliable
            timestamp: new Date(),
            reasoning,
            metadata: {
              volumeRatio,
              avgVolume,
              currentVolume: current.volume,
              priceChange,
              recentTrend,
              indicator: 'VOLUME_ANOMALY'
            }
          };
        }
      }
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
    
    // Higher threshold for mean reversion signals as they're counter-trend
    const threshold = 0.4;
    if (Math.abs(netScore) < threshold) return null;

    const action = netScore > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.85, Math.abs(netScore) / totalScore * 2);
    const strength = confidence * 0.8; // Mean reversion signals are inherently riskier

    const supportingSignals = action === 'BUY' ? buySignals : sellSignals;
    const reasoning = `Composite mean reversion signal based on ${supportingSignals.length} supporting indicators: ${supportingSignals.map(s => s.metadata?.indicator).join(', ')}`;

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
        indicator: 'COMPOSITE_MEAN_REVERSION'
      }
    };
  }

  private updateMarketData(symbol: string, data: MarketData[]): void {
    this.dataBuffer.set(symbol, data);
    this.analyze({ symbol, marketData: data, indicators: this.indicatorBuffer.get(symbol) || [] });
  }
}