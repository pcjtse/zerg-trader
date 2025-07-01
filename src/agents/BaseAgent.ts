import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, Agent2AgentMessage, Signal, A2AAgentCard, A2AMessage, A2AResponse, MemoryRetrievalContext } from '../types';
import { A2AService, A2AServiceConfig } from '../services/A2AService';
import { ClaudeClient, ClaudeAnalysisRequest } from '../services/ClaudeClient';
import { MemoryService } from '../services/MemoryService';

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected isRunning: boolean = false;
  protected lastUpdate: Date = new Date();
  protected a2aService?: A2AService;
  protected claudeClient?: ClaudeClient;
  protected memoryService?: MemoryService;
  protected agentCard: A2AAgentCard;
  protected enableMemory: boolean = true;

  constructor(
    config: AgentConfig, 
    enableClaude: boolean = false, 
    enableA2A: boolean = true,
    enableMemory: boolean = true,
    memoryService?: MemoryService
  ) {
    super();
    this.config = config;
    this.enableMemory = enableMemory;
    
    this.agentCard = this.createAgentCard();
    
    // Initialize memory service
    if (enableMemory) {
      this.memoryService = memoryService || new MemoryService();
    }
    
    if (enableClaude) {
      this.claudeClient = new ClaudeClient(undefined, this.memoryService);
    }
    
    if (enableA2A) {
      this.initializeA2AService();
    }
  }

  public getId(): string {
    return this.config.id;
  }

  public getName(): string {
    return this.config.name;
  }

  public getType(): string {
    return this.config.type;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getWeight(): number {
    return this.config.weight;
  }

  public getConfig(): AgentConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error(`Agent ${this.config.id} is already running`);
    }
    
    this.isRunning = true;
    this.emit('started');
    await this.onStart();
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.a2aService) {
      await this.a2aService.stop();
    }
    
    // Clean up memory service if we own it
    if (this.memoryService && this.enableMemory) {
      // Don't destroy shared memory service, just clean up
      this.memoryService.removeAllListeners();
    }
    
    this.emit('stopped');
    await this.onStop();
  }

  protected sendMessage(to: string, type: Agent2AgentMessage['type'], payload: any): void {
    const message: Agent2AgentMessage = {
      from: this.config.id,
      to,
      type,
      payload,
      timestamp: new Date(),
      id: uuidv4()
    };
    
    this.emit('message', message);
  }

  protected async sendA2AMessage(targetEndpoint: string, method: string, params?: any): Promise<A2AResponse> {
    if (!this.a2aService) {
      throw new Error('A2A service not initialized');
    }
    return await this.a2aService.sendMessage(targetEndpoint, method, params);
  }

  protected async analyzeWithClaude(request: ClaudeAnalysisRequest): Promise<Signal[]> {
    if (!this.claudeClient) {
      throw new Error('Claude client not initialized');
    }
    
    // Enable memory for Claude analysis if available
    const enhancedRequest = {
      ...request,
      agentId: this.config.id,
      useMemory: this.enableMemory && this.memoryService !== undefined,
      memoryContext: this.buildMemoryContext(request)
    };
    
    const response = await this.claudeClient.analyzeMarketData(enhancedRequest);
    
    // Store successful analysis results in memory
    if (this.enableMemory && this.memoryService && response.signals.length > 0) {
      await this.storeSuccessfulAnalysis(request, response.signals);
    }
    
    return response.signals;
  }

  protected buildMemoryContext(request: ClaudeAnalysisRequest): MemoryRetrievalContext {
    return {
      symbol: request.symbol,
      analysisType: request.type,
      maxMemories: 8,
      relevanceThreshold: 0.4
    };
  }

  protected async storeSuccessfulAnalysis(request: ClaudeAnalysisRequest, signals: Signal[]): Promise<void> {
    if (!this.memoryService) return;

    try {
      // Store analysis success pattern
      await this.memoryService.storeMemory({
        agentId: this.config.id,
        type: 'trading_pattern' as any,
        content: {
          analysisType: request.type,
          symbol: request.symbol,
          signalCount: signals.length,
          avgConfidence: signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length,
          actions: signals.map(s => s.action),
          context: request.context
        },
        importance: 0.7,
        tags: ['pattern', 'success', request.type, request.symbol || 'market']
      });
    } catch (error) {
      this.log('warn', `Failed to store analysis pattern: ${error}`);
    }
  }

  protected async getMemoryContext(symbol?: string, analysisType?: string): Promise<string> {
    if (!this.enableMemory || !this.memoryService) {
      return '';
    }

    try {
      const context: MemoryRetrievalContext = {
        symbol,
        analysisType,
        maxMemories: 5,
        relevanceThreshold: 0.5
      };

      const memories = await this.memoryService.getRelevantContext(this.config.id, context);
      
      if (memories.length === 0) {
        return '';
      }

      const contextParts = memories.map(memory => {
        switch (memory.type) {
          case 'market_context':
            return `Market ${memory.content.symbol}: ${memory.content.marketCondition} trend (${memory.content.trend})`;
          case 'performance_feedback':
            return `Past performance: ${memory.content.actual.accuracy}% accuracy`;
          case 'analysis_history':
            return `Previous ${memory.content.analysisType}: ${memory.content.accuracy || 'pending'} accuracy`;
          default:
            return `Context: ${JSON.stringify(memory.content).substring(0, 50)}...`;
        }
      });

      return `Recent context: ${contextParts.join('; ')}`;
    } catch (error) {
      this.log('warn', `Failed to retrieve memory context: ${error}`);
      return '';
    }
  }

  protected async recordSignalOutcome(signalId: string, outcome: {
    priceMovement: number;
    timeToTarget: number;
    accuracy: number;
  }): Promise<void> {
    if (!this.enableMemory || !this.memoryService || !this.claudeClient) {
      return;
    }

    try {
      const feedback = this.generateOutcomeFeedback(outcome);
      await this.claudeClient.updateMemoryWithFeedback(
        this.config.id,
        signalId,
        outcome,
        feedback
      );

      this.log('info', `Recorded signal outcome: ${outcome.accuracy}% accuracy`);
    } catch (error) {
      this.log('warn', `Failed to record signal outcome: ${error}`);
    }
  }

  private generateOutcomeFeedback(outcome: any): string {
    if (outcome.accuracy > 0.8) {
      return 'Excellent prediction accuracy - maintain current strategy';
    } else if (outcome.accuracy > 0.6) {
      return 'Good prediction accuracy - minor adjustments may improve performance';
    } else if (outcome.accuracy > 0.4) {
      return 'Moderate accuracy - review analysis criteria and market conditions';
    } else {
      return 'Low accuracy - significant strategy adjustment needed';
    }
  }

  public async getMemoryStats(): Promise<any> {
    if (!this.memoryService) {
      return { message: 'Memory not enabled for this agent' };
    }

    const stats = await this.memoryService.getMemoryStats();
    return {
      ...stats,
      agentMemories: stats.memoriesByAgent[this.config.id] || 0
    };
  }

  public async clearMemory(): Promise<void> {
    if (this.memoryService) {
      await this.memoryService.clearMemories(this.config.id);
      this.log('info', 'Agent memory cleared');
    }
  }

  protected receiveMessage(message: Agent2AgentMessage): void {
    this.emit('messageReceived', message);
    this.onMessage(message);
  }

  protected emitSignal(signal: Signal): void {
    this.emit('signal', signal);
  }

  protected log(level: 'info' | 'warn' | 'error' | 'debug', message: string, metadata?: any): void {
    this.emit('log', {
      level,
      message,
      agent: this.config.id,
      timestamp: new Date(),
      metadata
    });
  }

  private createAgentCard(): A2AAgentCard {
    return {
      name: this.config.name,
      description: `${this.config.type} analysis agent for financial markets`,
      version: '1.0.0',
      capabilities: this.getCapabilities(),
      endpoint: `http://localhost:${3000 + parseInt(this.config.id.slice(-2)) % 100}`,
      methods: this.getMethodInfo(),
      metadata: {
        type: this.config.type,
        weight: this.config.weight,
        parameters: this.config.parameters,
      },
    };
  }

  private initializeA2AService(): void {
    const a2aConfig: A2AServiceConfig = {
      agentCard: this.agentCard,
      serverPort: 3000 + parseInt(this.config.id.slice(-2)) % 100,
      enableServer: true,
      enableClient: true,
    };

    this.a2aService = new A2AService(a2aConfig);
    
    this.a2aService.on('messageReceived', (message) => {
      this.handleA2AMessage(message);
    });
    
    this.a2aService.on('analysisRequest', (request) => {
      this.handleAnalysisRequest(request);
    });
    
    this.a2aService.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private async handleA2AMessage(message: any): Promise<void> {
    this.emit('a2aMessage', message);
    await this.onA2AMessage(message);
  }

  private async handleAnalysisRequest(request: any): Promise<void> {
    try {
      const signals = await this.analyze(request.data);
      
      if (this.a2aService) {
        this.a2aService.updateTask(request.requestId, {
          status: 'completed',
          result: signals,
        });
      }
      
      this.emit('analysisCompleted', { requestId: request.requestId, signals });
    } catch (error) {
      if (this.a2aService) {
        this.a2aService.updateTask(request.requestId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      
      this.emit('analysisError', { requestId: request.requestId, error });
    }
  }

  public async discoverAgent(endpoint: string): Promise<A2AAgentCard> {
    if (!this.a2aService) {
      throw new Error('A2A service not initialized');
    }
    return await this.a2aService.discoverAgent(endpoint);
  }

  public async broadcastSignal(signal: Signal, targetAgents?: string[]): Promise<void> {
    if (!this.a2aService) {
      throw new Error('A2A service not initialized');
    }
    await this.a2aService.broadcastSignal(signal, targetAgents);
  }

  public getAgentCard(): A2AAgentCard {
    return this.agentCard;
  }

  public getConnectedAgents(): A2AAgentCard[] {
    return this.a2aService?.getConnectedAgents() || [];
  }

  // Abstract methods to be implemented by specific agents
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract onMessage(message: Agent2AgentMessage): void;
  protected abstract onA2AMessage(message: any): Promise<void>;
  protected abstract getCapabilities(): string[];
  protected abstract getMethodInfo(): Array<{ name: string; description: string; parameters: Record<string, any>; returns?: Record<string, any> }>;
  
  // Main analysis method - implemented by specific agent types
  public abstract analyze(data: any): Promise<Signal[]>;
  
  // Health check method
  public getHealth(): { status: 'healthy' | 'unhealthy'; lastUpdate: Date; isRunning: boolean } {
    const timeSinceUpdate = Date.now() - this.lastUpdate.getTime();
    const isStale = timeSinceUpdate > 5 * 60 * 1000; // 5 minutes
    
    return {
      status: this.isRunning && !isStale ? 'healthy' : 'unhealthy',
      lastUpdate: this.lastUpdate,
      isRunning: this.isRunning
    };
  }
}