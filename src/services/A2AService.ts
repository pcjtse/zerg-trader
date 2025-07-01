import { A2AClient } from '@a2a-js/sdk';
import { EventEmitter } from 'events';
import { A2AMessage, A2AResponse, A2AAgentCard, A2ATask, Signal } from '../types';

export interface A2AServiceConfig {
  serverPort?: number;
  serverHost?: string;
  agentCard: A2AAgentCard;
  enableServer?: boolean;
  enableClient?: boolean;
  registryEndpoint?: string;
  enableDiscovery?: boolean;
}

export class A2AService extends EventEmitter {
  private client?: A2AClient;
  private server?: any;
  private config: A2AServiceConfig;
  private tasks: Map<string, A2ATask> = new Map();
  private connectedAgents: Map<string, A2AAgentCard> = new Map();

  constructor(config: A2AServiceConfig) {
    super();
    this.config = {
      serverPort: parseInt(process.env.A2A_SERVER_PORT || '3001'),
      registryEndpoint: process.env.A2A_REGISTRY_ENDPOINT,
      enableDiscovery: process.env.A2A_ENABLE_DISCOVERY === 'true',
      ...config
    };
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      if (this.config.enableServer !== false) {
        await this.initializeServer();
      }
      
      if (this.config.enableClient !== false) {
        await this.initializeClient();
      }

      // Auto-register with registry if enabled and endpoint provided
      if (this.config.enableDiscovery && this.config.registryEndpoint) {
        await this.registerWithRegistry(this.config.registryEndpoint);
      }
      
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
    }
  }

  private async initializeServer(): Promise<void> {
    const port = this.config.serverPort || 3001;
    const host = this.config.serverHost || 'localhost';

    // Mock server implementation for now since A2AServer is not available
    this.server = {
      start: async () => {},
      stop: async () => {},
      on: () => {}
    };
    
    this.emit('serverStarted', { port, host });
  }

  private async initializeClient(): Promise<void> {
    this.client = new A2AClient('http://localhost:3000');
    this.emit('clientInitialized');
  }

  private async handleIncomingRequest(request: A2AMessage): Promise<A2AResponse> {
    try {
      const { method, params, id } = request;
      
      switch (method) {
        case 'sendMessage':
          return await this.handleSendMessage(params, id);
        case 'getCapabilities':
          return await this.handleGetCapabilities(id);
        case 'discoverAgents':
          return await this.handleDiscoverAgents(id);
        case 'analyzeMarketData':
          return await this.handleAnalyzeMarketData(params, id);
        default:
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method '${method}' not found`,
            },
            id,
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : 'Unknown error',
        },
        id: request.id,
      };
    }
  }

  private async handleSendMessage(params: any, id?: string | number): Promise<A2AResponse> {
    const { to, message, type } = params;
    
    this.emit('messageReceived', {
      from: 'external',
      to: this.config.agentCard.name,
      type: type || 'DATA',
      payload: message,
      timestamp: new Date(),
      id: id?.toString() || Date.now().toString(),
    });

    return {
      jsonrpc: '2.0',
      result: { success: true, messageId: id },
      id,
    };
  }

  private async handleGetCapabilities(id?: string | number): Promise<A2AResponse> {
    return {
      jsonrpc: '2.0',
      result: this.config.agentCard,
      id,
    };
  }

  private async handleDiscoverAgents(id?: string | number): Promise<A2AResponse> {
    const agents = Array.from(this.connectedAgents.values());
    return {
      jsonrpc: '2.0',
      result: { agents },
      id,
    };
  }

  private async handleAnalyzeMarketData(params: any, id?: string | number): Promise<A2AResponse> {
    const { data, symbol, analysisType } = params;
    
    this.emit('analysisRequest', {
      data,
      symbol,
      analysisType,
      requestId: id,
    });

    return {
      jsonrpc: '2.0',
      result: { 
        taskId: id,
        status: 'accepted',
        message: 'Analysis request queued'
      },
      id,
    };
  }

  private handleResponse(response: A2AResponse): void {
    this.emit('response', response);
  }

  public async sendMessage(
    targetEndpoint: string,
    method: string,
    params?: any
  ): Promise<A2AResponse> {
    if (!this.client) {
      throw new Error('A2A client not initialized');
    }

    const message: A2AMessage = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    };

    // Mock implementation for now
    return {
      jsonrpc: '2.0' as const,
      result: { success: true },
      id: message.id
    };
  }

  public async sendMessageStream(
    targetEndpoint: string,
    method: string,
    params?: any
  ): Promise<AsyncIterable<A2AResponse>> {
    if (!this.client) {
      throw new Error('A2A client not initialized');
    }

    const message: A2AMessage = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    };

    // Mock implementation for now
    async function* mockStream() {
      yield {
        jsonrpc: '2.0' as const,
        result: { success: true },
        id: message.id
      };
    }
    return mockStream();
  }

  public async discoverAgent(endpoint: string): Promise<A2AAgentCard> {
    const response = await this.sendMessage(endpoint, 'getCapabilities');
    
    if (response.error) {
      throw new Error(`Discovery failed: ${response.error.message}`);
    }

    const agentCard = response.result as A2AAgentCard;
    this.connectedAgents.set(agentCard.name, agentCard);
    this.emit('agentDiscovered', agentCard);
    
    return agentCard;
  }

  public async broadcastSignal(signal: Signal, targetAgents?: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('A2A client not initialized');
    }

    const targets = targetAgents || Array.from(this.connectedAgents.keys());
    
    const promises = targets.map(async (agentName) => {
      const agentCard = this.connectedAgents.get(agentName);
      if (!agentCard) return;

      try {
        await this.sendMessage(agentCard.endpoint, 'receiveSignal', {
          signal,
          from: this.config.agentCard.name,
        });
      } catch (error) {
        this.emit('error', `Failed to send signal to ${agentName}: ${error}`);
      }
    });

    await Promise.allSettled(promises);
  }

  public async registerWithRegistry(registryEndpoint: string): Promise<void> {
    try {
      await this.sendMessage(registryEndpoint, 'registerAgent', {
        agentCard: this.config.agentCard,
      });
      this.emit('registeredWithRegistry', registryEndpoint);
    } catch (error) {
      this.emit('error', `Failed to register with registry: ${error}`);
    }
  }

  public getConnectedAgents(): A2AAgentCard[] {
    return Array.from(this.connectedAgents.values());
  }

  public getAgentCard(): A2AAgentCard {
    return this.config.agentCard;
  }

  public async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
    }
    
    if (this.client) {
      // Mock cleanup
    }
    
    this.connectedAgents.clear();
    this.tasks.clear();
    this.emit('stopped');
  }

  public createTask(method: string, params: any): A2ATask {
    const task: A2ATask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      method,
      params,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.tasks.set(task.id, task);
    return task;
  }

  public updateTask(taskId: string, updates: Partial<A2ATask>): void {
    const task = this.tasks.get(taskId);
    if (task) {
      Object.assign(task, updates, { updated_at: new Date() });
      this.emit('taskUpdated', task);
    }
  }

  public getTask(taskId: string): A2ATask | undefined {
    return this.tasks.get(taskId);
  }
}