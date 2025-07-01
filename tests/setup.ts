// Global test setup
beforeEach(() => {
  // Clear all timers before each test
  jest.clearAllTimers();
  // Clear all mocks
  jest.clearAllMocks();
});

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};