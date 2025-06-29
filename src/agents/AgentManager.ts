import { EventEmitter } from 'events';
import { BaseAgent } from './BaseAgent';
import { Agent2AgentMessage, AgentConfig } from '../types';

export class AgentManager extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private messageHistory: Agent2AgentMessage[] = [];
  private maxHistorySize: number = 1000;

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
  }
}