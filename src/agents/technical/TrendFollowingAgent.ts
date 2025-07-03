import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, MarketData, TechnicalIndicator, Agent2AgentMessage, TradingViewConfig } from '../../types';
import { ClaudeAnalysisRequest } from '../../services/ClaudeClient';
import { TradingViewDataService } from '../../services/TradingViewDataService';
import { v4 as uuidv4 } from 'uuid';

export class TrendFollowingAgent extends BaseAgent {
  private dataBuffer: Map<string, MarketData[]> = new Map();
  private indicatorBuffer: Map<string, TechnicalIndicator[]> = new Map();
  private tradingViewService?: TradingViewDataService;
  private enableTradingView: boolean;
  private dataSubscriptions: Map<string, string> = new Map();

  constructor(
    config: AgentConfig, 
    enableClaude: boolean = true, 
    enableMemory: boolean = true,
    enableTradingView: boolean = false,
    tradingViewConfig?: TradingViewConfig
  ) {
    super(config, enableClaude, true, enableMemory);
    this.enableTradingView = enableTradingView;
    
    if (enableTradingView) {
      this.tradingViewService = new TradingViewDataService(tradingViewConfig);
      this.setupTradingViewHandlers();
    }
  }

  private setupTradingViewHandlers(): void {
    if (!this.tradingViewService) return;

    this.tradingViewService.on('realtimeUpdate', (data: MarketData) => {
      this.updateMarketData(data.symbol, [data]);
    });

    this.tradingViewService.on('historicalDataLoaded', ({ symbol, data }) => {
      this.updateMarketData(symbol, data);
    });

    this.tradingViewService.on('indicatorsLoaded', ({ symbol, indicator, data }) => {
      this.updateIndicators(symbol, data);
    });

    this.tradingViewService.on('error', (error) => {
      this.log('error', `TradingView service error: ${error}`);
    });
  }

  protected async onStart(): Promise<void> {
    this.log('info', 'Trend Following Agent started');
    
    if (this.enableTradingView && this.tradingViewService) {
      try {
        await this.tradingViewService.initialize();
        this.log('info', 'TradingView service initialized');
        
        // Subscribe to TradingView data for configured symbols
        const symbols = this.config.parameters.symbols || [];
        for (const symbol of symbols) {
          await this.subscribeToTradingViewData(symbol);
        }
      } catch (error) {
        this.log('error', `Failed to initialize TradingView service: ${error}`);
        // Fall back to traditional data sources
        this.emit('subscribe', { type: 'market-data', symbols: this.config.parameters.symbols || [] });
      }
    } else {
      // Subscribe to traditional market data updates
      this.emit('subscribe', { type: 'market-data', symbols: this.config.parameters.symbols || [] });
    }
  }

  protected async onStop(): Promise<void> {
    this.log('info', 'Trend Following Agent stopped');
    
    if (this.enableTradingView && this.tradingViewService) {
      // Unsubscribe from all TradingView data
      for (const [symbol, subscriptionId] of this.dataSubscriptions) {
        this.tradingViewService.unsubscribeFromMarketData(subscriptionId);
      }
      this.dataSubscriptions.clear();
      
      await this.tradingViewService.disconnect();
    }
    
    this.dataBuffer.clear();
    this.indicatorBuffer.clear();
  }

  private async subscribeToTradingViewData(symbol: string): Promise<void> {
    if (!this.tradingViewService) return;

    try {
      // Subscribe to real-time market data
      const subscriptionId = this.tradingViewService.subscribeToMarketData(
        symbol,
        this.config.parameters.resolution || '1D',
        (data: MarketData) => {
          this.updateMarketData(symbol, [data]);
        }
      );
      
      this.dataSubscriptions.set(symbol, subscriptionId);

      // Get initial historical data
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      
      const historicalData = await this.tradingViewService.getHistoricalData(
        symbol,
        this.config.parameters.resolution || '1D',
        startDate,
        endDate
      );

      if (historicalData.length > 0) {
        this.updateMarketData(symbol, historicalData);
      }

      // Get technical indicators
      await this.loadTradingViewIndicators(symbol, startDate, endDate);

      this.log('info', `Subscribed to TradingView data for ${symbol}`);
    } catch (error) {
      this.log('error', `Failed to subscribe to TradingView data for ${symbol}: ${error}`);
    }
  }

  private async loadTradingViewIndicators(symbol: string, startDate: Date, endDate: Date): Promise<void> {
    if (!this.tradingViewService) return;

    const resolution = this.config.parameters.resolution || '1D';
    const indicators = ['SMA', 'EMA', 'RSI', 'MACD', 'STOCH', 'ADX', 'ATR', 'WILLR', 'CCI'];

    try {
      for (const indicator of indicators) {
        const period = this.config.parameters[`${indicator.toLowerCase()}_period`] || 14;
        
        const indicatorData = await this.tradingViewService.getTechnicalIndicators(
          symbol,
          indicator as any,
          resolution,
          period,
          startDate,
          endDate
        );

        if (indicatorData.length > 0) {
          this.updateIndicators(symbol, indicatorData);
        }
      }
    } catch (error) {
      this.log('warn', `Failed to load indicators for ${symbol}: ${error}`);
    }
  }

  private updateIndicators(symbol: string, indicators: TechnicalIndicator[]): void {
    const existing = this.indicatorBuffer.get(symbol) || [];
    const combined = [...existing, ...indicators];
    
    // Remove duplicates and sort by timestamp
    const unique = combined.reduce((acc, indicator) => {
      const key = `${indicator.name}_${indicator.timestamp.getTime()}`;
      if (!acc.has(key)) {
        acc.set(key, indicator);
      }
      return acc;
    }, new Map<string, TechnicalIndicator>());

    const sorted = Array.from(unique.values()).sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    this.indicatorBuffer.set(symbol, sorted);
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
    
    // Analyze advanced indicators
    const stochasticSignal = this.analyzeStochasticSignal(symbol, indicators);
    const adxSignal = this.analyzeADXSignal(symbol, indicators);
    const williamsSignal = this.analyzeWilliamsSignal(symbol, indicators);
    const cciSignal = this.analyzeCCISignal(symbol, indicators);

    // Combine signals
    if (smaSignal) signals.push(smaSignal);
    if (emaSignal) signals.push(emaSignal);
    if (macdSignal) signals.push(macdSignal);
    if (momentumSignal) signals.push(momentumSignal);
    if (stochasticSignal) signals.push(stochasticSignal);
    if (adxSignal) signals.push(adxSignal);
    if (williamsSignal) signals.push(williamsSignal);
    if (cciSignal) signals.push(cciSignal);

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
    // Neutral/sideways trend - generate HOLD signal with low confidence
    else {
      action = 'HOLD';
      confidence = 0.3;
      reasoning = 'Neutral SMA alignment - no clear trend direction';
    }

    // Always return a signal (including HOLD for neutral conditions)
    // if (action === 'HOLD') return null;

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

    // Generate HOLD signal for neutral EMA conditions
    if (action === 'HOLD') {
      confidence = 0.25;
      reasoning = 'EMA alignment shows neutral/sideways trend';
    }

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
    
    // Generate HOLD signal for neutral MACD conditions
    if (action === 'HOLD') {
      confidence = 0.2;
      reasoning = 'MACD showing neutral momentum - no clear directional signal';
    }

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

    // Generate HOLD signal for low momentum/neutral conditions
    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action: 'HOLD',
      confidence: 0.15,
      strength: 0.15,
      timestamp: new Date(),
      reasoning: 'Low momentum and volume - neutral market conditions',
      metadata: {
        priceChange,
        volumeRatio,
        currentPrice: current.close,
        indicator: 'MOMENTUM'
      }
    };
  }

  private generateCompositeSignal(symbol: string, signals: Signal[]): Signal | null {
    if (signals.length === 0) return null;

    const buySignals = signals.filter(s => s.action === 'BUY');
    const sellSignals = signals.filter(s => s.action === 'SELL');
    const holdSignals = signals.filter(s => s.action === 'HOLD');
    
    // If no BUY/SELL signals but have HOLD signals, generate composite HOLD
    if (buySignals.length === 0 && sellSignals.length === 0 && holdSignals.length > 0) {
      const avgConfidence = holdSignals.reduce((sum, s) => sum + s.confidence, 0) / holdSignals.length;
      return {
        id: uuidv4(),
        agent_id: this.config.id,
        symbol,
        action: 'HOLD',
        confidence: Math.min(0.6, avgConfidence * 1.2),
        strength: avgConfidence,
        timestamp: new Date(),
        reasoning: `Composite neutral trend signal based on ${holdSignals.length} indicators showing sideways movement`,
        metadata: {
          buyScore: 0,
          sellScore: 0,
          netScore: 0,
          supportingSignals: holdSignals.length,
          indicators: holdSignals.map(s => s.metadata?.indicator),
          compositeType: 'NEUTRAL_CONSENSUS'
        }
      };
    }
    
    if (buySignals.length === 0 && sellSignals.length === 0) return null;

    // Calculate weighted scores
    const buyScore = buySignals.reduce((sum, s) => sum + s.confidence * s.strength, 0);
    const sellScore = sellSignals.reduce((sum, s) => sum + s.confidence * s.strength, 0);
    
    const totalScore = buyScore + sellScore;
    const netScore = buyScore - sellScore;
    
    // Require minimum threshold for signal generation
    const threshold = 0.3;
    if (Math.abs(netScore) < threshold) {
      // If signals are weak but present, generate low-confidence HOLD
      if (buySignals.length > 0 || sellSignals.length > 0) {
        return {
          id: uuidv4(),
          agent_id: this.config.id,
          symbol,
          action: 'HOLD',
          confidence: 0.4,
          strength: 0.3,
          timestamp: new Date(),
          reasoning: `Weak composite signal below threshold - conflicting or low-confidence indicators`,
          metadata: {
            buyScore,
            sellScore,
            netScore,
            supportingSignals: buySignals.length + sellSignals.length,
            indicators: signals.map(s => s.metadata?.indicator),
            compositeType: 'WEAK_SIGNALS'
          }
        };
      }
      return null;
    }

    const action: 'BUY' | 'SELL' = netScore > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.9, Math.abs(netScore) / totalScore * 2);
    const strength = confidence * 0.95;

    const supportingSignals = action === 'BUY' ? buySignals : sellSignals;
    const reasoning = `Composite trend signal based on ${supportingSignals.length} supporting indicators: ${supportingSignals.map(s => s.metadata?.indicator).join(', ')}`;

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
        indicator: 'COMPOSITE_TREND'
      }
    };

    // Apply risk-adjusted confidence scoring
    const marketData = this.dataBuffer.get(symbol);
    if (marketData && marketData.length > 0) {
      return this.applyRiskAdjustment(baseSignal, marketData);
    }

    return baseSignal;
  }

  private analyzeStochasticSignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const stochK = indicators.filter(i => i.name === 'STOCH_K').slice(-1)[0];
    const stochD = indicators.filter(i => i.name === 'STOCH_D').slice(-1)[0];

    if (!stochK || !stochD) return null;

    const oversoldThreshold = this.config.parameters.stochOversold || 20;
    const overboughtThreshold = this.config.parameters.stochOverbought || 80;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // Stochastic crossover signals
    if (stochK.value > stochD.value && stochK.value < oversoldThreshold) {
      action = 'BUY';
      confidence = 0.7;
      reasoning = `Stochastic oversold bullish crossover (K=${stochK.value.toFixed(2)}, D=${stochD.value.toFixed(2)})`;
    } else if (stochK.value < stochD.value && stochK.value > overboughtThreshold) {
      action = 'SELL';
      confidence = 0.7;
      reasoning = `Stochastic overbought bearish crossover (K=${stochK.value.toFixed(2)}, D=${stochD.value.toFixed(2)})`;
    } else if (stochK.value <= oversoldThreshold && stochD.value <= oversoldThreshold) {
      action = 'BUY';
      confidence = 0.5;
      reasoning = `Stochastic oversold condition (K=${stochK.value.toFixed(2)}, D=${stochD.value.toFixed(2)})`;
    } else if (stochK.value >= overboughtThreshold && stochD.value >= overboughtThreshold) {
      action = 'SELL';
      confidence = 0.5;
      reasoning = `Stochastic overbought condition (K=${stochK.value.toFixed(2)}, D=${stochD.value.toFixed(2)})`;
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
        stochK: stochK.value,
        stochD: stochD.value,
        oversoldThreshold,
        overboughtThreshold,
        indicator: 'STOCHASTIC'
      }
    };
  }

  private analyzeADXSignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const adx = indicators.filter(i => i.name === 'ADX').slice(-1)[0];
    const plusDI = indicators.filter(i => i.name === 'PLUS_DI').slice(-1)[0];
    const minusDI = indicators.filter(i => i.name === 'MINUS_DI').slice(-1)[0];

    if (!adx) return null;

    const strongTrendThreshold = this.config.parameters.adxStrong || 25;
    const veryStrongTrendThreshold = this.config.parameters.adxVeryStrong || 40;

    // ADX alone indicates trend strength, not direction
    if (adx.value < strongTrendThreshold) {
      return null; // Weak trend, no signal
    }

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // Use +DI and -DI for direction if available
    if (plusDI && minusDI) {
      if (plusDI.value > minusDI.value && adx.value > strongTrendThreshold) {
        action = 'BUY';
        confidence = adx.value > veryStrongTrendThreshold ? 0.8 : 0.6;
        reasoning = `Strong uptrend confirmed by ADX (${adx.value.toFixed(2)}) with +DI > -DI`;
      } else if (minusDI.value > plusDI.value && adx.value > strongTrendThreshold) {
        action = 'SELL';
        confidence = adx.value > veryStrongTrendThreshold ? 0.8 : 0.6;
        reasoning = `Strong downtrend confirmed by ADX (${adx.value.toFixed(2)}) with -DI > +DI`;
      }
    } else {
      // Without directional indicators, use price action
      const marketData = this.dataBuffer.get(symbol);
      if (marketData && marketData.length >= 2) {
        const current = marketData[marketData.length - 1];
        const previous = marketData[marketData.length - 2];
        const priceChange = (current.close - previous.close) / previous.close;

        if (priceChange > 0 && adx.value > strongTrendThreshold) {
          action = 'BUY';
          confidence = adx.value > veryStrongTrendThreshold ? 0.7 : 0.5;
          reasoning = `Strong trend confirmed by ADX (${adx.value.toFixed(2)}) with positive price momentum`;
        } else if (priceChange < 0 && adx.value > strongTrendThreshold) {
          action = 'SELL';
          confidence = adx.value > veryStrongTrendThreshold ? 0.7 : 0.5;
          reasoning = `Strong trend confirmed by ADX (${adx.value.toFixed(2)}) with negative price momentum`;
        }
      }
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
        adx: adx.value,
        plusDI: plusDI?.value,
        minusDI: minusDI?.value,
        strongTrendThreshold,
        indicator: 'ADX'
      }
    };
  }

  private analyzeWilliamsSignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const williams = indicators.filter(i => i.name === 'WILLR').slice(-1)[0];
    if (!williams) return null;

    const oversoldThreshold = this.config.parameters.williamsOversold || -80;
    const overboughtThreshold = this.config.parameters.williamsOverbought || -20;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (williams.value <= oversoldThreshold) {
      action = 'BUY';
      confidence = Math.min(0.75, Math.abs(williams.value) / 100 + 0.4);
      reasoning = `Williams %R oversold at ${williams.value.toFixed(2)}`;
    } else if (williams.value >= overboughtThreshold) {
      action = 'SELL';
      confidence = Math.min(0.75, (100 + williams.value) / 100 + 0.4);
      reasoning = `Williams %R overbought at ${williams.value.toFixed(2)}`;
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
        williams: williams.value,
        oversoldThreshold,
        overboughtThreshold,
        indicator: 'WILLIAMS_R'
      }
    };
  }

  private analyzeCCISignal(symbol: string, indicators: TechnicalIndicator[]): Signal | null {
    const cci = indicators.filter(i => i.name === 'CCI').slice(-1)[0];
    if (!cci) return null;

    const oversoldThreshold = this.config.parameters.cciOversold || -100;
    const overboughtThreshold = this.config.parameters.cciOverbought || 100;
    const extremeOversoldThreshold = this.config.parameters.cciExtremeOversold || -200;
    const extremeOverboughtThreshold = this.config.parameters.cciExtremeOverbought || 200;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (cci.value <= extremeOversoldThreshold) {
      action = 'BUY';
      confidence = 0.8;
      reasoning = `CCI extremely oversold at ${cci.value.toFixed(2)}`;
    } else if (cci.value <= oversoldThreshold) {
      action = 'BUY';
      confidence = 0.6;
      reasoning = `CCI oversold at ${cci.value.toFixed(2)}`;
    } else if (cci.value >= extremeOverboughtThreshold) {
      action = 'SELL';
      confidence = 0.8;
      reasoning = `CCI extremely overbought at ${cci.value.toFixed(2)}`;
    } else if (cci.value >= overboughtThreshold) {
      action = 'SELL';
      confidence = 0.6;
      reasoning = `CCI overbought at ${cci.value.toFixed(2)}`;
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
        cci: cci.value,
        oversoldThreshold,
        overboughtThreshold,
        indicator: 'CCI'
      }
    };
  }

  private applyRiskAdjustment(signal: Signal, marketData: MarketData[]): Signal {
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

    // Calculate price momentum
    const priceChange = (currentPrice - recent[0].close) / recent[0].close;
    
    // Calculate volume profile
    const avgVolume = recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
    const recentVolume = recent.slice(-5).reduce((sum, d) => sum + d.volume, 0) / 5;
    const volumeRatio = recentVolume / avgVolume;

    // Risk-adjusted confidence scoring
    let riskAdjustment = 1.0;

    // High volatility reduces confidence
    if (atrPercent > 0.05) { // > 5% daily volatility
      riskAdjustment *= 0.8;
    } else if (atrPercent > 0.03) { // > 3% daily volatility
      riskAdjustment *= 0.9;
    }

    // Strong momentum in opposite direction reduces confidence
    if (signal.action === 'BUY' && priceChange < -0.1) {
      riskAdjustment *= 0.7;
    } else if (signal.action === 'SELL' && priceChange > 0.1) {
      riskAdjustment *= 0.7;
    }

    // Low volume reduces confidence
    if (volumeRatio < 0.5) {
      riskAdjustment *= 0.8;
    }

    // Position sizing suggestion based on volatility
    let positionSize = 'NORMAL';
    if (atrPercent > 0.05) {
      positionSize = 'SMALL';
    } else if (atrPercent < 0.02) {
      positionSize = 'LARGE';
    }

    const adjustedConfidence = Math.max(0.1, signal.confidence * riskAdjustment);
    const adjustedStrength = Math.max(0.1, signal.strength * riskAdjustment);

    return {
      ...signal,
      confidence: adjustedConfidence,
      strength: adjustedStrength,
      reasoning: `${signal.reasoning} (Risk-adjusted: volatility=${(atrPercent * 100).toFixed(1)}%, momentum=${(priceChange * 100).toFixed(1)}%)`,
      metadata: {
        ...signal.metadata,
        riskAdjustment: {
          originalConfidence: signal.confidence,
          volatility: atrPercent,
          momentum: priceChange,
          volumeRatio,
          positionSize,
          adjustmentFactor: riskAdjustment
        }
      }
    };
  }

  private calculateOptimalPositionSize(signal: Signal, marketData: MarketData[], accountBalance: number = 100000): number {
    if (marketData.length < 20) return 0.02; // 2% default

    const recent = marketData.slice(-20);
    const currentPrice = recent[recent.length - 1].close;
    
    // Calculate ATR for risk assessment
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
    
    // Risk per trade (1% of account)
    const riskPerTrade = accountBalance * 0.01;
    
    // Stop loss distance (2 * ATR)
    const stopLossDistance = atr * 2;
    
    // Position size calculation
    const dollarAmount = riskPerTrade / stopLossDistance;
    const shares = Math.floor(dollarAmount / currentPrice);
    const positionValue = shares * currentPrice;
    const positionSizePercent = positionValue / accountBalance;
    
    // Apply confidence-based adjustment
    const confidenceAdjustedSize = positionSizePercent * signal.confidence;
    
    // Cap position size
    return Math.min(0.1, Math.max(0.005, confidenceAdjustedSize)); // Between 0.5% and 10%
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
      'stochastic-analysis',
      'adx-analysis',
      'williams-r-analysis',
      'cci-analysis',
      'risk-adjusted-signals',
      'position-sizing',
      'volatility-analysis',
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
        description: 'Perform comprehensive trend following analysis with advanced indicators',
        parameters: {
          symbol: 'string',
          marketData: 'MarketData[]',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'getTechnicalSignals',
        description: 'Get traditional and advanced technical analysis signals',
        parameters: {
          symbol: 'string',
          marketData: 'MarketData[]',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'analyzeStochasticSignal',
        description: 'Analyze Stochastic oscillator for momentum signals',
        parameters: {
          symbol: 'string',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signal: 'Signal' }
      },
      {
        name: 'analyzeADXSignal',
        description: 'Analyze ADX for trend strength confirmation',
        parameters: {
          symbol: 'string',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signal: 'Signal' }
      },
      {
        name: 'analyzeWilliamsSignal',
        description: 'Analyze Williams %R for overbought/oversold conditions',
        parameters: {
          symbol: 'string',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signal: 'Signal' }
      },
      {
        name: 'analyzeCCISignal',
        description: 'Analyze Commodity Channel Index for cyclical turns',
        parameters: {
          symbol: 'string',
          indicators: 'TechnicalIndicator[]'
        },
        returns: { signal: 'Signal' }
      },
      {
        name: 'applyRiskAdjustment',
        description: 'Apply risk-based adjustments to signal confidence',
        parameters: {
          signal: 'Signal',
          marketData: 'MarketData[]'
        },
        returns: { signal: 'Signal' }
      },
      {
        name: 'calculateOptimalPositionSize',
        description: 'Calculate optimal position size based on risk and volatility',
        parameters: {
          signal: 'Signal',
          marketData: 'MarketData[]',
          accountBalance: 'number'
        },
        returns: { positionSize: 'number' }
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