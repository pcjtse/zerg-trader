import { EventEmitter } from 'events';
import { A2AMessage, A2AResponse, A2AAgentCard, A2ATask, Signal } from '../types';

// Dynamic import types for Google A2A SDK
type A2AClient = any;
type A2AExpressApp = any;

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
  private server?: A2AExpressApp;
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
    try {
      // For now, we'll skip the complex server setup since it requires 
      // specific agent executors and task stores that are beyond the scope
      // of a simple trading agent. The Google A2A SDK is primarily designed
      // for more complex agent scenarios.
      console.log('Google A2A server initialization skipped - using client-only mode');
      this.emit('serverStarted', { 
        port: this.config.serverPort || 3001, 
        host: this.config.serverHost || 'localhost' 
      });
    } catch (error) {
      console.warn('Google A2A SDK server not available, running without A2A server support:', error);
    }
  }

  private async initializeClient(): Promise<void> {
    try {
      // Dynamic import for Google A2A SDK
      const module = await import('@a2a-js/sdk');
      const A2AClientClass = module.A2AClient;
      
      if (A2AClientClass) {
        // Initialize A2A client with endpoint
        const endpoint = this.config.registryEndpoint || 'http://localhost:3000';
        this.client = new A2AClientClass(endpoint);
        
        this.emit('clientInitialized');
      } else {
        throw new Error('A2AClient class not found in Google A2A SDK');
      }
    } catch (error) {
      console.warn('Google A2A SDK client not available, running without A2A client support:', error);
      this.client = undefined;
      this.emit('clientInitialized');
    }
  }

  private async handleIncomingMessage(message: A2AMessage, clientId?: string): Promise<void> {
    try {
      const { method, params, id } = message;
      
      switch (method) {
        case 'sendMessage':
          await this.handleSendMessage(params, id, clientId);
          break;
        case 'getCapabilities':
          await this.handleGetCapabilities(id, clientId);
          break;
        case 'discoverAgents':
          await this.handleDiscoverAgents(id, clientId);
          break;
        case 'analyzeMarketData':
          await this.handleAnalyzeMarketData(params, id, clientId);
          break;
        case 'receiveSignal':
          await this.handleReceiveSignal(params, id, clientId);
          break;
        case 'ping':
          await this.handlePing(id, clientId);
          break;
        default:
          await this.sendResponse({
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method '${method}' not found`,
            },
            id,
          }, clientId);
      }
    } catch (error) {
      await this.sendResponse({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : 'Unknown error',
        },
        id: message.id,
      }, clientId);
    }
  }

  private async handleSendMessage(params: any, id?: string | number, clientId?: string): Promise<void> {
    const { to, message, type } = params;
    
    this.emit('messageReceived', {
      from: 'external',
      to: this.config.agentCard.name,
      type: type || 'DATA',
      payload: message,
      timestamp: new Date(),
      id: id?.toString() || Date.now().toString(),
    });

    await this.sendResponse({
      jsonrpc: '2.0',
      result: { success: true, messageId: id },
      id,
    }, clientId);
  }

  private async handleGetCapabilities(id?: string | number, clientId?: string): Promise<void> {
    await this.sendResponse({
      jsonrpc: '2.0',
      result: this.config.agentCard,
      id,
    }, clientId);
  }

  private async handleDiscoverAgents(id?: string | number, clientId?: string): Promise<void> {
    const agents = Array.from(this.connectedAgents.values());
    await this.sendResponse({
      jsonrpc: '2.0',
      result: { agents },
      id,
    }, clientId);
  }

  private async handleAnalyzeMarketData(params: any, id?: string | number, clientId?: string): Promise<void> {
    const { data, symbol, analysisType } = params;
    
    this.emit('analysisRequest', {
      data,
      symbol,
      analysisType,
      requestId: id,
    });

    await this.sendResponse({
      jsonrpc: '2.0',
      result: { 
        taskId: id,
        status: 'accepted',
        message: 'Analysis request queued'
      },
      id,
    }, clientId);
  }

  private async handleReceiveSignal(params: any, id?: string | number, clientId?: string): Promise<void> {
    const { signal, from } = params;
    
    this.emit('signalReceived', {
      signal,
      from,
      timestamp: new Date(),
      id: id?.toString() || Date.now().toString(),
    });

    await this.sendResponse({
      jsonrpc: '2.0',
      result: { success: true, received: true },
      id,
    }, clientId);
  }

  private async handlePing(id?: string | number, clientId?: string): Promise<void> {
    await this.sendResponse({
      jsonrpc: '2.0',
      result: { 
        pong: true, 
        timestamp: new Date().toISOString(),
        agent: this.config.agentCard.name
      },
      id,
    }, clientId);
  }

  private async sendResponse(response: A2AResponse, clientId?: string): Promise<void> {
    if (this.server && clientId) {
      await this.server.sendMessage(clientId, response);
    } else if (this.client) {
      await this.client.sendResponse(response);
    }
  }

  private handleAgentConnected(agentCard: A2AAgentCard): void {
    this.connectedAgents.set(agentCard.name, agentCard);
    this.emit('agentConnected', agentCard);
  }

  private handleAgentDisconnected(agentName: string): void {
    this.connectedAgents.delete(agentName);
    this.emit('agentDisconnected', agentName);
  }

  private handleAgentDiscovered(agentCard: A2AAgentCard): void {
    this.connectedAgents.set(agentCard.name, agentCard);
    this.emit('agentDiscovered', agentCard);
  }

  public async sendMessage(
    targetEndpoint: string,
    method: string,
    params?: any
  ): Promise<A2AResponse> {
    if (!this.client) {
      throw new Error('A2A client not initialized - Google A2A SDK required');
    }

    try {
      // Use Google A2A SDK client to send message
      const response = await this.client.sendMessage({
        message: {
          content: params,
          type: 'text'
        },
        configuration: {
          blocking: true
        }
      });
      
      return {
        jsonrpc: '2.0',
        result: response,
        id: Date.now()
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        id: Date.now()
      };
    }
  }

  public async sendMessageStream(
    targetEndpoint: string,
    method: string,
    params?: any
  ): Promise<AsyncIterable<A2AResponse>> {
    if (!this.client) {
      throw new Error('A2A client not initialized - Google A2A SDK required');
    }

    // Google A2A SDK doesn't have built-in streaming, so we simulate it
    const self = this;
    async function* streamGenerator() {
      const response = await self.sendMessage(targetEndpoint, method, params);
      yield response;
    }

    return streamGenerator();
  }

  public async discoverAgent(endpoint: string): Promise<A2AAgentCard> {
    if (!this.client) {
      throw new Error('A2A client not initialized - Google A2A SDK required');
    }

    try {
      // Use Google A2A SDK to discover agent capabilities
      const response = await this.sendMessage(endpoint, 'getCapabilities');
      
      if (response.error) {
        throw new Error(`Discovery failed: ${response.error.message}`);
      }

      const agentCard = response.result as A2AAgentCard;
      this.connectedAgents.set(agentCard.name, agentCard);
      this.emit('agentDiscovered', agentCard);
      
      return agentCard;
    } catch (error) {
      // Create a basic agent card if discovery fails
      const basicAgentCard: A2AAgentCard = {
        name: `Agent-${endpoint}`,
        description: 'Discovered agent',
        version: '1.0.0',
        capabilities: [],
        endpoint: endpoint,
        methods: []
      };
      
      this.connectedAgents.set(basicAgentCard.name, basicAgentCard);
      this.emit('agentDiscovered', basicAgentCard);
      
      return basicAgentCard;
    }
  }

  public async broadcastSignal(signal: Signal, targetAgents?: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('A2A client not initialized - Google A2A SDK required');
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

  public async broadcastToClients(message: A2AMessage): Promise<void> {
    // Google A2A SDK server doesn't have a broadcast method
    // This would need to be implemented based on connected clients
    console.warn('broadcastToClients not implemented with Google A2A SDK');
  }

  public async registerWithRegistry(registryEndpoint: string): Promise<void> {
    try {
      // Use Google A2A SDK to register with registry
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

  public getConnectedClients(): string[] {
    // Google A2A SDK server doesn't expose connected clients directly
    return [];
  }

  public getAgentCard(): A2AAgentCard {
    return this.config.agentCard;
  }

  public async stop(): Promise<void> {
    // Stop server
    if (this.server) {
      try {
        await this.server.close();
      } catch (error) {
        console.warn('Error stopping A2A server:', error);
      }
    }
    
    // Client cleanup (Google A2A SDK client doesn't need explicit disconnect)
    this.client = undefined;
    
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
    this.emit('taskCreated', task);
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

  public getTasks(): A2ATask[] {
    return Array.from(this.tasks.values());
  }

  public addMessageHandler(method: string, handler: (params: any, id?: string | number) => Promise<A2AResponse>): void {
    // Google A2A SDK handles message routing, so we emit events for custom handlers
    this.on(`method:${method}`, handler);
  }

  public removeMessageHandler(method: string): void {
    this.removeAllListeners(`method:${method}`);
  }

  public async healthCheck(): Promise<{ status: string; agents: number; clients: number; tasks: number }> {
    return {
      status: 'healthy',
      agents: this.connectedAgents.size,
      clients: this.getConnectedClients().length,
      tasks: this.tasks.size,
    };
  }
}