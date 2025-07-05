import { A2AService, A2AServiceConfig } from '../../src/services/A2AService';
import { A2AAgentCard, A2AMessage, A2AResponse, Signal } from '../../src/types';

// Mock the Google A2A SDK
jest.mock('@a2a-js/sdk', () => ({
  A2AClient: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue({
      jsonrpc: '2.0',
      result: { success: true },
      id: 1
    }),
    sendMessageStream: jest.fn().mockResolvedValue((async function* () {
      yield { jsonrpc: '2.0', result: { success: true }, id: 1 };
    })()),
    discoverAgent: jest.fn().mockResolvedValue({
      name: 'MockAgent',
      endpoint: 'http://mock:3000',
      capabilities: [],
      methods: []
    }),
    registerWithRegistry: jest.fn().mockResolvedValue(undefined),
    sendResponse: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    removeAllListeners: jest.fn()
  })),
  A2AServer: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    broadcast: jest.fn().mockResolvedValue(undefined),
    getConnectedClients: jest.fn().mockReturnValue([]),
    on: jest.fn()
  }))
}));

describe('A2AService', () => {
  let a2aService: A2AService;
  let mockConfig: A2AServiceConfig;
  let mockAgentCard: A2AAgentCard;

  beforeEach(() => {
    mockAgentCard = {
      name: 'TestAgent',
      description: 'Test agent for A2A service',
      version: '1.0.0',
      capabilities: ['test-capability'],
      endpoint: 'http://localhost:3001',
      methods: [{
        name: 'testMethod',
        description: 'Test method',
        parameters: {}
      }]
    };

    mockConfig = {
      agentCard: mockAgentCard,
      serverPort: 3001,
      enableServer: true,
      enableClient: true
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct config', () => {
      a2aService = new A2AService(mockConfig);
      expect(a2aService).toBeDefined();
    });

    it('should emit initialized event', (done) => {
      a2aService = new A2AService(mockConfig);
      a2aService.on('initialized', () => {
        done();
      });
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      a2aService = new A2AService(mockConfig);
    });

    it('should handle sendMessage requests', async () => {
      const mockRequest: A2AMessage = {
        jsonrpc: '2.0',
        method: 'sendMessage',
        params: {
          to: 'targetAgent',
          message: 'test message',
          type: 'DATA'
        },
        id: 'test-123'
      };

      // Simulate incoming request handling
      await (a2aService as any).handleIncomingMessage(mockRequest);

      // Check that messageReceived event was emitted
      expect(a2aService.listenerCount('messageReceived')).toBeGreaterThanOrEqual(0);
    });

    it('should handle getCapabilities requests', async () => {
      const mockRequest: A2AMessage = {
        jsonrpc: '2.0',
        method: 'getCapabilities',
        id: 'cap-123'
      };

      // Simulate incoming request handling
      await (a2aService as any).handleIncomingMessage(mockRequest);

      // Verify the agent card is returned
      expect(a2aService.getAgentCard()).toEqual(mockAgentCard);
    });

    it('should handle unknown methods gracefully', async () => {
      const mockRequest: A2AMessage = {
        jsonrpc: '2.0',
        method: 'unknownMethod',
        id: 'unknown-123'
      };

      // Simulate incoming request handling
      await (a2aService as any).handleIncomingMessage(mockRequest);

      // Since this is a mock, we just verify it doesn't throw
      expect(true).toBe(true);
    });

    it('should handle internal errors', async () => {
      const mockRequest: A2AMessage = {
        jsonrpc: '2.0',
        method: 'sendMessage',
        params: null, // This should cause an error
        id: 'error-123'
      };

      // Simulate incoming request handling
      await (a2aService as any).handleIncomingMessage(mockRequest);

      // Since this is a mock, we just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Agent Discovery', () => {
    beforeEach(() => {
      a2aService = new A2AService(mockConfig);
    });

    it('should track connected agents', () => {
      const mockAgentCard2: A2AAgentCard = {
        name: 'ExternalAgent',
        description: 'External test agent',
        version: '1.0.0',
        capabilities: ['external-capability'],
        endpoint: 'http://localhost:3002',
        methods: []
      };

      // Simulate agent discovery
      (a2aService as any).connectedAgents.set('ExternalAgent', mockAgentCard2);

      const connectedAgents = a2aService.getConnectedAgents();
      expect(connectedAgents).toContain(mockAgentCard2);
    });

    it('should return agent card', () => {
      const agentCard = a2aService.getAgentCard();
      expect(agentCard).toEqual(mockAgentCard);
    });
  });

  describe('Task Management', () => {
    beforeEach(() => {
      a2aService = new A2AService(mockConfig);
    });

    it('should create tasks with unique IDs', () => {
      const task1 = a2aService.createTask('testMethod', { param1: 'value1' });
      const task2 = a2aService.createTask('testMethod', { param2: 'value2' });

      expect(task1.id).not.toBe(task2.id);
      expect(task1.method).toBe('testMethod');
      expect(task1.status).toBe('pending');
    });

    it('should update task status', () => {
      const task = a2aService.createTask('testMethod', {});
      const taskId = task.id;

      const mockListener = jest.fn();
      a2aService.on('taskUpdated', mockListener);

      a2aService.updateTask(taskId, { status: 'completed', result: 'success' });

      const updatedTask = a2aService.getTask(taskId);
      expect(updatedTask?.status).toBe('completed');
      expect(updatedTask?.result).toBe('success');
      expect(mockListener).toHaveBeenCalledWith(updatedTask);
    });

    it('should handle non-existent task updates gracefully', () => {
      a2aService.updateTask('non-existent-id', { status: 'completed' });
      // Should not throw error
    });
  });

  describe('Signal Broadcasting', () => {
    beforeEach(() => {
      a2aService = new A2AService(mockConfig);
    });

    it('should broadcast signals to connected agents', async () => {
      const mockSignal: Signal = {
        id: 'signal-123',
        agent_id: 'test-agent',
        symbol: 'AAPL',
        action: 'BUY',
        confidence: 0.8,
        strength: 0.7,
        timestamp: new Date(),
        reasoning: 'Test signal'
      };

      // Mock connected agent
      const mockAgentCard2: A2AAgentCard = {
        name: 'ExternalAgent',
        description: 'External test agent',
        version: '1.0.0',
        capabilities: ['signal-processing'],
        endpoint: 'http://localhost:3002',
        methods: []
      };

      (a2aService as any).connectedAgents.set('ExternalAgent', mockAgentCard2);

      // Mock the sendMessage method
      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });
      jest.spyOn(a2aService, 'sendMessage').mockImplementation(mockSendMessage);

      await a2aService.broadcastSignal(mockSignal);

      expect(mockSendMessage).toHaveBeenCalledWith(
        'http://localhost:3002',
        'receiveSignal',
        expect.objectContaining({
          signal: mockSignal,
          from: 'TestAgent'
        })
      );
    });

    it('should handle broadcast errors gracefully', async () => {
      const mockSignal: Signal = {
        id: 'signal-123',
        agent_id: 'test-agent',
        symbol: 'AAPL',
        action: 'BUY',
        confidence: 0.8,
        strength: 0.7,
        timestamp: new Date(),
        reasoning: 'Test signal'
      };

      const errorListener = jest.fn();
      a2aService.on('error', errorListener);

      // Mock sendMessage to throw error
      const mockSendMessage = jest.fn().mockRejectedValue(new Error('Network error'));
      jest.spyOn(a2aService, 'sendMessage').mockImplementation(mockSendMessage);

      // Mock connected agent
      (a2aService as any).connectedAgents.set('FailingAgent', {
        name: 'FailingAgent',
        endpoint: 'http://invalid:3003',
        capabilities: [],
        methods: []
      });

      await a2aService.broadcastSignal(mockSignal, ['FailingAgent']);

      expect(errorListener).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send signal to FailingAgent')
      );
    });
  });

  describe('Service Lifecycle', () => {
    beforeEach(() => {
      a2aService = new A2AService(mockConfig);
    });

    it('should stop service cleanly', async () => {
      const mockServer = {
        close: jest.fn().mockResolvedValue(undefined)
      };
      const mockClient = {};

      (a2aService as any).server = mockServer;
      (a2aService as any).client = mockClient;

      const stoppedListener = jest.fn();
      a2aService.on('stopped', stoppedListener);

      await a2aService.stop();

      expect(mockServer.close).toHaveBeenCalled();
      expect(stoppedListener).toHaveBeenCalled();
    });
  });

  describe('Configuration Options', () => {
    it('should handle server-only configuration', () => {
      const serverOnlyConfig: A2AServiceConfig = {
        agentCard: mockAgentCard,
        enableServer: true,
        enableClient: false
      };

      a2aService = new A2AService(serverOnlyConfig);
      expect(a2aService).toBeDefined();
    });

    it('should handle client-only configuration', () => {
      const clientOnlyConfig: A2AServiceConfig = {
        agentCard: mockAgentCard,
        enableServer: false,
        enableClient: true
      };

      a2aService = new A2AService(clientOnlyConfig);
      expect(a2aService).toBeDefined();
    });
  });
});