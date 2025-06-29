import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, Agent2AgentMessage, Signal } from '../types';

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected isRunning: boolean = false;
  protected lastUpdate: Date = new Date();

  constructor(config: AgentConfig) {
    super();
    this.config = config;
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

  // Abstract methods to be implemented by specific agents
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract onMessage(message: Agent2AgentMessage): void;
  
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