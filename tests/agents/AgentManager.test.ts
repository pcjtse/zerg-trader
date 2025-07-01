import { AgentManager } from '../../src/agents/AgentManager';
import { BaseAgent } from '../../src/agents/BaseAgent';
import { AgentConfig, Agent2AgentMessage, Signal, A2AAgentCard } from '../../src/types';

// Mock A2A Service
jest.mock('../../src/services/A2AService');
jest.mock('../../src/services/ClaudeClient');

// Mock Agent implementation for testing
class MockAgent extends BaseAgent {
  public started = false;
  public stopped = false;
  public receivedMessages: Agent2AgentMessage[] = [];
  public a2aMessages: any[] = [];

  protected async onStart(): Promise<void> {
    this.started = true;
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
  }

  protected onMessage(message: Agent2AgentMessage): void {
    this.receivedMessages.push(message);
  }

  protected async onA2AMessage(message: any): Promise<void> {
    this.a2aMessages.push(message);
  }

  protected getCapabilities(): string[] {
    return ['mock-capability'];
  }

  protected getMethodInfo() {
    return [{
      name: 'analyze',
      description: 'Mock analysis method',
      parameters: { data: 'any' },
      returns: { signals: 'Signal[]' }
    }];
  }

  public async analyze(data: any): Promise<Signal[]> {
    return [];
  }

  // Expose protected methods for testing
  public triggerMessage(to: string, type: Agent2AgentMessage['type'], payload: any): void {
    this.sendMessage(to, type, payload);
  }

  public triggerSignal(signal: Signal): void {
    this.emitSignal(signal);
  }

  public triggerLog(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    this.log(level, message);
  }
}

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let agent1: MockAgent;
  let agent2: MockAgent;
  let config1: AgentConfig;
  let config2: AgentConfig;

  beforeEach(() => {
    agentManager = new AgentManager(); // Will use mocked A2AService
    
    config1 = {
      id: 'agent-1',
      name: 'Test Agent 1',
      type: 'TECHNICAL',
      enabled: true,
      parameters: {},
      weight: 1.0
    };
    
    config2 = {
      id: 'agent-2',
      name: 'Test Agent 2',
      type: 'FUNDAMENTAL',
      enabled: false,
      parameters: {},
      weight: 0.8
    };
    
    agent1 = new MockAgent(config1, false, false); // Disable Claude and A2A for basic tests
    agent2 = new MockAgent(config2, false, false);
  });

  describe('Agent Registration', () => {
    it('should register agent successfully', () => {
      const mockListener = jest.fn();
      agentManager.on('agentRegistered', mockListener);
      
      agentManager.registerAgent(agent1);
      
      expect(mockListener).toHaveBeenCalledWith(agent1);
      expect(agentManager.getAgent('agent-1')).toBe(agent1);
    });

    it('should throw error when registering duplicate agent ID', () => {
      agentManager.registerAgent(agent1);
      
      expect(() => agentManager.registerAgent(agent1))
        .toThrow('Agent with ID agent-1 is already registered');
    });

    it('should set up event listeners on registration', () => {
      agentManager.registerAgent(agent1);
      
      const signalListener = jest.fn();
      const logListener = jest.fn();
      agentManager.on('signal', signalListener);
      agentManager.on('log', logListener);
      
      const signal: Signal = {
        id: 'signal-1',
        agent_id: 'agent-1',
        symbol: 'AAPL',
        action: 'BUY',
        confidence: 0.8,
        strength: 0.7,
        timestamp: new Date(),
        reasoning: 'Test signal'
      };
      
      agent1.triggerSignal(signal);
      agent1.triggerLog('info', 'Test log');
      
      expect(signalListener).toHaveBeenCalledWith(signal);
      expect(logListener).toHaveBeenCalledWith(expect.objectContaining({
        level: 'info',
        message: 'Test log'
      }));
    });
  });

  describe('Agent Unregistration', () => {
    beforeEach(() => {
      agentManager.registerAgent(agent1);
    });

    it('should unregister agent successfully', () => {
      const mockListener = jest.fn();
      agentManager.on('agentUnregistered', mockListener);
      
      agentManager.unregisterAgent('agent-1');
      
      expect(mockListener).toHaveBeenCalledWith('agent-1');
      expect(agentManager.getAgent('agent-1')).toBeUndefined();
    });

    it('should throw error when unregistering non-existent agent', () => {
      expect(() => agentManager.unregisterAgent('non-existent'))
        .toThrow('Agent with ID non-existent not found');
    });
  });

  describe('Agent Retrieval', () => {
    beforeEach(() => {
      agentManager.registerAgent(agent1);
      agentManager.registerAgent(agent2);
    });

    it('should get all agents', () => {
      const agents = agentManager.getAllAgents();
      
      expect(agents).toHaveLength(2);
      expect(agents).toContain(agent1);
      expect(agents).toContain(agent2);
    });

    it('should get agents by type', () => {
      const technicalAgents = agentManager.getAgentsByType('TECHNICAL');
      const fundamentalAgents = agentManager.getAgentsByType('FUNDAMENTAL');
      
      expect(technicalAgents).toEqual([agent1]);
      expect(fundamentalAgents).toEqual([agent2]);
    });

    it('should get enabled agents only', () => {
      const enabledAgents = agentManager.getEnabledAgents();
      
      expect(enabledAgents).toEqual([agent1]);
      expect(enabledAgents).not.toContain(agent2);
    });
  });

  describe('Agent Lifecycle Management', () => {
    beforeEach(() => {
      agentManager.registerAgent(agent1);
      agentManager.registerAgent(agent2);
    });

    it('should start all enabled agents', async () => {
      await agentManager.startAll();
      
      expect(agent1.started).toBe(true);
      expect(agent2.started).toBe(false); // disabled
    });

    it('should stop all agents', async () => {
      await agentManager.startAgent('agent-1'); // Start only enabled agent
      await agentManager.stopAll();
      
      expect(agent1.stopped).toBe(true);
      // agent2 was never started since it's disabled, so it won't be stopped
    });

    it('should start specific agent', async () => {
      await agentManager.startAgent('agent-1');
      
      expect(agent1.started).toBe(true);
      expect(agent2.started).toBe(false);
    });

    it('should stop specific agent', async () => {
      await agentManager.startAgent('agent-1');
      await agentManager.stopAgent('agent-1');
      
      expect(agent1.stopped).toBe(true);
    });

    it('should throw error when starting non-existent agent', async () => {
      await expect(agentManager.startAgent('non-existent'))
        .rejects.toThrow('Agent with ID non-existent not found');
    });

    it('should handle errors during startAll gracefully', async () => {
      const errorListener = jest.fn();
      agentManager.on('error', errorListener);
      
      // Mock agent that throws error on start
      const failingAgent = new MockAgent({
        id: 'failing-agent',
        name: 'Failing Agent',
        type: 'TECHNICAL',
        enabled: true,
        parameters: {},
        weight: 1.0
      });
      
      // Override start to throw error
      failingAgent.start = jest.fn().mockRejectedValue(new Error('Start failed'));
      agentManager.registerAgent(failingAgent);
      
      await agentManager.startAll();
      
      expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Failed to start agent failing-agent',
        agent: 'failing-agent'
      }));
    });
  });

  describe('Message Routing', () => {
    beforeEach(() => {
      agentManager.registerAgent(agent1);
      agentManager.registerAgent(agent2);
    });

    it('should route message to specific agent', () => {
      const routedListener = jest.fn();
      agentManager.on('messageRouted', routedListener);
      
      agent1.triggerMessage('agent-2', 'DATA', { test: 'data' });
      
      expect(agent2.receivedMessages).toHaveLength(1);
      expect(agent2.receivedMessages[0]).toMatchObject({
        from: 'agent-1',
        to: 'agent-2',
        type: 'DATA',
        payload: { test: 'data' }
      });
      
      expect(routedListener).toHaveBeenCalled();
    });

    it('should broadcast message to all agents', () => {
      agent1.triggerMessage('*', 'SIGNAL', { broadcast: true });
      
      expect(agent2.receivedMessages).toHaveLength(1);
      expect(agent1.receivedMessages).toHaveLength(0); // Sender should not receive
    });

    it('should handle message to non-existent agent', () => {
      const errorListener = jest.fn();
      agentManager.on('error', errorListener);
      
      agent1.triggerMessage('non-existent', 'DATA', {});
      
      expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Target agent non-existent not found for message from agent-1'
      }));
    });

    it('should maintain message history', () => {
      agent1.triggerMessage('agent-2', 'DATA', { message: 1 });
      agent2.triggerMessage('agent-1', 'RESPONSE', { message: 2 });
      
      const history = agentManager.getMessageHistory();
      
      expect(history).toHaveLength(2);
      expect(history[0].payload).toEqual({ message: 1 });
      expect(history[1].payload).toEqual({ message: 2 });
    });

    it('should filter message history by agent', () => {
      agent1.triggerMessage('agent-2', 'DATA', { from1: true });
      agent2.triggerMessage('agent-1', 'RESPONSE', { from2: true });
      
      const agent1History = agentManager.getMessageHistory('agent-1');
      
      expect(agent1History).toHaveLength(2); // Both messages involve agent-1
    });

    it('should limit message history', () => {
      agent1.triggerMessage('agent-2', 'DATA', { message: 1 });
      agent1.triggerMessage('agent-2', 'DATA', { message: 2 });
      agent1.triggerMessage('agent-2', 'DATA', { message: 3 });
      
      const limitedHistory = agentManager.getMessageHistory(undefined, 2);
      
      expect(limitedHistory).toHaveLength(2);
      expect(limitedHistory[0].payload).toEqual({ message: 2 });
      expect(limitedHistory[1].payload).toEqual({ message: 3 });
    });
  });

  describe('System Health', () => {
    beforeEach(() => {
      agentManager.registerAgent(agent1);
      agentManager.registerAgent(agent2);
    });

    it('should return system health status', async () => {
      await agentManager.startAgent('agent-1');
      
      const health = agentManager.getSystemHealth();
      
      expect(health.totalAgents).toBe(2);
      expect(health.runningAgents).toBe(1);
      expect(health.healthyAgents).toBe(1);
      expect(health.agentHealth).toHaveLength(2);
      
      const agent1Health = health.agentHealth.find(h => h.id === 'agent-1');
      expect(agent1Health?.status).toBe('healthy');
      expect(agent1Health?.isRunning).toBe(true);
    });
  });

  describe('Agent Configuration Updates', () => {
    beforeEach(() => {
      agentManager.registerAgent(agent1);
    });

    it('should update agent configuration', () => {
      agentManager.updateAgentConfig('agent-1', { name: 'Updated Agent' });
      
      expect(agent1.getName()).toBe('Updated Agent');
    });

    it('should throw error when updating non-existent agent', () => {
      expect(() => agentManager.updateAgentConfig('non-existent', { name: 'Test' }))
        .toThrow('Agent with ID non-existent not found');
    });
  });

  describe('A2A Integration', () => {
    beforeEach(() => {
      agentManager.registerAgent(agent1);
    });

    it('should have A2A service initialized', () => {
      const a2aService = agentManager.getA2AService();
      expect(a2aService).toBeDefined();
    });

    it('should get external agents list', () => {
      const externalAgents = agentManager.getExternalAgents();
      // Should return an empty array when no external agents are connected
      // The method should exist and return an array (or empty array if A2A service not available)
      expect(externalAgents).toBeDefined();
      expect(Array.isArray(externalAgents)).toBe(true);
    });

    it('should emit agent card updated event when config changes', () => {
      const mockListener = jest.fn();
      agentManager.on('agentCardUpdated', mockListener);
      
      agentManager.updateAgentConfig('agent-1', { name: 'Updated Agent' });
      
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-1',
        agentCard: expect.objectContaining({
          name: 'Updated Agent'
        })
      }));
    });
  });
});