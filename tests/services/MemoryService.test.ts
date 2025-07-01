import { MemoryService } from '../../src/services/MemoryService';
import { MemoryType, MemoryEntry, MemorySearchOptions, MemoryRetrievalContext } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    writeFile: jest.fn()
  }
}));

describe('MemoryService', () => {
  let memoryService: MemoryService;
  let mockFs: jest.Mocked<typeof fs>;
  const testPersistencePath = './test-memories';

  beforeEach(() => {
    jest.useFakeTimers();
    mockFs = require('fs');
    
    // Mock fs methods
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => '');
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.readFileSync.mockReturnValue('{}');
    (mockFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

    memoryService = new MemoryService(testPersistencePath);
  });

  afterEach(async () => {
    if (memoryService && memoryService.destroy) {
      memoryService.destroy();
    }
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default persistence path', () => {
      const service = new MemoryService();
      expect(service).toBeInstanceOf(MemoryService);
    });

    it('should create persistence directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      new MemoryService(testPersistencePath);
      
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testPersistencePath, { recursive: true });
    });

    it('should not create directory if it already exists', () => {
      // Reset all previous mocks
      jest.clearAllMocks();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);
      
      const service = new MemoryService(testPersistencePath);
      
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      service.destroy();
    });
  });

  describe('storeMemory', () => {
    it('should store memory and return ID', async () => {
      const memoryData = {
        agentId: 'test-agent',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL', marketCondition: 'bullish' as const },
        importance: 0.8,
        tags: ['market', 'AAPL']
      };

      const id = await memoryService.storeMemory(memoryData);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should persist high importance memories to disk', async () => {
      const memoryData = {
        agentId: 'test-agent',
        type: MemoryType.PERFORMANCE_FEEDBACK,
        content: { signalId: 'signal-1', accuracy: 0.9 },
        importance: 0.8,
        tags: ['performance']
      };

      await memoryService.storeMemory(memoryData);

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });

    it('should not persist low importance memories to disk', async () => {
      const memoryData = {
        agentId: 'test-agent',
        type: MemoryType.CONVERSATION,
        content: { message: 'test' },
        importance: 0.5,
        tags: ['conversation']
      };

      await memoryService.storeMemory(memoryData);

      expect(mockFs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('should emit memoryStored event', async () => {
      const memoryData = {
        agentId: 'test-agent',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL' },
        importance: 0.6,
        tags: ['market']
      };

      const eventSpy = jest.fn();
      memoryService.on('memoryStored', eventSpy);

      await memoryService.storeMemory(memoryData);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'test-agent',
          type: MemoryType.MARKET_CONTEXT
        })
      );
    });
  });

  describe('retrieveMemories', () => {
    beforeEach(async () => {
      // Store some test memories
      await memoryService.storeMemory({
        agentId: 'agent-1',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL', marketCondition: 'bullish' as const },
        importance: 0.8,
        tags: ['market', 'AAPL']
      });

      await memoryService.storeMemory({
        agentId: 'agent-1',
        type: MemoryType.ANALYSIS_HISTORY,
        content: { 
          analysisType: 'technical', 
          input: { symbol: 'AAPL' },
          output: [],
          claudeReasoning: 'Test reasoning',
          accuracy: 0.7 
        },
        importance: 0.6,
        tags: ['analysis', 'technical']
      });

      await memoryService.storeMemory({
        agentId: 'agent-2',
        type: MemoryType.PERFORMANCE_FEEDBACK,
        content: { signalId: 'signal-1', accuracy: 0.9 },
        importance: 0.9,
        tags: ['performance']
      });
    });

    it('should retrieve all memories when no filters applied', async () => {
      const memories = await memoryService.retrieveMemories({});
      expect(memories).toHaveLength(3);
    });

    it('should filter memories by agent ID', async () => {
      const memories = await memoryService.retrieveMemories({
        agentId: 'agent-1'
      });
      expect(memories).toHaveLength(2);
      expect(memories.every(m => m.agentId === 'agent-1')).toBe(true);
    });

    it('should filter memories by type', async () => {
      const memories = await memoryService.retrieveMemories({
        type: MemoryType.MARKET_CONTEXT
      });
      expect(memories).toHaveLength(1);
      expect(memories[0].type).toBe(MemoryType.MARKET_CONTEXT);
    });

    it('should filter memories by tags', async () => {
      const memories = await memoryService.retrieveMemories({
        tags: ['market']
      });
      expect(memories).toHaveLength(1);
      expect(memories[0].tags).toContain('market');
    });

    it('should filter memories by minimum importance', async () => {
      const memories = await memoryService.retrieveMemories({
        minImportance: 0.8
      });
      expect(memories).toHaveLength(2);
      expect(memories.every(m => m.importance >= 0.8)).toBe(true);
    });

    it('should limit number of results', async () => {
      const memories = await memoryService.retrieveMemories({
        limit: 2
      });
      expect(memories).toHaveLength(2);
    });

    it('should sort memories by importance and recency', async () => {
      const memories = await memoryService.retrieveMemories({});
      
      // Should be sorted by importance (descending), then by timestamp (descending)
      for (let i = 1; i < memories.length; i++) {
        const prev = memories[i - 1];
        const curr = memories[i];
        
        if (Math.abs(prev.importance - curr.importance) > 0.1) {
          expect(prev.importance).toBeGreaterThan(curr.importance);
        }
      }
    });
  });

  describe('getRelevantContext', () => {
    beforeEach(async () => {
      // Store memories with different relevance factors
      await memoryService.storeMemory({
        agentId: 'agent-1',
        type: MemoryType.MARKET_CONTEXT,
        content: { 
          symbol: 'AAPL', 
          marketCondition: 'bullish' as const,
          trend: 'uptrend' as const
        },
        importance: 0.8,
        tags: ['market', 'AAPL', 'bullish']
      });

      await memoryService.storeMemory({
        agentId: 'agent-1',
        type: MemoryType.ANALYSIS_HISTORY,
        content: { 
          analysisType: 'technical',
          input: { symbol: 'AAPL' },
          output: [],
          claudeReasoning: 'Test reasoning for AAPL',
          accuracy: 0.85
        },
        importance: 0.7,
        tags: ['analysis', 'technical', 'AAPL']
      });
    });

    it('should return relevant memories based on context', async () => {
      const context: MemoryRetrievalContext = {
        symbol: 'AAPL',
        analysisType: 'technical',
        maxMemories: 5,
        relevanceThreshold: 0.5
      };

      const memories = await memoryService.getRelevantContext('agent-1', context);
      
      expect(memories.length).toBeGreaterThan(0);
      expect(memories.every(m => m.agentId === 'agent-1')).toBe(true);
    });

    it('should respect relevance threshold', async () => {
      const context: MemoryRetrievalContext = {
        symbol: 'MSFT', // Different symbol - should have lower relevance
        maxMemories: 5,
        relevanceThreshold: 0.9 // High threshold
      };

      const memories = await memoryService.getRelevantContext('agent-1', context);
      
      // Should return fewer or no memories due to high threshold
      expect(memories.length).toBeLessThanOrEqual(2);
    });

    it('should limit results to maxMemories', async () => {
      const context: MemoryRetrievalContext = {
        maxMemories: 1,
        relevanceThreshold: 0.1
      };

      const memories = await memoryService.getRelevantContext('agent-1', context);
      
      expect(memories).toHaveLength(1);
    });
  });

  describe('Specialized Storage Methods', () => {
    describe('storeMarketContext', () => {
      it('should store market context memory', async () => {
        const context = {
          symbol: 'AAPL',
          timeframe: '1d' as const,
          marketCondition: 'bullish' as const,
          keyLevels: {
            support: [150, 148],
            resistance: [155, 158]
          },
          volatility: 0.02,
          volume: 'high' as const,
          trend: 'uptrend' as const,
          lastAnalysis: new Date()
        };

        const id = await memoryService.storeMarketContext('agent-1', context, 0.8);

        expect(id).toBeDefined();
        
        const memories = await memoryService.retrieveMemories({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT
        });
        
        expect(memories).toHaveLength(1);
        expect(memories[0].content).toEqual(context);
      });

      it('should set appropriate expiration for market context', async () => {
        const context = {
          symbol: 'AAPL',
          timeframe: '1d' as const,
          marketCondition: 'bullish' as const,
          keyLevels: { support: [150], resistance: [155] },
          volatility: 0.02,
          volume: 'high' as const,
          trend: 'uptrend' as const,
          lastAnalysis: new Date()
        };

        await memoryService.storeMarketContext('agent-1', context);

        const memories = await memoryService.retrieveMemories({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT
        });

        expect(memories[0].expiresAt).toBeDefined();
        expect(memories[0].expiresAt!.getTime()).toBeGreaterThan(Date.now());
      });
    });

    describe('storeAnalysisHistory', () => {
      it('should store analysis history memory', async () => {
        const analysis = {
          analysisType: 'technical' as const,
          input: { symbol: 'AAPL', timeframe: '1d' },
          output: [],
          claudeReasoning: 'Technical indicators suggest bullish trend',
          accuracy: 0.8,
          marketOutcome: 'correct' as const,
          lessons: ['RSI oversold signal was accurate']
        };

        const id = await memoryService.storeAnalysisHistory('agent-1', analysis, 0.7);

        expect(id).toBeDefined();
        
        const memories = await memoryService.retrieveMemories({
          agentId: 'agent-1',
          type: MemoryType.ANALYSIS_HISTORY
        });
        
        expect(memories).toHaveLength(1);
        expect(memories[0].content).toEqual(analysis);
      });
    });

    describe('storePerformanceFeedback', () => {
      it('should store performance feedback memory', async () => {
        const feedback = {
          signalId: 'signal-123',
          predicted: {
            id: 'signal-123',
            agent_id: 'agent-1',
            symbol: 'AAPL',
            action: 'BUY' as const,
            confidence: 0.8,
            strength: 0.7,
            timestamp: new Date(),
            reasoning: 'Test signal'
          },
          actual: {
            priceMovement: 0.05,
            timeToTarget: 3600,
            accuracy: 0.9
          },
          feedback: 'Excellent prediction',
          adjustments: ['Maintain current strategy']
        };

        const id = await memoryService.storePerformanceFeedback('agent-1', feedback, 0.9);

        expect(id).toBeDefined();
        
        const memories = await memoryService.retrieveMemories({
          agentId: 'agent-1',
          type: MemoryType.PERFORMANCE_FEEDBACK
        });
        
        expect(memories).toHaveLength(1);
        expect(memories[0].content).toEqual(feedback);
      });
    });

    describe('storeConversation', () => {
      it('should store conversation memory', async () => {
        const conversation = {
          role: 'user' as const,
          content: 'What is the market outlook?',
          context: 'market-inquiry',
          importance: 0.7
        };

        const id = await memoryService.storeConversation('agent-1', conversation, 0.5);

        expect(id).toBeDefined();
        
        const memories = await memoryService.retrieveMemories({
          agentId: 'agent-1',
          type: MemoryType.CONVERSATION
        });
        
        expect(memories).toHaveLength(1);
        expect(memories[0].content).toEqual(conversation);
      });
    });
  });

  describe('Memory Management', () => {
    describe('updateMemoryImportance', () => {
      it('should update memory importance', async () => {
        const id = await memoryService.storeMemory({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT,
          content: { symbol: 'AAPL' },
          importance: 0.5,
          tags: ['market']
        });

        await memoryService.updateMemoryImportance(id, 0.9);

        const memories = await memoryService.retrieveMemories({ agentId: 'agent-1' });
        expect(memories[0].importance).toBe(0.9);
      });

      it('should clamp importance values between 0 and 1', async () => {
        const id = await memoryService.storeMemory({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT,
          content: { symbol: 'AAPL' },
          importance: 0.5,
          tags: ['market']
        });

        await memoryService.updateMemoryImportance(id, 1.5);

        const memories = await memoryService.retrieveMemories({ agentId: 'agent-1' });
        expect(memories[0].importance).toBe(1);
      });

      it('should emit memoryUpdated event', async () => {
        const id = await memoryService.storeMemory({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT,
          content: { symbol: 'AAPL' },
          importance: 0.5,
          tags: ['market']
        });

        const eventSpy = jest.fn();
        memoryService.on('memoryUpdated', eventSpy);

        await memoryService.updateMemoryImportance(id, 0.8);

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            id,
            importance: 0.8
          })
        );
      });
    });

    describe('deleteMemory', () => {
      it('should delete memory and update indices', async () => {
        const id = await memoryService.storeMemory({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT,
          content: { symbol: 'AAPL' },
          importance: 0.5,
          tags: ['market']
        });

        await memoryService.deleteMemory(id);

        const memories = await memoryService.retrieveMemories({ agentId: 'agent-1' });
        expect(memories).toHaveLength(0);
      });

      it('should emit memoryDeleted event', async () => {
        const id = await memoryService.storeMemory({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT,
          content: { symbol: 'AAPL' },
          importance: 0.5,
          tags: ['market']
        });

        const eventSpy = jest.fn();
        memoryService.on('memoryDeleted', eventSpy);

        await memoryService.deleteMemory(id);

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({ id })
        );
      });
    });

    describe('clearMemories', () => {
      beforeEach(async () => {
        await memoryService.storeMemory({
          agentId: 'agent-1',
          type: MemoryType.MARKET_CONTEXT,
          content: { symbol: 'AAPL' },
          importance: 0.5,
          tags: ['market']
        });

        await memoryService.storeMemory({
          agentId: 'agent-2',
          type: MemoryType.ANALYSIS_HISTORY,
          content: { 
            analysisType: 'technical',
            input: { symbol: 'MSFT' },
            output: [],
            claudeReasoning: 'Test reasoning for MSFT'
          },
          importance: 0.6,
          tags: ['analysis']
        });
      });

      it('should clear all memories for specific agent', async () => {
        await memoryService.clearMemories('agent-1');

        const agent1Memories = await memoryService.retrieveMemories({ agentId: 'agent-1' });
        const agent2Memories = await memoryService.retrieveMemories({ agentId: 'agent-2' });

        expect(agent1Memories).toHaveLength(0);
        expect(agent2Memories).toHaveLength(1);
      });

      it('should clear all memories when no agent specified', async () => {
        await memoryService.clearMemories();

        const allMemories = await memoryService.retrieveMemories({});
        expect(allMemories).toHaveLength(0);
      });
    });
  });

  describe('getMemoryStats', () => {
    beforeEach(async () => {
      await memoryService.storeMemory({
        agentId: 'agent-1',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL' },
        importance: 0.8,
        tags: ['market']
      });

      await memoryService.storeMemory({
        agentId: 'agent-1',
        type: MemoryType.ANALYSIS_HISTORY,
        content: { analysisType: 'technical' },
        importance: 0.6,
        tags: ['analysis']
      });

      await memoryService.storeMemory({
        agentId: 'agent-2',
        type: MemoryType.PERFORMANCE_FEEDBACK,
        content: { signalId: 'signal-1' },
        importance: 0.9,
        tags: ['performance']
      });
    });

    it('should return comprehensive memory statistics', async () => {
      const stats = await memoryService.getMemoryStats();

      expect(stats).toEqual({
        totalMemories: 3,
        memoriesByType: expect.objectContaining({
          [MemoryType.MARKET_CONTEXT]: 1,
          [MemoryType.ANALYSIS_HISTORY]: 1,
          [MemoryType.PERFORMANCE_FEEDBACK]: 1,
          [MemoryType.CONVERSATION]: 0
        }),
        memoriesByAgent: {
          'agent-1': 2,
          'agent-2': 1
        },
        averageImportance: expect.closeTo(0.77, 2),
        oldestMemory: expect.any(Date),
        newestMemory: expect.any(Date)
      });
    });
  });

  describe('Persistence and Loading', () => {
    it('should attempt to load memories from disk on initialization', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['agent-1_memory-1.json'] as any);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        id: 'memory-1',
        agentId: 'agent-1',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL' },
        importance: 0.8,
        tags: ['market'],
        timestamp: new Date().toISOString()
      }));

      new MemoryService(testPersistencePath);

      expect(mockFs.readdirSync).toHaveBeenCalledWith(testPersistencePath);
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('should handle errors when loading corrupted memory files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['corrupted.json'] as any);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      new MemoryService(testPersistencePath);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load memory from corrupted.json'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup and Destruction', () => {
    it('should clean up resources when destroyed', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const removeListenersSpy = jest.spyOn(memoryService, 'removeAllListeners');

      memoryService.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(removeListenersSpy).toHaveBeenCalled();
    });
  });

  describe('Time-based Filtering', () => {
    it('should filter memories by time range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await memoryService.storeMemory({
        agentId: 'agent-1',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL' },
        importance: 0.5,
        tags: ['market']
      });

      const memories = await memoryService.retrieveMemories({
        timeRange: {
          start: yesterday,
          end: tomorrow
        }
      });

      expect(memories).toHaveLength(1);
    });

    it('should exclude expired memories by default', async () => {
      const expiredMemory = {
        agentId: 'agent-1',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL' },
        importance: 0.5,
        tags: ['market'],
        expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
      };

      await memoryService.storeMemory(expiredMemory);

      const memories = await memoryService.retrieveMemories({
        agentId: 'agent-1'
      });

      expect(memories).toHaveLength(0);
    });

    it('should include expired memories when requested', async () => {
      const expiredMemory = {
        agentId: 'agent-1',
        type: MemoryType.MARKET_CONTEXT,
        content: { symbol: 'AAPL' },
        importance: 0.5,
        tags: ['market'],
        expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
      };

      await memoryService.storeMemory(expiredMemory);

      const memories = await memoryService.retrieveMemories({
        agentId: 'agent-1',
        includeExpired: true
      });

      expect(memories).toHaveLength(1);
    });
  });
});