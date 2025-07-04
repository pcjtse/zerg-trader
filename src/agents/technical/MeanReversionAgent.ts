import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, MarketData, TechnicalIndicator, Agent2AgentMessage } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class MeanReversionAgent extends BaseAgent {
  private dataBuffer: Map<string, MarketData[]> = new Map();
  private indicatorBuffer: Map<string, TechnicalIndicator[]> = new Map();

  constructor(config: AgentConfig, enableClaude: boolean = false) {
    super(config, enableClaude, true);
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

  protected onMessage(message: Agent2AgentMessage): void {
    if (message.type === 'DATA' && message.payload.type === 'market-data') {
      this.updateMarketData(message.payload.symbol, message.payload.data);
    }
  }

  protected async onA2AMessage(message: any): Promise<void> {
    if (message.payload?.type === 'market-data') {
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
      confidence = 0.85;
      reasoning = `RSI extremely oversold at ${rsi.value.toFixed(2)}`;
    } else if (rsi.value <= oversoldThreshold) {
      action = 'BUY';
      confidence = 0.65;
      reasoning = `RSI oversold at ${rsi.value.toFixed(2)}`;
    } else if (rsi.value >= extremeOverboughtThreshold) {
      action = 'SELL';
      confidence = 0.85;
      reasoning = `RSI extremely overbought at ${rsi.value.toFixed(2)}`;
    } else if (rsi.value >= overboughtThreshold) {
      action = 'SELL';
      confidence = 0.65;
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
        indicator: 'RSI',
        signal_type: 'MEAN_REVERSION_RSI'
      }
    };
  }

  private analyzeBollingerBands(symbol: string, marketData: MarketData[], indicators: TechnicalIndicator[]): Signal | null {
    if (marketData.length < 20) return null;

    const currentPrice = marketData[marketData.length - 1].close;
    
    // Try to use provided Bollinger Band indicators first
    const bbUpper = indicators.filter(i => i.name === 'BB_UPPER').slice(-1)[0];
    const bbLower = indicators.filter(i => i.name === 'BB_LOWER').slice(-1)[0];
    const bbMiddle = indicators.filter(i => i.name === 'BB_MIDDLE').slice(-1)[0];
    
    let upperBand: number, lowerBand: number, mean: number, stdDev: number;
    
    if (bbUpper && bbLower && bbMiddle) {
      // Use provided Bollinger Band indicators
      upperBand = bbUpper.value;
      lowerBand = bbLower.value;
      mean = bbMiddle.value;
      stdDev = (upperBand - mean) / 2; // Approximate std dev
    } else {
      // Calculate Bollinger Bands from SMA_20
      const sma20 = indicators.filter(i => i.name === 'SMA_20').slice(-1)[0];
      if (!sma20) return null;

      const recent20 = marketData.slice(-20);
      
      // Calculate standard deviation
      mean = sma20.value;
      const variance = recent20.reduce((sum, d) => sum + Math.pow(d.close - mean, 2), 0) / 20;
      stdDev = Math.sqrt(variance);
      
      upperBand = mean + (2 * stdDev);
      lowerBand = mean - (2 * stdDev);
    }
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // Price touching or breaking lower band (oversold)
    if (currentPrice <= lowerBand * 1.01) { // Allow slight tolerance
      const deviation = (lowerBand - currentPrice) / lowerBand;
      action = 'BUY';
      confidence = Math.min(0.8, 0.5 + deviation * 5);
      reasoning = `Price below lower Bollinger Band (${currentPrice.toFixed(2)} vs ${lowerBand.toFixed(2)})`;
    }
    // Price touching or breaking upper band (overbought)
    else if (currentPrice >= upperBand * 0.99) { // Allow slight tolerance
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
        indicator: 'BOLLINGER_BANDS',
        signal_type: 'MEAN_REVERSION_BOLLINGER'
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
        indicator: 'PRICE_DEVIATION',
        signal_type: 'MEAN_REVERSION_DEVIATION'
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
              indicator: 'VOLUME_ANOMALY',
              signal_type: 'MEAN_REVERSION_VOLUME'
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
    const threshold = 0.2;
    if (Math.abs(netScore) < threshold) return null;

    const action: 'BUY' | 'SELL' = netScore > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.85, Math.abs(netScore) / totalScore * 2 + 0.2);
    const strength = confidence * 0.8; // Mean reversion signals are inherently riskier

    const supportingSignals = action === 'BUY' ? buySignals : sellSignals;
    const reasoning = `Composite mean reversion signal based on ${supportingSignals.length} supporting indicators: ${supportingSignals.map(s => s.metadata?.indicator).join(', ')}`;

    const baseSignal: Signal = {
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
        indicator: 'COMPOSITE_MEAN_REVERSION',
        signal_type: 'COMPOSITE_MEAN_REVERSION'
      }
    };

    // Apply risk-adjusted confidence scoring for mean reversion
    const marketData = this.dataBuffer.get(symbol);
    if (marketData && marketData.length > 0) {
      return this.applyMeanReversionRiskAdjustment(baseSignal, marketData);
    }

    return baseSignal;
  }

  private applyMeanReversionRiskAdjustment(signal: Signal, marketData: MarketData[]): Signal {
    if (marketData.length < 20) return signal;

    const recent = marketData.slice(-20);
    const currentPrice = recent[recent.length - 1].close;
    
    // Calculate volatility (ATR approximation)
    let atrSum = 0;
    for (let i = 1; i < recent.length; i++) {
      const tr = Math.max(
        recent[i].high - recent[i].low,
        Math.abs(recent[i].high - recent[i - 1].close),
        Math.abs(recent[i].low - recent[i - 1].close)
      );
      atrSum += tr;
    }
    const atr = atrSum / (recent.length - 1);
    const atrPercent = atr / currentPrice;

    // Calculate trend strength (counter-trend risk for mean reversion)
    const trendPeriods = [5, 10, 20];
    let strongTrendCount = 0;
    
    for (const period of trendPeriods) {
      if (recent.length >= period) {
        const periodData = recent.slice(-period);
        const startPrice = periodData[0].close;
        const endPrice = periodData[periodData.length - 1].close;
        const trendStrength = Math.abs((endPrice - startPrice) / startPrice);
        
        // Strong trend reduces mean reversion confidence
        if (trendStrength > 0.05) { // 5% movement in trend direction
          strongTrendCount++;
        }
      }
    }

    // Calculate volume confirmation
    const avgVolume = recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
    const recentVolume = recent.slice(-3).reduce((sum, d) => sum + d.volume, 0) / 3;
    const volumeRatio = recentVolume / avgVolume;

    // Mean reversion specific risk adjustments
    let riskAdjustment = 1.0;

    // High volatility increases mean reversion opportunity but also risk
    if (atrPercent > 0.06) { // Very high volatility
      riskAdjustment *= 0.7; // Reduce confidence due to unpredictability
    } else if (atrPercent > 0.04) { // High volatility
      riskAdjustment *= 0.85;
    } else if (atrPercent < 0.01) { // Very low volatility
      riskAdjustment *= 0.8; // Reduce confidence - less likely to revert quickly
    }

    // Strong trends reduce mean reversion confidence significantly
    if (strongTrendCount >= 2) {
      riskAdjustment *= 0.6; // Strong trend across multiple timeframes
    } else if (strongTrendCount === 1) {
      riskAdjustment *= 0.8;
    }

    // Low volume reduces mean reversion reliability
    if (volumeRatio < 0.7) {
      riskAdjustment *= 0.8; // Low volume might not support reversal
    } else if (volumeRatio > 2.0) {
      riskAdjustment *= 1.1; // High volume supports potential reversal
    }

    // Position sizing for mean reversion (typically smaller due to counter-trend nature)
    let positionSize = 'SMALL'; // Default for mean reversion
    if (atrPercent < 0.02 && strongTrendCount === 0) {
      positionSize = 'NORMAL';
    } else if (atrPercent > 0.05 || strongTrendCount >= 2) {
      positionSize = 'MICRO';
    }

    const adjustedConfidence = Math.max(0.1, signal.confidence * riskAdjustment);
    const adjustedStrength = Math.max(0.1, signal.strength * riskAdjustment);

    return {
      ...signal,
      confidence: adjustedConfidence,
      strength: adjustedStrength,
      reasoning: `${signal.reasoning} (Mean reversion risk-adjusted: volatility=${(atrPercent * 100).toFixed(1)}%, trend strength=${strongTrendCount}/3)`,
      metadata: {
        ...signal.metadata,
        riskAdjustment: {
          originalConfidence: signal.confidence,
          volatility: atrPercent,
          strongTrendCount,
          volumeRatio,
          positionSize,
          adjustmentFactor: riskAdjustment,
          analysisType: 'MEAN_REVERSION'
        }
      }
    };
  }

  private updateMarketData(symbol: string, data: MarketData[]): void {
    this.dataBuffer.set(symbol, data);
    this.analyze({ symbol, marketData: data, indicators: this.indicatorBuffer.get(symbol) || [] });
  }

  protected getCapabilities(): string[] {
    return [
      'mean-reversion-analysis',
      'bollinger-bands',
      'rsi-analysis',
      'statistical-arbitrage',
      'overbought-oversold-detection',
      'risk-adjusted-mean-reversion',
      'trend-strength-analysis',
      'counter-trend-risk-management',
      'volatility-based-position-sizing'
    ];
  }

  protected getMethodInfo() {
    return [
      {
        name: 'analyze',
        description: 'Perform mean reversion analysis',
        parameters: {
          symbol: 'string',
          marketData: 'MarketData[]',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'analyzeBollingerBands',
        description: 'Analyze Bollinger Bands for mean reversion signals',
        parameters: {
          symbol: 'string',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signal: 'Signal' }
      }
    ];
  }
}