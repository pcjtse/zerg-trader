// Global test setup
beforeEach(() => {
  // Clear all timers before each test
  jest.clearAllTimers();
  // Clear all mocks
  jest.clearAllMocks();
});

// Global test teardown to clean up resources
afterEach(() => {
  // Clear any remaining timers
  jest.clearAllTimers();
  
  // Force garbage collection of any lingering intervals/timeouts
  if (global.gc) {
    global.gc();
  }
});

// Clean up after all tests
afterAll(() => {
  // Clean up global monitoring service
  try {
    const { monitoringService } = require('../src/monitoring/MonitoringService');
    if (monitoringService && typeof monitoringService.destroy === 'function') {
      monitoringService.destroy();
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
  
  // Clean up all MemoryService instances
  try {
    const { MemoryService } = require('../src/services/MemoryService');
    if (MemoryService && typeof MemoryService.destroyAllInstances === 'function') {
      MemoryService.destroyAllInstances();
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
  
  // Clear all timers
  jest.clearAllTimers();
  
  // Run any fake timers to completion
  if (jest.getTimerCount && jest.getTimerCount() > 0) {
    jest.runAllTimers();
  }
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