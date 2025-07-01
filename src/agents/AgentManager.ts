import { EventEmitter } from 'events';
import { BaseAgent } from './BaseAgent';
import { Agent2AgentMessage, AgentConfig, A2AAgentCard, A2AMessage, A2AResponse } from '../types';
import { A2AService, A2AServiceConfig } from '../services/A2AService';

export class AgentManager extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private messageHistory: Agent2AgentMessage[] = [];
  private maxHistorySize: number = 1000;
  private a2aService!: A2AService;
  private registryEndpoint?: string;

  constructor(registryEndpoint?: string) {
    super();
    this.registryEndpoint = registryEndpoint;
    this.initializeA2AService();
  }

  private initializeA2AService(): void {
    const managerAgentCard: A2AAgentCard = {
      name: 'ZergTrader-Manager',
      description: 'Central agent manager for the ZergTrader multi-agent trading system',
      version: '1.0.0',
      capabilities: [
        'agent-registration',
        'agent-discovery',
        'message-routing',
        'signal-aggregation',
        'system-monitoring'
      ],
      endpoint: 'http://localhost:3000',
      methods: [
        {
          name: 'registerAgent',
          description: 'Register a new agent with the manager',
          parameters: { agentCard: 'A2AAgentCard' }
        },
        {
          name: 'discoverAgents',
          description: 'Discover all available agents',
          parameters: {},
          returns: { agents: 'A2AAgentCard[]' }
        },
        {
          name: 'routeMessage',
          description: 'Route messages between agents',
          parameters: { message: 'A2AMessage', target: 'string' }
        },
        {
          name: 'getSystemHealth',
          description: 'Get overall system health status',
          parameters: {},
          returns: { health: 'SystemHealth' }
        }
      ],
      metadata: {
        role: 'manager',
        maxAgents: 100,
        supportedProtocols: ['A2A', 'WebSocket', 'HTTP']
      }
    };

    const a2aConfig: A2AServiceConfig = {
      agentCard: managerAgentCard,
      serverPort: 3000,
      enableServer: true,
      enableClient: true,
    };

    this.a2aService = new A2AService(a2aConfig);
    
    this.a2aService.on('messageReceived', this.handleA2AMessage.bind(this));
    this.a2aService.on('agentDiscovered', this.handleAgentDiscovered.bind(this));
    this.a2aService.on('error', (error) => this.emit('error', error));
  }

  private async handleA2AMessage(message: any): Promise<void> {
    this.emit('a2aMessage', message);
    
    // Convert A2A message to internal format for legacy compatibility
    const internalMessage: Agent2AgentMessage = {
      from: message.from || 'external',
      to: message.to || 'manager',
      type: message.type || 'DATA',
      payload: message.payload,
      timestamp: message.timestamp || new Date(),
      id: message.id || Date.now().toString(),
    };
    
    this.routeMessage(internalMessage);
  }

  private handleAgentDiscovered(agentCard: A2AAgentCard): void {
    this.emit('agentDiscovered', agentCard);
  }

  public async discoverExternalAgent(endpoint: string): Promise<A2AAgentCard> {
    return await this.a2aService.discoverAgent(endpoint);
  }

  public async broadcastToExternalAgents(message: A2AMessage): Promise<void> {
    const connectedAgents = this.a2aService.getConnectedAgents();
    
    const promises = connectedAgents.map(async (agent) => {
      try {
        await this.a2aService.sendMessage(agent.endpoint, message.method, message.params);
      } catch (error) {
        this.emit('error', `Failed to send message to ${agent.name}: ${error}`);
      }
    });

    await Promise.allSettled(promises);
  }

  public registerAgent(agent: BaseAgent): void {
    const agentId = agent.getId();
    
    if (this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} is already registered`);
    }

    this.agents.set(agentId, agent);
    
    // Set up message handling
    agent.on('message', (message: Agent2AgentMessage) => {
      this.routeMessage(message);
    });
    
    agent.on('signal', (signal) => {
      this.emit('signal', signal);
    });
    
    agent.on('log', (logEntry) => {
      this.emit('log', logEntry);
    });

    this.emit('agentRegistered', agent);
    
    // Register agent's A2A card with external registry if available
    if (this.registryEndpoint) {
      this.registerAgentWithRegistry(agent.getAgentCard());
    }
  }

  private async registerAgentWithRegistry(agentCard: A2AAgentCard): Promise<void> {
    if (!this.registryEndpoint) return;
    
    try {
      await this.a2aService.registerWithRegistry(this.registryEndpoint);
      this.emit('agentRegisteredWithRegistry', agentCard);
    } catch (error) {
      this.emit('error', `Failed to register agent with registry: ${error}`);
    }
  }

  public unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    agent.removeAllListeners();
    this.agents.delete(agentId);
    this.emit('agentUnregistered', agentId);
  }

  public getAgent(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  public getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  public getAgentsByType(type: string): BaseAgent[] {
    return this.getAllAgents().filter(agent => agent.getType() === type);
  }

  public getEnabledAgents(): BaseAgent[] {
    return this.getAllAgents().filter(agent => agent.isEnabled());
  }

  public async startAll(): Promise<void> {
    // Start A2A service first
    try {
      // A2A service is already initialized and started in constructor
      this.emit('a2aServiceStarted');
    } catch (error) {
      this.emit('error', `Failed to start A2A service: ${error}`);
    }
    
    const startPromises = this.getEnabledAgents().map(agent => 
      agent.start().catch(error => {
        this.emit('error', {
          message: `Failed to start agent ${agent.getId()}`,
          error,
          agent: agent.getId()
        });
      })
    );
    
    await Promise.allSettled(startPromises);
    
    // Discover and connect to external agents if registry is available
    if (this.registryEndpoint) {
      this.discoverExternalAgents();
    }
  }

  private async discoverExternalAgents(): Promise<void> {
    // This would typically query a registry service for available agents
    // For now, we'll emit an event that external systems can listen to
    this.emit('discoveringExternalAgents');
  }

  public async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.agents.values()).map(agent => 
      agent.stop().catch(error => {
        this.emit('error', {
          message: `Failed to stop agent ${agent.getId()}`,
          error,
          agent: agent.getId()
        });
      })
    );
    
    await Promise.allSettled(stopPromises);
    
    // Stop A2A service
    if (this.a2aService) {
      await this.a2aService.stop();
    }
  }

  public async startAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }
    
    await agent.start();
  }

  public async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }
    
    await agent.stop();
  }

  private routeMessage(message: Agent2AgentMessage): void {
    // Add to history
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }

    // Route to specific agent or broadcast
    if (message.to === '*') {
      // Broadcast to all agents except sender
      this.agents.forEach((agent, agentId) => {
        if (agentId !== message.from) {
          (agent as any).receiveMessage(message);
        }
      });
    } else {
      // Send to specific agent
      const targetAgent = this.agents.get(message.to);
      if (targetAgent) {
        (targetAgent as any).receiveMessage(message);
      } else {
        this.emit('error', {
          message: `Target agent ${message.to} not found for message from ${message.from}`,
          messageId: message.id
        });
      }
    }

    this.emit('messageRouted', message);
  }

  public getMessageHistory(agentId?: string, limit?: number): Agent2AgentMessage[] {
    let messages = this.messageHistory;
    
    if (agentId) {
      messages = messages.filter(msg => msg.from === agentId || msg.to === agentId);
    }
    
    if (limit) {
      messages = messages.slice(-limit);
    }
    
    return messages;
  }

  public getSystemHealth(): {
    totalAgents: number;
    runningAgents: number;
    healthyAgents: number;
    agentHealth: Array<{
      id: string;
      name: string;
      status: 'healthy' | 'unhealthy';
      isRunning: boolean;
      lastUpdate: Date;
    }>;
  } {
    const agents = this.getAllAgents();
    const agentHealth = agents.map(agent => ({
      id: agent.getId(),
      name: agent.getName(),
      ...agent.getHealth()
    }));

    return {
      totalAgents: agents.length,
      runningAgents: agentHealth.filter(h => h.isRunning).length,
      healthyAgents: agentHealth.filter(h => h.status === 'healthy').length,
      agentHealth
    };
  }

  public updateAgentConfig(agentId: string, config: Partial<AgentConfig>): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }
    
    agent.updateConfig(config);
    
    // Update A2A agent card if config affects it
    if (config.name || config.type || config.parameters) {
      const updatedCard = agent.getAgentCard();
      this.emit('agentCardUpdated', { agentId, agentCard: updatedCard });
    }
  }

  public getA2AService(): A2AService {
    return this.a2aService;
  }

  public getExternalAgents(): A2AAgentCard[] {
    return this.a2aService.getConnectedAgents();
  }

  public async sendA2AMessage(targetEndpoint: string, method: string, params?: any): Promise<A2AResponse> {
    return await this.a2aService.sendMessage(targetEndpoint, method, params);
  }

  public async sendA2AMessageStream(targetEndpoint: string, method: string, params?: any): Promise<AsyncIterable<A2AResponse>> {
    return await this.a2aService.sendMessageStream(targetEndpoint, method, params);
  }
}