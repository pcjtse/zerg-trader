import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, Agent2AgentMessage } from '../../types';
import { ClaudeAnalysisRequest } from '../../services/ClaudeClient';
import { v4 as uuidv4 } from 'uuid';

interface AgentPerformance {
  agentId: string;
  accuracy: number;
  totalSignals: number;
  successfulSignals: number;
  averageReturn: number;
  sharpeRatio: number;
  lastUpdated: Date;
}

interface WeightedSignal extends Signal {
  weight: number;
  agentPerformance: AgentPerformance;
}

export class DecisionFusionAgent extends BaseAgent {
  private incomingSignals: Map<string, Signal[]> = new Map(); // symbol -> signals
  private agentPerformances: Map<string, AgentPerformance> = new Map();
  private historicalSignals: Signal[] = [];
  private fusionHistory: Array<{
    timestamp: Date;
    symbol: string;
    inputSignals: Signal[];
    outputSignal: Signal;
    method: string;
  }> = [];

  private readonly maxHistorySize = 10000;
  private readonly signalExpiryMs = 5 * 60 * 1000; // 5 minutes
  private readonly minSignalsForFusion = 2;

  constructor(config: AgentConfig, enableClaude: boolean = true) {
    super(config, enableClaude, true);
    this.initializeAgentPerformances();
  }

  protected async onStart(): Promise<void> {
    this.log('info', 'Decision Fusion Agent started');
    
    // Subscribe to signals from all other agents
    this.sendMessage('*', 'REQUEST', {
      type: 'subscribe_signals',
      subscriber: this.config.id
    });
    
    // Start periodic fusion process
    setInterval(() => this.performPeriodicFusion(), 30000); // Every 30 seconds
  }

  protected async onStop(): Promise<void> {
    this.log('info', 'Decision Fusion Agent stopped');
    this.incomingSignals.clear();
    this.historicalSignals = [];
  }

  protected onMessage(message: Agent2AgentMessage): void {
    if (message.type === 'SIGNAL') {
      this.handleIncomingSignal(message.payload as Signal);
    } else if (message.type === 'RESPONSE' && message.payload.type === 'trade_result') {
      this.handleTradeResult(message.payload);
    }
  }

  protected async onA2AMessage(message: any): Promise<void> {
    if (message.payload?.signal) {
      this.handleIncomingSignal(message.payload.signal);
    } else if (message.payload?.signals) {
      // Handle batch signal processing
      for (const signal of message.payload.signals) {
        this.handleIncomingSignal(signal);
      }
    } else if (message.payload?.fusionRequest) {
      // Handle external fusion requests
      const { symbol, signals } = message.payload.fusionRequest;
      const fusedSignal = await this.fuseSignalsForSymbol(symbol, signals);
      
      if (fusedSignal && this.a2aService) {
        await this.sendA2AMessage(message.from, 'fusionResult', {
          requestId: message.id,
          fusedSignal,
          inputSignals: signals.length
        });
      }
    }
  }

  public async analyze(data: { signals: Signal[]; symbol?: string }): Promise<Signal[]> {
    const { signals } = data;
    
    if (!signals || signals.length === 0) {
      return [];
    }

    // Group signals by symbol
    const signalsBySymbol = this.groupSignalsBySymbol(signals);
    const fusedSignals: Signal[] = [];

    for (const [symbol, symbolSignals] of signalsBySymbol.entries()) {
      const results = await this.fuseSignalsForSymbolAll(symbol, symbolSignals);
      for (const result of results) {
        fusedSignals.push(result);
        this.emitSignal(result);
        
        // Broadcast fused signal via A2A protocol
        if (this.a2aService) {
          await this.broadcastSignal(result);
        }
      }
    }

    this.lastUpdate = new Date();
    return fusedSignals;
  }

  protected getCapabilities(): string[] {
    return [
      'signal-fusion',
      'decision-making',
      'ml-ensemble',
      'agent-performance-tracking',
      'signal-aggregation',
      'consensus-building'
    ];
  }

  protected getMethodInfo() {
    return [
      {
        name: 'analyze',
        description: 'Fuse multiple signals into consensus decisions',
        parameters: {
          signals: 'Signal[]'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'fuseSignalsForSymbol',
        description: 'Fuse signals for a specific symbol',
        parameters: {
          symbol: 'string',
          signals: 'Signal[]'
        },
        returns: { signal: 'Signal' }
      },
      {
        name: 'updateAgentPerformance',
        description: 'Update performance metrics for an agent',
        parameters: {
          agentId: 'string',
          performance: 'AgentPerformance'
        }
      }
    ];
  }

  private handleIncomingSignal(signal: Signal): void {
    // Store the signal
    this.historicalSignals.push(signal);
    
    // Maintain history size
    if (this.historicalSignals.length > this.maxHistorySize) {
      this.historicalSignals.shift();
    }

    // Add to current signals for fusion
    if (!this.incomingSignals.has(signal.symbol)) {
      this.incomingSignals.set(signal.symbol, []);
    }
    
    const symbolSignals = this.incomingSignals.get(signal.symbol)!;
    symbolSignals.push(signal);
    
    // Clean expired signals
    const now = Date.now();
    const validSignals = symbolSignals.filter(s => 
      now - s.timestamp.getTime() < this.signalExpiryMs
    );
    this.incomingSignals.set(signal.symbol, validSignals);

    // Trigger fusion if we have enough signals
    if (validSignals.length >= this.minSignalsForFusion) {
      this.performFusionForSymbol(signal.symbol);
    }
  }

  private async performFusionForSymbol(symbol: string): Promise<void> {
    const signals = this.incomingSignals.get(symbol);
    if (!signals || signals.length < this.minSignalsForFusion) {
      return;
    }

    const fusedSignal = await this.fuseSignalsForSymbol(symbol, signals);
    if (fusedSignal) {
      this.emitSignal(fusedSignal);
      
      // Clear processed signals
      this.incomingSignals.set(symbol, []);
    }
  }

  private async fuseSignalsForSymbol(symbol: string, signals: Signal[]): Promise<Signal | null> {
    const requiredSignals = this.config.parameters.min_signals_required || this.minSignalsForFusion;
    if (signals.length < requiredSignals) {
      return null;
    }

    // Apply different fusion methods and combine results
    const weightedSignal = await this.performWeightedFusion(symbol, signals);
    const votingSignal = await this.performVotingFusion(symbol, signals);
    const mlSignal = await this.performMLFusion(symbol, signals);


    // Return all successful fusion results, not just meta-fusion
    const allResults: Signal[] = [];
    
    if (weightedSignal) allResults.push(weightedSignal);
    if (votingSignal) allResults.push(votingSignal);
    if (mlSignal) allResults.push(mlSignal);
    
    // Also perform meta-fusion if we have multiple results
    if (allResults.length > 1) {
      const metaSignal = await this.performMetaFusion(symbol, signals, allResults);
      if (metaSignal) {
        allResults.push(metaSignal);
        
        // Record fusion history
        this.fusionHistory.push({
          timestamp: new Date(),
          symbol,
          inputSignals: [...signals],
          outputSignal: metaSignal,
          method: 'META_FUSION'
        });
        
        // Maintain fusion history size
        if (this.fusionHistory.length > 1000) {
          this.fusionHistory.shift();
        }
      }
    }
    
    return allResults.length > 0 ? allResults[0] : null; // Return the first result for now
  }

  private async fuseSignalsForSymbolAll(symbol: string, signals: Signal[]): Promise<Signal[]> {
    const requiredSignals = this.config.parameters.min_signals_required || this.minSignalsForFusion;
    if (signals.length < requiredSignals) {
      return [];
    }

    // Apply different fusion methods and get all results
    const weightedSignal = await this.performWeightedFusion(symbol, signals);
    const votingSignal = await this.performVotingFusion(symbol, signals);
    const mlSignal = await this.performMLFusion(symbol, signals);


    const allResults: Signal[] = [];
    
    if (weightedSignal) allResults.push(weightedSignal);
    if (votingSignal) allResults.push(votingSignal);
    if (mlSignal) allResults.push(mlSignal);
    
    // Also perform meta-fusion if we have multiple results
    if (allResults.length > 1) {
      const metaSignal = await this.performMetaFusion(symbol, signals, allResults);
      if (metaSignal) {
        allResults.push(metaSignal);
        
        // Record fusion history
        this.fusionHistory.push({
          timestamp: new Date(),
          symbol,
          inputSignals: [...signals],
          outputSignal: metaSignal,
          method: 'META_FUSION'
        });
        
        // Maintain fusion history size
        if (this.fusionHistory.length > 1000) {
          this.fusionHistory.shift();
        }
      }
    }
    
    // Filter by confidence threshold if specified
    const confidenceThreshold = this.config.parameters.confidence_threshold;
    if (confidenceThreshold) {
      return allResults.filter(signal => signal.confidence >= confidenceThreshold);
    }
    
    return allResults;
  }

  private async performWeightedFusion(symbol: string, signals: Signal[]): Promise<Signal | null> {
    const weightedSignals: WeightedSignal[] = signals.map(signal => {
      let performance = this.agentPerformances.get(signal.agent_id);
      if (!performance) {
        performance = this.getDefaultPerformance(signal.agent_id);
        this.agentPerformances.set(signal.agent_id, performance);
      }
      const weight = this.calculateAgentWeight(signal.agent_id, performance);
      
      return {
        ...signal,
        weight,
        agentPerformance: performance
      };
    });

    // Calculate weighted scores for each action
    const actionScores = { BUY: 0, SELL: 0, HOLD: 0 };
    const actionWeights = { BUY: 0, SELL: 0, HOLD: 0 };

    for (const ws of weightedSignals) {
      const score = ws.confidence * ws.strength * ws.weight;
      actionScores[ws.action] += score;
      actionWeights[ws.action] += ws.weight;
    }

    // Normalize scores
    const normalizedScores = {
      BUY: actionWeights.BUY > 0 ? actionScores.BUY / actionWeights.BUY : 0,
      SELL: actionWeights.SELL > 0 ? actionScores.SELL / actionWeights.SELL : 0,
      HOLD: actionWeights.HOLD > 0 ? actionScores.HOLD / actionWeights.HOLD : 0
    };

    // Determine winning action
    const winningAction = Object.entries(normalizedScores)
      .reduce((a, b) => normalizedScores[a[0] as keyof typeof normalizedScores] > normalizedScores[b[0] as keyof typeof normalizedScores] ? a : b)[0] as 'BUY' | 'SELL' | 'HOLD';

    const maxScore = normalizedScores[winningAction];
    
    // Require minimum threshold
    const threshold = this.config.parameters.fusionThreshold || 0.2;
    if (maxScore < threshold) {
      return null;
    }
    
    // Skip HOLD actions unless explicitly configured to include them
    if (winningAction === 'HOLD' && !this.config.parameters.includeHoldSignals) {
      return null;
    }

    const confidence = Math.min(0.95, maxScore);
    const strength = confidence * 0.9;

    const contributingAgents = weightedSignals
      .filter(ws => ws.action === winningAction)
      .map(ws => ({ agentId: ws.agent_id, weight: ws.weight, confidence: ws.confidence }));

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action: winningAction,
      confidence,
      strength,
      timestamp: new Date(),
      reasoning: `Weighted fusion of ${signals.length} signals from ${new Set(signals.map(s => s.agent_id)).size} agents. Contributing agents: ${contributingAgents.map(a => a.agentId).join(', ')}`,
      metadata: {
        fusion_method: 'WEIGHTED',
        input_signals: signals.length,
        input_signals_count: signals.length,
        contributing_agents: contributingAgents.map(ca => ca.agentId),
        agent_weights: contributingAgents.reduce((acc, ca) => {
          acc[ca.agentId] = ca.weight;
          return acc;
        }, {} as Record<string, number>),
        action_scores: actionScores,
        normalized_scores: normalizedScores,
        contributing_agents_detail: contributingAgents,
        component_confidences: signals.map(s => s.confidence)
      }
    };
  }

  private async performVotingFusion(symbol: string, signals: Signal[]): Promise<Signal | null> {
    // Simple majority voting with quality weighting
    const votes = { BUY: 0, SELL: 0, HOLD: 0 };
    const qualityWeights = { BUY: 0, SELL: 0, HOLD: 0 };

    for (const signal of signals) {
      const performance = this.agentPerformances.get(signal.agent_id);
      const qualityWeight = performance ? performance.accuracy : 0.5;
      
      votes[signal.action] += 1;
      qualityWeights[signal.action] += qualityWeight;
    }

    // Weight votes by quality
    const weightedVotes = {
      BUY: votes.BUY > 0 ? qualityWeights.BUY / votes.BUY : 0,
      SELL: votes.SELL > 0 ? qualityWeights.SELL / votes.SELL : 0,
      HOLD: votes.HOLD > 0 ? qualityWeights.HOLD / votes.HOLD : 0
    };

    const winningAction = Object.entries(weightedVotes)
      .reduce((a, b) => weightedVotes[a[0] as keyof typeof weightedVotes] > weightedVotes[b[0] as keyof typeof weightedVotes] ? a : b)[0] as 'BUY' | 'SELL' | 'HOLD';

    const winningScore = weightedVotes[winningAction];
    const votesForWinner = votes[winningAction];
    
    // Require majority and minimum quality
    if (votesForWinner < Math.ceil(signals.length / 2) || winningScore < 0.1) {
      return null;
    }
    
    // Skip HOLD actions unless explicitly configured to include them
    if (winningAction === 'HOLD' && !this.config.parameters.includeHoldSignals) {
      return null;
    }

    const confidence = Math.min(0.9, winningScore + (votesForWinner / signals.length) * 0.3);
    const strength = confidence * 0.85;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action: winningAction,
      confidence,
      strength,
      timestamp: new Date(),
      reasoning: `Voting consensus: ${votesForWinner}/${signals.length} agents voted ${winningAction}`,
      metadata: {
        fusion_method: 'VOTING',
        votes,
        vote_counts: votes,
        weighted_votes: weightedVotes,
        winning_votes: votesForWinner,
        total_votes: signals.length,
        input_signals_count: signals.length,
        component_confidences: signals.map(s => s.confidence),
        contributing_agents: Array.from(new Set(signals.map(s => s.agent_id))),
        input_signal_ids: signals.map(s => s.id)
      }
    };
  }

  private async performMLFusion(symbol: string, signals: Signal[]): Promise<Signal | null> {
    // Simplified ML-like fusion using ensemble scoring
    // In production, this would use a trained ML model
    
    const features = this.extractSignalFeatures(signals);
    if (features.length === 0) return null;

    // Ensemble scoring based on signal characteristics
    let buyScore = 0;
    let sellScore = 0;
    
    for (const signal of signals) {
      const performance = this.agentPerformances.get(signal.agent_id);
      const agentReliability = performance ? performance.accuracy : 0.5;
      const recency = Math.exp(-(Date.now() - signal.timestamp.getTime()) / (60 * 1000)); // Decay over 1 minute
      
      const signalStrength = signal.confidence * signal.strength * agentReliability * recency;
      
      if (signal.action === 'BUY') {
        buyScore += signalStrength;
      } else if (signal.action === 'SELL') {
        sellScore += signalStrength;
      }
    }

    const totalScore = buyScore + sellScore;
    if (totalScore === 0) return null;

    const netScore = buyScore - sellScore;
    const winningAction = netScore > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.9, Math.abs(netScore) / totalScore);
    
    // Apply minimum threshold
    const threshold = this.config.parameters.mlThreshold || 0.2;
    if (confidence < threshold) return null;

    const strength = confidence * 0.95;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action: winningAction,
      confidence,
      strength,
      timestamp: new Date(),
      reasoning: `ML-style ensemble fusion with ${confidence.toFixed(2)} confidence`,
      metadata: {
        fusion_method: 'ML_ENSEMBLE',
        ensemble_score: Math.abs(netScore),
        buy_score: buyScore,
        sell_score: sellScore,
        net_score: netScore,
        features: features.length,
        input_signals_count: signals.length,
        component_confidences: signals.map(s => s.confidence),
        contributing_agents: Array.from(new Set(signals.map(s => s.agent_id))),
        input_signal_ids: signals.map(s => s.id)
      }
    };
  }

  private async performMetaFusion(symbol: string, originalSignals: Signal[], fusionResults: Signal[]): Promise<Signal | null> {
    if (fusionResults.length === 0) return null;
    if (fusionResults.length === 1) return fusionResults[0];

    // Meta-level fusion of fusion results
    const buyResults = fusionResults.filter(s => s.action === 'BUY');
    const sellResults = fusionResults.filter(s => s.action === 'SELL');

    if (buyResults.length === 0 && sellResults.length === 0) return null;

    // Weight different fusion methods
    const methodWeights = {
      'WEIGHTED': 0.4,
      'VOTING': 0.3,
      'ML_ENSEMBLE': 0.3
    };

    let buyScore = 0;
    let sellScore = 0;

    for (const result of fusionResults) {
      const method = result.metadata?.fusion_method || 'UNKNOWN';
      const weight = methodWeights[method as keyof typeof methodWeights] || 0.2;
      const score = result.confidence * result.strength * weight;
      
      if (result.action === 'BUY') {
        buyScore += score;
      } else if (result.action === 'SELL') {
        sellScore += score;
      }
    }

    const totalScore = buyScore + sellScore;
    if (totalScore === 0) return null;

    const netScore = buyScore - sellScore;
    const winningAction = netScore > 0 ? 'BUY' : 'SELL';
    
    // Reduce confidence when signals are conflicting
    const conflictRatio = Math.min(buyScore, sellScore) / Math.max(buyScore, sellScore);
    const conflictPenalty = conflictRatio > 0.7 ? 0.8 : 1.0; // Reduce confidence for high conflict
    const confidence = Math.min(0.95, Math.abs(netScore) / totalScore * conflictPenalty);
    
    // Higher threshold for meta-fusion
    const threshold = this.config.parameters.metaThreshold || 0.3;
    if (confidence < threshold) return null;

    const strength = confidence * 0.9;
    const consensus = fusionResults.filter(r => r.action === winningAction).length;

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action: winningAction,
      confidence,
      strength,
      timestamp: new Date(),
      reasoning: consensus === fusionResults.length ? 
        `Meta-fusion unanimous agreement: all ${consensus} fusion methods agree on ${winningAction}. Based on ${originalSignals.length} original signals from ${new Set(originalSignals.map(s => s.agent_id)).size} agents.` :
        `Meta-fusion consensus: ${consensus}/${fusionResults.length} fusion methods agree on ${winningAction}. Based on ${originalSignals.length} original signals from ${new Set(originalSignals.map(s => s.agent_id)).size} agents.`,
      metadata: {
        fusion_method: 'META_FUSION',
        original_signals: originalSignals.length,
        fusion_results: fusionResults.length,
        consensus_count: consensus,
        buy_score: buyScore,
        sell_score: sellScore,
        net_score: netScore,
        contributing_methods: fusionResults.map(r => r.metadata?.fusion_method),
        component_methods: fusionResults.map(r => r.metadata?.fusion_method),
        input_signals_count: originalSignals.length,
        component_confidences: originalSignals.map(s => s.confidence),
        contributing_agents: new Set(originalSignals.map(s => s.agent_id)).size,
        input_signal_ids: originalSignals.map(s => s.id)
      }
    };
  }

  private calculateAgentWeight(agentId: string, performance?: AgentPerformance): number {
    if (!performance) {
      return this.config.parameters.defaultAgentWeight || 0.5;
    }

    // Combine multiple performance metrics
    const accuracyWeight = performance.accuracy;
    const experienceWeight = Math.min(1.0, performance.totalSignals / 100); // More weight for experienced agents
    const sharpeWeight = Math.max(0, Math.min(1.0, (performance.sharpeRatio + 1) / 3)); // Normalize Sharpe ratio
    
    // Time decay for performance relevance
    const daysSinceUpdate = (Date.now() - performance.lastUpdated.getTime()) / (24 * 60 * 60 * 1000);
    const recencyWeight = Math.exp(-daysSinceUpdate / 7); // Decay over 7 days
    
    const combinedWeight = (accuracyWeight * 0.4 + experienceWeight * 0.2 + sharpeWeight * 0.3 + recencyWeight * 0.1);
    
    return Math.max(0.1, Math.min(1.0, combinedWeight));
  }

  private extractSignalFeatures(signals: Signal[]): number[] {
    // Extract features for ML-style processing
    const features: number[] = [];
    
    // Statistical features
    const confidences = signals.map(s => s.confidence);
    const strengths = signals.map(s => s.strength);
    
    features.push(
      this.mean(confidences),
      this.std(confidences),
      this.mean(strengths),
      this.std(strengths),
      signals.length,
      new Set(signals.map(s => s.agent_id)).size, // Unique agents
      signals.filter(s => s.action === 'BUY').length / signals.length, // Buy ratio
      this.mean(signals.map(s => Date.now() - s.timestamp.getTime())) // Average age
    );
    
    return features;
  }

  private mean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  private std(values: number[]): number {
    if (values.length <= 1) return 0;
    const avg = this.mean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private groupSignalsBySymbol(signals: Signal[]): Map<string, Signal[]> {
    const groups = new Map<string, Signal[]>();
    
    for (const signal of signals) {
      if (!groups.has(signal.symbol)) {
        groups.set(signal.symbol, []);
      }
      groups.get(signal.symbol)!.push(signal);
    }
    
    return groups;
  }

  private initializeAgentPerformances(): void {
    // Initialize with default performance metrics
    // In production, load from historical data
    const defaultAgents = [
      'trend-following-agent',
      'mean-reversion-agent',
      'volume-momentum-agent',
      'valuation-agent',
      'financial-strength-agent',
      'growth-potential-agent'
    ];

    for (const agentId of defaultAgents) {
      this.agentPerformances.set(agentId, {
        agentId,
        accuracy: 0.6, // Start with 60% accuracy assumption
        totalSignals: 0,
        successfulSignals: 0,
        averageReturn: 0.0,
        sharpeRatio: 0.0,
        lastUpdated: new Date()
      });
    }
  }

  private getDefaultPerformance(agentId: string): AgentPerformance {
    return {
      agentId,
      accuracy: 0.5,
      totalSignals: 0,
      successfulSignals: 0,
      averageReturn: 0.0,
      sharpeRatio: 0.0,
      lastUpdated: new Date()
    };
  }

  private handleTradeResult(tradeResult: any): void {
    // Update agent performance based on trade results
    const { signalIds, success, returnPct } = tradeResult;
    
    for (const signalId of signalIds || []) {
      const signal = this.historicalSignals.find(s => s.id === signalId);
      if (signal) {
        this.updateAgentPerformance(signal.agent_id, success, returnPct);
      }
    }
  }

  private updateAgentPerformance(agentId: string, success: boolean, returnPct: number): void {
    let performance = this.agentPerformances.get(agentId);
    if (!performance) {
      performance = this.getDefaultPerformance(agentId);
    }

    performance.totalSignals += 1;
    if (success) {
      performance.successfulSignals += 1;
    }
    
    performance.accuracy = performance.successfulSignals / performance.totalSignals;
    performance.averageReturn = (performance.averageReturn * (performance.totalSignals - 1) + returnPct) / performance.totalSignals;
    performance.lastUpdated = new Date();
    
    // Simple Sharpe ratio approximation (assumes risk-free rate of 2%)
    const excessReturn = performance.averageReturn - 0.02;
    performance.sharpeRatio = excessReturn / Math.max(0.01, Math.abs(performance.averageReturn) * 0.5); // Simplified volatility estimate
    
    this.agentPerformances.set(agentId, performance);
  }

  private async performPeriodicFusion(): Promise<void> {
    // Perform fusion for all symbols with pending signals
    for (const [symbol, signals] of this.incomingSignals.entries()) {
      if (signals.length >= this.minSignalsForFusion) {
        await this.performFusionForSymbol(symbol);
      }
    }
  }

  public getAgentPerformances(): Map<string, AgentPerformance> {
    return new Map(this.agentPerformances);
  }

  public getFusionHistory(limit?: number): Array<{
    timestamp: Date;
    symbol: string;
    inputSignals: Signal[];
    outputSignal: Signal;
    method: string;
  }> {
    return limit ? this.fusionHistory.slice(-limit) : [...this.fusionHistory];
  }

}