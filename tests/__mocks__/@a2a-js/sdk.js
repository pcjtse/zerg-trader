// Mock implementation of Google Agent2Agent SDK for testing

class MockA2AClient {
  constructor(config) {
    this.config = config;
    this.listeners = new Map();
    this.connectedAgents = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, ...args) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }

  async sendMessage(endpoint, message) {
    // Mock successful response
    return {
      jsonrpc: '2.0',
      result: { success: true },
      id: message.id
    };
  }

  async sendMessageStream(endpoint, message) {
    // Mock streaming response
    async function* mockStream() {
      yield {
        jsonrpc: '2.0',
        result: { success: true },
        id: message.id
      };
    }
    return mockStream();
  }

  async discoverAgent(endpoint) {
    // Mock agent discovery
    const mockAgent = {
      name: 'MockAgent',
      description: 'Mock agent for testing',
      version: '1.0.0',
      capabilities: ['test-capability'],
      endpoint: endpoint,
      methods: [{
        name: 'test',
        description: 'Test method',
        parameters: {}
      }]
    };
    
    this.connectedAgents.set(mockAgent.name, mockAgent);
    this.emit('agentDiscovered', mockAgent);
    return mockAgent;
  }

  async registerWithRegistry(registryEndpoint, agentCard) {
    // Mock registry registration
    this.emit('registeredWithRegistry', registryEndpoint);
  }

  async sendResponse(response) {
    // Mock response sending
    this.emit('responseSent', response);
  }

  async disconnect() {
    // Mock disconnection
    this.listeners.clear();
    this.connectedAgents.clear();
  }

  getConnectedAgents() {
    return Array.from(this.connectedAgents.values());
  }
}

class MockA2AServer {
  constructor(config) {
    this.config = config;
    this.listeners = new Map();
    this.connectedClients = new Map();
    this.isRunning = false;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, ...args) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }

  async start() {
    this.isRunning = true;
    this.emit('started');
  }

  async stop() {
    this.isRunning = false;
    this.connectedClients.clear();
    this.emit('stopped');
  }

  async sendMessage(clientId, message) {
    // Mock message sending to client
    this.emit('messageSent', { clientId, message });
  }

  async broadcast(message) {
    // Mock broadcast to all clients
    const clientIds = Array.from(this.connectedClients.keys());
    clientIds.forEach(clientId => {
      this.emit('messageSent', { clientId, message });
    });
  }

  getConnectedClients() {
    return Array.from(this.connectedClients.keys());
  }

  // Simulate client connection for testing
  simulateClientConnection(clientId, agentCard) {
    this.connectedClients.set(clientId, agentCard);
    this.emit('agentConnected', agentCard);
  }

  // Simulate client disconnection for testing
  simulateClientDisconnection(clientId) {
    const agentCard = this.connectedClients.get(clientId);
    this.connectedClients.delete(clientId);
    if (agentCard) {
      this.emit('agentDisconnected', agentCard.name);
    }
  }

  // Simulate incoming message for testing
  simulateIncomingMessage(message, clientId) {
    this.emit('message', message, clientId);
  }
}

// Export both classes and default export for different import styles
module.exports = {
  A2AClient: MockA2AClient,
  A2AServer: MockA2AServer,
  default: {
    A2AClient: MockA2AClient,
    A2AServer: MockA2AServer
  }
};

// Also support named exports
module.exports.A2AClient = MockA2AClient;
module.exports.A2AServer = MockA2AServer;