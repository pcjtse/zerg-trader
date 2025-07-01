// Mock implementation of @a2a-js/sdk for Jest
class MockA2AClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  on(event, callback) {
    // Mock event listener
  }

  sendMessage(endpoint, message) {
    return Promise.resolve({
      jsonrpc: '2.0',
      result: { success: true },
      id: message.id
    });
  }

  sendMessageStream(endpoint, message) {
    async function* mockStream() {
      yield {
        jsonrpc: '2.0',
        result: { success: true },
        id: message.id
      };
    }
    return mockStream();
  }

  removeAllListeners() {
    // Mock cleanup
  }
}

class MockA2AServer {
  constructor(config) {
    this.config = config;
  }

  start() {
    return Promise.resolve();
  }

  stop() {
    return Promise.resolve();
  }

  on(event, callback) {
    // Mock event listener
  }
}

module.exports = {
  A2AClient: MockA2AClient,
  A2AServer: MockA2AServer
};