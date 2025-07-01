import { BaseAgent } from '../../src/agents/BaseAgent';
import { AgentConfig, Agent2AgentMessage, Signal } from '../../src/types';

// Mock implementation of BaseAgent for testing
class TestAgent extends BaseAgent {
  public mockAnalyzeResult: Signal[] = [];
  
  protected async onStart(): Promise<void> {
    // Mock implementation
  }
  
  protected async onStop(): Promise<void> {
    // Mock implementation
  }
  
  protected onMessage(message: Agent2AgentMessage): void {
    // Mock implementation
  }
  
  public async analyze(data: any): Promise<Signal[]> {
    return this.mockAnalyzeResult;
  }
  
  // Expose protected methods for testing
  public testSendMessage(to: string, type: Agent2AgentMessage['type'], payload: any): void {
    this.sendMessage(to, type, payload);
  }
  
  public testReceiveMessage(message: Agent2AgentMessage): void {
    this.receiveMessage(message);
  }
  
  public testEmitSignal(signal: Signal): void {
    this.emitSignal(signal);
  }
  
  public testLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, metadata?: any): void {
    this.log(level, message, metadata);
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'TECHNICAL',
      enabled: true,
      parameters: { param1: 'value1' },
      weight: 0.5
    };
    agent = new TestAgent(config);
  });

  describe('Constructor and Getters', () => {
    it('should initialize with correct config', () => {
      expect(agent.getId()).toBe('test-agent-1');
      expect(agent.getName()).toBe('Test Agent');
      expect(agent.getType()).toBe('TECHNICAL');
      expect(agent.isEnabled()).toBe(true);
      expect(agent.getWeight()).toBe(0.5);
    });

    it('should return a copy of config', () => {
      const returnedConfig = agent.getConfig();
      expect(returnedConfig).toEqual(config);
      expect(returnedConfig).not.toBe(config); // Should be a copy
    });
  });

  describe('Configuration Updates', () => {
    it('should update config correctly', () => {
      const newConfig = { name: 'Updated Agent', weight: 0.8 };
      agent.updateConfig(newConfig);
      
      expect(agent.getName()).toBe('Updated Agent');
      expect(agent.getWeight()).toBe(0.8);
      expect(agent.getId()).toBe('test-agent-1'); // Unchanged
    });

    it('should emit configUpdated event', () => {
      const mockListener = jest.fn();
      agent.on('configUpdated', mockListener);
      
      const newConfig = { name: 'Updated Agent' };
      agent.updateConfig(newConfig);
      
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Updated Agent'
      }));
    });
  });

  describe('Lifecycle Management', () => {
    it('should start successfully when not running', async () => {
      const mockListener = jest.fn();
      agent.on('started', mockListener);
      
      await agent.start();
      
      expect(mockListener).toHaveBeenCalled();
    });

    it('should throw error when starting already running agent', async () => {
      await agent.start();
      
      await expect(agent.start()).rejects.toThrow('Agent test-agent-1 is already running');
    });

    it('should stop successfully when running', async () => {
      const mockListener = jest.fn();
      agent.on('stopped', mockListener);
      
      await agent.start();
      await agent.stop();
      
      expect(mockListener).toHaveBeenCalled();
    });

    it('should not emit stopped event when already stopped', async () => {
      const mockListener = jest.fn();
      agent.on('stopped', mockListener);
      
      await agent.stop(); // Agent is not running
      
      expect(mockListener).not.toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    it('should send message with correct structure', () => {
      const mockListener = jest.fn();
      agent.on('message', mockListener);
      
      agent.testSendMessage('target-agent', 'SIGNAL', { data: 'test' });
      
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        from: 'test-agent-1',
        to: 'target-agent',
        type: 'SIGNAL',
        payload: { data: 'test' },
        timestamp: expect.any(Date),
        id: expect.any(String)
      }));
    });

    it('should receive message and emit messageReceived event', () => {
      const mockListener = jest.fn();
      agent.on('messageReceived', mockListener);
      
      const message: Agent2AgentMessage = {
        from: 'sender-agent',
        to: 'test-agent-1',
        type: 'DATA',
        payload: { test: 'data' },
        timestamp: new Date(),
        id: 'msg-123'
      };
      
      agent.testReceiveMessage(message);
      
      expect(mockListener).toHaveBeenCalledWith(message);
    });
  });

  describe('Signal Emission', () => {
    it('should emit signal correctly', () => {
      const mockListener = jest.fn();
      agent.on('signal', mockListener);
      
      const signal: Signal = {
        id: 'signal-123',
        agent_id: 'test-agent-1',
        symbol: 'AAPL',
        action: 'BUY',
        confidence: 0.8,
        strength: 0.7,
        timestamp: new Date(),
        reasoning: 'Test signal'
      };
      
      agent.testEmitSignal(signal);
      
      expect(mockListener).toHaveBeenCalledWith(signal);
    });
  });

  describe('Logging', () => {
    it('should emit log event with correct structure', () => {
      const mockListener = jest.fn();
      agent.on('log', mockListener);
      
      agent.testLog('info', 'Test message', { extra: 'data' });
      
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        level: 'info',
        message: 'Test message',
        agent: 'test-agent-1',
        timestamp: expect.any(Date),
        metadata: { extra: 'data' }
      }));
    });

    it('should handle log without metadata', () => {
      const mockListener = jest.fn();
      agent.on('log', mockListener);
      
      agent.testLog('error', 'Error message');
      
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        level: 'error',
        message: 'Error message',
        agent: 'test-agent-1',
        metadata: undefined
      }));
    });
  });

  describe('Health Check', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return healthy status when running and recently updated', async () => {
      await agent.start();
      
      const health = agent.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.isRunning).toBe(true);
      expect(health.lastUpdate).toBeInstanceOf(Date);
    });

    it('should return unhealthy status when not running', () => {
      const health = agent.getHealth();
      
      expect(health.status).toBe('unhealthy');
      expect(health.isRunning).toBe(false);
    });

    it('should return unhealthy status when stale (>5 minutes)', async () => {
      await agent.start();
      
      // Fast forward time by 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);
      
      const health = agent.getHealth();
      
      expect(health.status).toBe('unhealthy');
      expect(health.isRunning).toBe(true);
    });
  });

  describe('Abstract Methods', () => {
    it('should call analyze method', async () => {
      const expectedSignals: Signal[] = [{
        id: 'test-signal',
        agent_id: 'test-agent-1',
        symbol: 'AAPL',
        action: 'BUY',
        confidence: 0.9,
        strength: 0.8,
        timestamp: new Date(),
        reasoning: 'Test analysis'
      }];
      
      agent.mockAnalyzeResult = expectedSignals;
      
      const result = await agent.analyze({ test: 'data' });
      
      expect(result).toEqual(expectedSignals);
    });
  });
});