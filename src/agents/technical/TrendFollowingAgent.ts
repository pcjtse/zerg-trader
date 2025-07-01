import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, MarketData, TechnicalIndicator, Agent2AgentMessage } from '../../types';
import { ClaudeAnalysisRequest } from '../../services/ClaudeClient';
import { v4 as uuidv4 } from 'uuid';

export class TrendFollowingAgent extends BaseAgent {
  private dataBuffer: Map<string, MarketData[]> = new Map();
  private indicatorBuffer: Map<string, TechnicalIndicator[]> = new Map();

  constructor(config: AgentConfig, enableClaude: boolean = true, enableMemory: boolean = true) {
    super(config, enableClaude, true, enableMemory);
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

  protected onMessage(message: Agent2AgentMessage): void {
    if (message.type === 'DATA' && message.payload.type === 'market-data') {
      this.updateMarketData(message.payload.symbol, message.payload.data);
    }
  }

  protected async onA2AMessage(message: any): Promise<void> {
    if (message.payload?.type === 'market-data') {
      this.updateMarketData(message.payload.symbol, message.payload.data);
    } else if (message.payload?.analysisRequest) {
      const { symbol, data } = message.payload.analysisRequest;
      const signals = await this.analyze({ symbol, marketData: data, indicators: [] });
      
      // Send results back via A2A
      if (this.a2aService) {
        await this.sendA2AMessage(message.from, 'analysisResult', {
          requestId: message.id,
          signals,
          agent: this.config.name
        });
      }
    }
  }

  public async analyze(data: { symbol: string; marketData: MarketData[]; indicators: TechnicalIndicator[] }): Promise<Signal[]> {
    const { symbol, marketData, indicators } = data;
    
    if (!marketData || marketData.length < 50) {
      return []; // Need sufficient data for trend analysis
    }

    // Update internal buffers
    this.dataBuffer.set(symbol, marketData);
    this.indicatorBuffer.set(symbol, indicators);

    // Get traditional technical analysis signals
    const technicalSignals = await this.getTechnicalSignals(symbol, marketData, indicators);

    // Enhance with Claude analysis if available
    let enhancedSignals = technicalSignals;
    if (this.claudeClient) {
      try {
        // Get memory context for enhanced analysis
        const memoryContext = await this.getMemoryContext(symbol, 'technical');
        
        const claudeRequest: ClaudeAnalysisRequest = {
          type: 'technical',
          data: marketData,
          symbol,
          context: `Trend following analysis for ${symbol}. Technical indicators: ${indicators.map(i => `${i.name}=${i.value}`).join(', ')}. ${memoryContext}`
        };
        
        const claudeSignals = await this.analyzeWithClaude(claudeRequest);
        enhancedSignals = this.combineSignals(technicalSignals, claudeSignals);
      } catch (error) {
        this.log('warn', `Claude analysis failed for ${symbol}: ${error}`);
      }
    }

    // Store market context in memory for future reference
    if (this.enableMemory && this.memoryService && enhancedSignals.length > 0) {
      await this.storeMarketContext(symbol, marketData, enhancedSignals);
    }

    // Generate composite trend signal
    const compositeSignal = this.generateCompositeSignal(symbol, enhancedSignals);
    if (compositeSignal) {
      enhancedSignals.push(compositeSignal);
      this.emitSignal(compositeSignal);
      
      // Broadcast signal via A2A protocol
      if (this.a2aService) {
        await this.broadcastSignal(compositeSignal);
      }
    }

    this.lastUpdate = new Date();
    return enhancedSignals;
  }

  private async storeMarketContext(symbol: string, marketData: MarketData[], signals: Signal[]): Promise<void> {
    if (!this.memoryService) return;

    try {
      const recent = marketData.slice(-20);
      const currentPrice = recent[recent.length - 1].close;
      const priceChange = (currentPrice - recent[0].close) / recent[0].close;
      
      // Determine market condition based on signals and price action
      const buySignals = signals.filter(s => s.action === 'BUY');
      const sellSignals = signals.filter(s => s.action === 'SELL');
      
      let marketCondition: 'bullish' | 'bearish' | 'neutral' | 'volatile';
      if (buySignals.length > sellSignals.length && priceChange > 0.02) {
        marketCondition = 'bullish';
      } else if (sellSignals.length > buySignals.length && priceChange < -0.02) {
        marketCondition = 'bearish';
      } else if (Math.abs(priceChange) > 0.05) {
        marketCondition = 'volatile';
      } else {
        marketCondition = 'neutral';
      }

      // Determine trend
      let trend: 'uptrend' | 'downtrend' | 'sideways';
      if (priceChange > 0.01) {
        trend = 'uptrend';
      } else if (priceChange < -0.01) {
        trend = 'downtrend';
      } else {
        trend = 'sideways';
      }

      // Calculate volatility
      const prices = recent.map(d => d.close);
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
      const volatility = Math.sqrt(variance) / avgPrice;

      // Calculate average volume
      const avgVolume = recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
      const recentVolume = recent.slice(-5).reduce((sum, d) => sum + d.volume, 0) / 5;
      const volumeRatio = recentVolume / avgVolume;
      
      let volume: 'high' | 'normal' | 'low';
      if (volumeRatio > 1.3) {
        volume = 'high';
      } else if (volumeRatio < 0.7) {
        volume = 'low';
      } else {
        volume = 'normal';
      }

      await this.memoryService.storeMarketContext(
        this.config.id,
        {
          symbol,
          timeframe: '1d',
          marketCondition,
          keyLevels: {
            support: this.findSupportLevels(recent),
            resistance: this.findResistanceLevels(recent)
          },
          volatility,
          volume,
          trend,
          lastAnalysis: new Date()
        },
        0.8 // High importance for market context
      );
    } catch (error) {
      this.log('warn', `Failed to store market context: ${error}`);
    }
  }

  private findSupportLevels(data: MarketData[]): number[] {
    const lows = data.map(d => d.low).sort((a, b) => a - b);
    return lows.slice(0, 3); // Return 3 lowest levels as support
  }

  private findResistanceLevels(data: MarketData[]): number[] {
    const highs = data.map(d => d.high).sort((a, b) => b - a);
    return highs.slice(0, 3); // Return 3 highest levels as resistance
  }

  private async getTechnicalSignals(symbol: string, marketData: MarketData[], indicators: TechnicalIndicator[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    
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

    return signals;
  }

  private combineSignals(technicalSignals: Signal[], claudeSignals: Signal[]): Signal[] {
    const combined = [...technicalSignals];
    
    // Add Claude signals with adjusted confidence to account for LLM uncertainty
    claudeSignals.forEach(claudeSignal => {
      // Reduce Claude confidence slightly to account for model uncertainty
      const adjustedSignal = {
        ...claudeSignal,
        confidence: claudeSignal.confidence * 0.9,
        reasoning: `Claude Analysis: ${claudeSignal.reasoning}`,
        metadata: {
          ...claudeSignal.metadata,
          source: 'claude',
          originalConfidence: claudeSignal.confidence
        }
      };
      combined.push(adjustedSignal);
    });
    
    return combined;
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

  // Expose method for testing signal outcomes
  public async recordSignalPerformance(signalId: string, outcome: {
    priceMovement: number;
    timeToTarget: number;
    accuracy: number;
  }): Promise<void> {
    await this.recordSignalOutcome(signalId, outcome);
  }

  protected getCapabilities(): string[] {
    return [
      'trend-analysis',
      'sma-analysis',
      'ema-analysis',
      'macd-analysis',
      'momentum-analysis',
      'composite-signals',
      'real-time-analysis',
      'claude-enhanced-analysis',
      'memory-contextual-analysis',
      'adaptive-learning'
    ];
  }

  protected getMethodInfo() {
    return [
      {
        name: 'analyze',
        description: 'Perform comprehensive trend following analysis',
        parameters: {
          symbol: 'string',
          marketData: 'MarketData[]',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'getTechnicalSignals',
        description: 'Get traditional technical analysis signals',
        parameters: {
          symbol: 'string',
          marketData: 'MarketData[]',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'analyzeWithClaude',
        description: 'Enhance analysis with Claude AI insights',
        parameters: {
          request: 'ClaudeAnalysisRequest'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'getMemoryContext',
        description: 'Retrieve relevant memory context for analysis',
        parameters: {
          symbol: 'string',
          analysisType: 'string'
        },
        returns: { context: 'string' }
      },
      {
        name: 'storeMarketContext',
        description: 'Store market context in memory for future reference',
        parameters: {
          symbol: 'string',
          marketData: 'MarketData[]',
          signals: 'Signal[]'
        }
      }
    ];
  }
}