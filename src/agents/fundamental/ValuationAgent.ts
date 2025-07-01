import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, FundamentalData, MarketData, Agent2AgentMessage } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class ValuationAgent extends BaseAgent {
  private fundamentalDataBuffer: Map<string, FundamentalData> = new Map();
  private marketDataBuffer: Map<string, MarketData[]> = new Map();

  constructor(config: AgentConfig, enableClaude: boolean = false) {
    super(config, enableClaude, true);
  }

  protected async onStart(): Promise<void> {
    this.log('info', 'Valuation Agent started');
    this.emit('subscribe', { 
      type: 'fundamental-data', 
      symbols: this.config.parameters.symbols || [] 
    });
  }

  protected async onStop(): Promise<void> {
    this.log('info', 'Valuation Agent stopped');
    this.fundamentalDataBuffer.clear();
    this.marketDataBuffer.clear();
  }

  protected onMessage(message: Agent2AgentMessage): void {
    if (message.type === 'DATA') {
      if (message.payload.type === 'fundamental-data') {
        this.updateFundamentalData(message.payload.symbol, message.payload.data);
      } else if (message.payload.type === 'market-data') {
        this.updateMarketData(message.payload.symbol, message.payload.data);
      }
    }
  }

  protected async onA2AMessage(message: any): Promise<void> {
    if (message.type === 'DATA') {
      if (message.payload.type === 'fundamental-data') {
        this.updateFundamentalData(message.payload.symbol, message.payload.data);
      } else if (message.payload.type === 'market-data') {
        this.updateMarketData(message.payload.symbol, message.payload.data);
      }
    }
  }

  public async analyze(data: { symbol: string; fundamentalData: FundamentalData; marketData: MarketData[] }): Promise<Signal[]> {
    const { symbol, fundamentalData, marketData } = data;
    
    if (!fundamentalData || !marketData || marketData.length === 0) {
      return [];
    }

    const signals: Signal[] = [];
    
    this.fundamentalDataBuffer.set(symbol, fundamentalData);
    this.marketDataBuffer.set(symbol, marketData);

    const currentPrice = marketData[marketData.length - 1].close;

    // Various valuation analyses
    const peSignal = this.analyzePERatio(symbol, fundamentalData, currentPrice);
    const earningsSignal = this.analyzeEarningsGrowth(symbol, fundamentalData);
    const debtSignal = this.analyzeDebtLevels(symbol, fundamentalData);
    const profitabilitySignal = this.analyzeProfitability(symbol, fundamentalData);
    const dcfSignal = this.performDCFAnalysis(symbol, fundamentalData, currentPrice);

    if (peSignal) signals.push(peSignal);
    if (earningsSignal) signals.push(earningsSignal);
    if (debtSignal) signals.push(debtSignal);
    if (profitabilitySignal) signals.push(profitabilitySignal);
    if (dcfSignal) signals.push(dcfSignal);

    // Generate composite valuation signal
    const compositeSignal = this.generateCompositeSignal(symbol, signals, currentPrice);
    if (compositeSignal) {
      signals.push(compositeSignal);
      this.emitSignal(compositeSignal);
    }

    this.lastUpdate = new Date();
    return signals;
  }

  protected getCapabilities(): string[] {
    return [
      'fundamental-analysis',
      'valuation-metrics',
      'financial-ratios',
      'pe-analysis',
      'debt-analysis',
      'profitability-analysis'
    ];
  }

  protected getMethodInfo() {
    return [
      {
        name: 'analyze',
        description: 'Perform fundamental valuation analysis',
        parameters: {
          symbol: 'string',
          fundamentalData: 'FundamentalData',
          marketData: 'MarketData[]'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'calculateValuationMetrics',
        description: 'Calculate key valuation metrics',
        parameters: {
          symbol: 'string',
          fundamentalData: 'FundamentalData'
        },
        returns: { metrics: 'ValuationMetrics' }
      }
    ];
  }

  private analyzePERatio(symbol: string, fundamentalData: FundamentalData, currentPrice: number): Signal | null {
    if (!fundamentalData.pe_ratio || !fundamentalData.eps) return null;

    const pe = fundamentalData.pe_ratio;
    
    // Industry average PE ratios (simplified - in production, use sector-specific data)
    const sectorPE = this.getSectorAveragePE(symbol); // Default to 15 for now
    const marketPE = 20; // S&P 500 average
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (pe < sectorPE * 0.7) { // Significantly undervalued
      action = 'BUY';
      confidence = 0.8;
      reasoning = `PE ratio ${pe.toFixed(2)} significantly below sector average ${sectorPE.toFixed(2)}`;
    } else if (pe < sectorPE) { // Undervalued
      action = 'BUY';
      confidence = 0.6;
      reasoning = `PE ratio ${pe.toFixed(2)} below sector average ${sectorPE.toFixed(2)}`;
    } else if (pe > sectorPE * 1.5) { // Significantly overvalued
      action = 'SELL';
      confidence = 0.75;
      reasoning = `PE ratio ${pe.toFixed(2)} significantly above sector average ${sectorPE.toFixed(2)}`;
    } else if (pe > marketPE * 1.3) { // Overvalued vs market
      action = 'SELL';
      confidence = 0.5;
      reasoning = `PE ratio ${pe.toFixed(2)} significantly above market average ${marketPE}`;
    }

    // Adjust confidence based on earnings quality
    if (fundamentalData.eps && fundamentalData.eps > 0) {
      confidence *= 1.1; // Boost confidence for profitable companies
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence: Math.min(confidence, 0.9),
      strength: confidence * 0.8,
      timestamp: new Date(),
      reasoning,
      metadata: {
        pe_ratio: pe,
        sector_pe: sectorPE,
        market_pe: marketPE,
        eps: fundamentalData.eps,
        currentPrice,
        indicator: 'PE_RATIO',
        signal_type: 'FUNDAMENTAL_PE_RATIO',
        current_price: currentPrice
      }
    };
  }

  private analyzeEarningsGrowth(symbol: string, fundamentalData: FundamentalData): Signal | null {
    if (!fundamentalData.eps) return null;

    // Simplified earnings growth analysis
    // In production, you'd compare with historical EPS data
    const eps = fundamentalData.eps;
    const estimatedGrowthRate = this.estimateEarningsGrowth(symbol, fundamentalData);
    
    if (estimatedGrowthRate === null) return null;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (estimatedGrowthRate > 0.15) { // >15% growth
      action = 'BUY';
      confidence = 0.7;
      reasoning = `Strong estimated earnings growth of ${(estimatedGrowthRate * 100).toFixed(1)}%`;
    } else if (estimatedGrowthRate > 0.10) { // >10% growth
      action = 'BUY';
      confidence = 0.5;
      reasoning = `Good estimated earnings growth of ${(estimatedGrowthRate * 100).toFixed(1)}%`;
    } else if (estimatedGrowthRate < -0.10) { // Declining earnings
      action = 'SELL';
      confidence = 0.6;
      reasoning = `Declining estimated earnings growth of ${(estimatedGrowthRate * 100).toFixed(1)}%`;
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
        eps,
        estimated_growth_rate: estimatedGrowthRate,
        indicator: 'EARNINGS_GROWTH',
        signal_type: 'FUNDAMENTAL_EARNINGS_GROWTH'
      }
    };
  }

  private analyzeDebtLevels(symbol: string, fundamentalData: FundamentalData): Signal | null {
    if (!fundamentalData.debt_to_equity) return null;

    const debtToEquity = fundamentalData.debt_to_equity;
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (debtToEquity < 0.3) { // Low debt
      action = 'BUY';
      confidence = 0.4;
      reasoning = `Conservative debt-to-equity ratio of ${debtToEquity.toFixed(2)}`;
    } else if (debtToEquity > 2.0) { // High debt
      action = 'SELL';
      confidence = 0.6;
      reasoning = `High debt-to-equity ratio of ${debtToEquity.toFixed(2)} indicates financial risk`;
    } else if (debtToEquity > 1.0) { // Moderate concern
      action = 'SELL';
      confidence = 0.3;
      reasoning = `Elevated debt-to-equity ratio of ${debtToEquity.toFixed(2)}`;
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength: confidence * 0.7,
      timestamp: new Date(),
      reasoning,
      metadata: {
        debt_to_equity: debtToEquity,
        indicator: 'DEBT_ANALYSIS',
        signal_type: 'FUNDAMENTAL_DEBT_ANALYSIS'
      }
    };
  }

  private analyzeProfitability(symbol: string, fundamentalData: FundamentalData): Signal | null {
    if (!fundamentalData.roe && !fundamentalData.roa) return null;

    const roe = fundamentalData.roe;
    const roa = fundamentalData.roa;
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    // Analyze ROE
    if (roe && roe > 0.15) { // >15% ROE
      action = 'BUY';
      confidence = 0.6;
      reasoning = `Strong ROE of ${(roe * 100).toFixed(1)}%`;
    } else if (roe && roe < 0.05) { // <5% ROE
      action = 'SELL';
      confidence = 0.4;
      reasoning = `Weak ROE of ${(roe * 100).toFixed(1)}%`;
    }

    // Analyze ROA and adjust signal
    if (roa && roa > 0.10) { // >10% ROA
      if (action === 'BUY') {
        confidence += 0.2;
        reasoning += ` and strong ROA of ${(roa * 100).toFixed(1)}%`;
      } else {
        action = 'BUY';
        confidence = 0.4;
        reasoning = `Strong ROA of ${(roa * 100).toFixed(1)}%`;
      }
    } else if (roa && roa < 0.02) { // <2% ROA
      if (action === 'SELL') {
        confidence += 0.2;
        reasoning += ` and weak ROA of ${(roa * 100).toFixed(1)}%`;
      } else {
        action = 'SELL';
        confidence = 0.3;
        reasoning = `Weak ROA of ${(roa * 100).toFixed(1)}%`;
      }
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence: Math.min(confidence, 0.8),
      strength: confidence * 0.8,
      timestamp: new Date(),
      reasoning,
      metadata: {
        roe,
        roa,
        indicator: 'PROFITABILITY',
        signal_type: 'FUNDAMENTAL_PROFITABILITY'
      }
    };
  }

  private performDCFAnalysis(symbol: string, fundamentalData: FundamentalData, currentPrice: number): Signal | null {
    if (!fundamentalData.revenue || !fundamentalData.net_income || !fundamentalData.eps) {
      return null;
    }

    // Simplified DCF calculation
    const currentEPS = fundamentalData.eps;
    const growthRate = this.estimateEarningsGrowth(symbol, fundamentalData) || 0.05; // Default 5%
    const discountRate = 0.10; // 10% WACC assumption
    const terminalGrowthRate = 0.03; // 3% perpetual growth
    
    // Project 5 years of cash flows
    let intrinsicValue = 0;
    for (let year = 1; year <= 5; year++) {
      const projectedEPS = currentEPS * Math.pow(1 + growthRate, year);
      const presentValue = projectedEPS / Math.pow(1 + discountRate, year);
      intrinsicValue += presentValue;
    }
    
    // Terminal value
    const terminalEPS = currentEPS * Math.pow(1 + growthRate, 5) * (1 + terminalGrowthRate);
    const terminalValue = terminalEPS / (discountRate - terminalGrowthRate);
    const presentTerminalValue = terminalValue / Math.pow(1 + discountRate, 5);
    
    intrinsicValue += presentTerminalValue;
    
    const margin = (intrinsicValue - currentPrice) / currentPrice;
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reasoning = '';

    if (margin > 0.25) { // >25% undervalued
      action = 'BUY';
      confidence = 0.8;
      reasoning = `DCF analysis shows ${(margin * 100).toFixed(1)}% upside (intrinsic: $${intrinsicValue.toFixed(2)}, current: $${currentPrice.toFixed(2)})`;
    } else if (margin > 0.15) { // >15% undervalued
      action = 'BUY';
      confidence = 0.6;
      reasoning = `DCF analysis shows ${(margin * 100).toFixed(1)}% upside (intrinsic: $${intrinsicValue.toFixed(2)}, current: $${currentPrice.toFixed(2)})`;
    } else if (margin < -0.20) { // >20% overvalued
      action = 'SELL';
      confidence = 0.7;
      reasoning = `DCF analysis shows ${Math.abs(margin * 100).toFixed(1)}% downside (intrinsic: $${intrinsicValue.toFixed(2)}, current: $${currentPrice.toFixed(2)})`;
    }

    if (action === 'HOLD') return null;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength: confidence * 0.9, // DCF is a strong fundamental signal
      timestamp: new Date(),
      reasoning,
      metadata: {
        intrinsic_value: intrinsicValue,
        current_price: currentPrice,
        margin,
        growth_rate: growthRate,
        discount_rate: discountRate,
        indicator: 'DCF_ANALYSIS',
        signal_type: 'FUNDAMENTAL_DCF_ANALYSIS'
      }
    };
  }

  private generateCompositeSignal(symbol: string, signals: Signal[], currentPrice: number): Signal | null {
    if (signals.length === 0) return null;

    const buySignals = signals.filter(s => s.action === 'BUY');
    const sellSignals = signals.filter(s => s.action === 'SELL');
    
    if (buySignals.length === 0 && sellSignals.length === 0) return null;

    // Weight signals differently based on their reliability
    const weights = {
      'DCF_ANALYSIS': 1.0,
      'PE_RATIO': 0.8,
      'PROFITABILITY': 0.7,
      'EARNINGS_GROWTH': 0.9,
      'DEBT_ANALYSIS': 0.6
    };

    const buyScore = buySignals.reduce((sum, s) => {
      const weight = weights[s.metadata?.indicator as keyof typeof weights] || 0.5;
      return sum + s.confidence * s.strength * weight;
    }, 0);
    
    const sellScore = sellSignals.reduce((sum, s) => {
      const weight = weights[s.metadata?.indicator as keyof typeof weights] || 0.5;
      return sum + s.confidence * s.strength * weight;
    }, 0);
    
    const totalScore = buyScore + sellScore;
    const netScore = buyScore - sellScore;
    
    // Fundamental signals require higher threshold due to longer time horizon
    const threshold = 0.2;
    if (Math.abs(netScore) < threshold) return null;

    const action = netScore > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.9, Math.abs(netScore) / totalScore * 1.5);
    const strength = confidence * 0.85; // Fundamental signals are strong but slower

    const supportingSignals = action === 'BUY' ? buySignals : sellSignals;
    const reasoning = `Composite fundamental valuation signal based on ${supportingSignals.length} indicators: ${supportingSignals.map(s => s.metadata?.indicator).join(', ')}`;

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
        currentPrice,
        indicator: 'COMPOSITE_FUNDAMENTAL',
        signal_type: 'COMPOSITE_FUNDAMENTAL',
        current_price: currentPrice
      }
    };
  }

  private getSectorAveragePE(symbol: string): number {
    // Simplified sector mapping - in production, use proper sector classification
    const sectorPEs: Record<string, number> = {
      'TECH': 25,
      'HEALTHCARE': 20,
      'FINANCE': 12,
      'ENERGY': 15,
      'UTILITIES': 18,
      'DEFAULT': 16
    };
    
    // Simple heuristic based on symbol - in production, use proper sector data
    return sectorPEs.DEFAULT;
  }

  private estimateEarningsGrowth(symbol: string, fundamentalData: FundamentalData): number | null {
    // Simplified growth estimation based on available metrics
    // In production, you'd use historical EPS data and analyst estimates
    
    if (!fundamentalData.roe || !fundamentalData.eps) return null;
    
    const roe = fundamentalData.roe;
    const retentionRatio = 0.7; // Assume 70% earnings retention (simplified)
    
    // Sustainable growth rate = ROE × Retention Ratio
    return roe * retentionRatio;
  }

  private updateFundamentalData(symbol: string, data: FundamentalData): void {
    this.fundamentalDataBuffer.set(symbol, data);
    const marketData = this.marketDataBuffer.get(symbol);
    if (marketData) {
      this.analyze({ symbol, fundamentalData: data, marketData });
    }
  }

  private updateMarketData(symbol: string, data: MarketData[]): void {
    this.marketDataBuffer.set(symbol, data);
    const fundamentalData = this.fundamentalDataBuffer.get(symbol);
    if (fundamentalData) {
      this.analyze({ symbol, fundamentalData, marketData: data });
    }
  }
}