// Mock A2AService for Jest tests
const { EventEmitter } = require('events');

class MockA2AService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.connectedAgents = new Map();
    this.tasks = new Map();
    
    // Simulate initialization
    setTimeout(() => {
      this.emit('initialized');
    }, 0);
  }

  async sendMessage(endpoint, method, params) {
    return {
      jsonrpc: '2.0',
      result: { success: true },
      id: Date.now()
    };
  }

  async sendMessageStream(endpoint, method, params) {
    async function* mockStream() {
      yield {
        jsonrpc: '2.0',
        result: { success: true },
        id: Date.now()
      };
    }
    return mockStream();
  }

  async broadcastSignal(signal, targetAgents) {
    this.emit('signalBroadcast', { signal, targetAgents });
  }

  async discoverAgent(endpoint) {
    const mockCard = {
      name: 'Mock External Agent',
      description: 'Mock agent for testing',
      version: '1.0.0',
      capabilities: ['mock-capability'],
      endpoint,
      methods: []
    };
    this.connectedAgents.set(endpoint, mockCard);
    return mockCard;
  }

  getConnectedAgents() {
    return Array.from(this.connectedAgents.values());
  }

  getAgentCard() {
    return this.config.agentCard;
  }

  updateTask(taskId, update) {
    const task = this.tasks.get(taskId) || {};
    this.tasks.set(taskId, { ...task, ...update });
  }

  async stop() {
    this.removeAllListeners();
  }
}

module.exports = {
  A2AService: MockA2AService,
  A2AServiceConfig: {}
};