import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  MemoryEntry,
  MemoryType,
  MemorySearchOptions,
  MemoryRetrievalContext,
  MarketContextMemory,
  AnalysisHistoryMemory,
  PerformanceFeedbackMemory,
  ConversationMemory
} from '../types';

export class MemoryService extends EventEmitter {
  private memories: Map<string, MemoryEntry> = new Map();
  private agentMemories: Map<string, Set<string>> = new Map();
  private typeIndex: Map<MemoryType, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private persistencePath: string;
  private maxMemories: number;
  private maxMemoriesPerAgent: number;
  private cleanupInterval?: NodeJS.Timeout;
  private cleanupIntervalMs: number;
  private highImportanceThreshold: number;
  private enableMemory: boolean;

  constructor(persistencePath?: string) {
    super();
    this.enableMemory = process.env.ENABLE_AGENT_MEMORY !== 'false';
    this.persistencePath = persistencePath || process.env.MEMORY_PERSISTENCE_PATH || './data/memories';
    this.maxMemories = parseInt(process.env.MAX_MEMORIES_PER_AGENT || '1000');
    this.maxMemoriesPerAgent = parseInt(process.env.MAX_MEMORIES_PER_AGENT || '1000');
    this.cleanupIntervalMs = parseInt(process.env.MEMORY_CLEANUP_INTERVAL || '3600000');
    this.highImportanceThreshold = parseFloat(process.env.HIGH_IMPORTANCE_THRESHOLD || '0.7');
    
    if (this.enableMemory) {
      this.initializeIndices();
      this.ensurePersistenceDirectory();
      this.loadMemoriesFromDisk();
      this.startCleanupScheduler();
    }
  }

  private initializeIndices(): void {
    Object.values(MemoryType).forEach(type => {
      this.typeIndex.set(type, new Set());
    });
  }

  private ensurePersistenceDirectory(): void {
    if (!fs.existsSync(this.persistencePath)) {
      fs.mkdirSync(this.persistencePath, { recursive: true });
    }
  }

  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMemories();
    }, this.cleanupIntervalMs);
  }

  public async storeMemory(memory: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<string> {
    if (!this.enableMemory) {
      return 'memory-disabled';
    }

    const id = uuidv4();
    const entry: MemoryEntry = {
      ...memory,
      id,
      timestamp: new Date(),
    };

    // Store in main memory map
    this.memories.set(id, entry);

    // Update indices
    this.updateIndices(entry);

    // Manage memory limits
    await this.enforceMemoryLimits();

    // Persist to disk if important
    if (entry.importance >= this.highImportanceThreshold) {
      await this.persistMemory(entry);
    }

    this.emit('memoryStored', entry);
    return id;
  }

  private updateIndices(entry: MemoryEntry): void {
    // Agent index
    if (!this.agentMemories.has(entry.agentId)) {
      this.agentMemories.set(entry.agentId, new Set());
    }
    this.agentMemories.get(entry.agentId)!.add(entry.id);

    // Type index
    this.typeIndex.get(entry.type)?.add(entry.id);

    // Tag index
    entry.tags.forEach(tag => {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(entry.id);
    });
  }

  private removeFromIndices(entry: MemoryEntry): void {
    this.agentMemories.get(entry.agentId)?.delete(entry.id);
    this.typeIndex.get(entry.type)?.delete(entry.id);
    entry.tags.forEach(tag => {
      this.tagIndex.get(tag)?.delete(entry.id);
    });
  }

  public async retrieveMemories(options: MemorySearchOptions): Promise<MemoryEntry[]> {
    let candidateIds = new Set<string>();

    // Start with all memories or filter by agent
    if (options.agentId) {
      candidateIds = new Set(this.agentMemories.get(options.agentId) || []);
    } else {
      candidateIds = new Set(this.memories.keys());
    }

    // Filter by type
    if (options.type) {
      const typeIds = this.typeIndex.get(options.type) || new Set();
      candidateIds = new Set([...candidateIds].filter(id => typeIds.has(id)));
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      const tagIds = new Set<string>();
      options.tags.forEach(tag => {
        const ids = this.tagIndex.get(tag) || new Set();
        ids.forEach(id => tagIds.add(id));
      });
      candidateIds = new Set([...candidateIds].filter(id => tagIds.has(id)));
    }

    // Convert to memory entries and apply additional filters
    let memories = [...candidateIds]
      .map(id => this.memories.get(id))
      .filter((memory): memory is MemoryEntry => memory !== undefined);

    // Filter by time range
    if (options.timeRange) {
      memories = memories.filter(memory => 
        memory.timestamp >= options.timeRange!.start &&
        memory.timestamp <= options.timeRange!.end
      );
    }

    // Filter by importance
    if (options.minImportance !== undefined) {
      memories = memories.filter(memory => memory.importance >= options.minImportance!);
    }

    // Filter expired memories
    if (!options.includeExpired) {
      const now = new Date();
      memories = memories.filter(memory => 
        !memory.expiresAt || memory.expiresAt > now
      );
    }

    // Sort by importance and recency
    memories.sort((a, b) => {
      const importanceDiff = b.importance - a.importance;
      if (Math.abs(importanceDiff) > 0.1) return importanceDiff;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    // Apply limit
    if (options.limit) {
      memories = memories.slice(0, options.limit);
    }

    return memories;
  }

  public async getRelevantContext(
    agentId: string,
    context: MemoryRetrievalContext
  ): Promise<MemoryEntry[]> {
    const searchOptions: MemorySearchOptions = {
      agentId,
      limit: context.maxMemories || 10,
      minImportance: context.relevanceThreshold || 0.3,
      includeExpired: false,
    };

    const memories = await this.retrieveMemories(searchOptions);

    // Further filter and rank by relevance to current context
    return this.rankByRelevance(memories, context);
  }

  private rankByRelevance(memories: MemoryEntry[], context: MemoryRetrievalContext): MemoryEntry[] {
    return memories
      .map(memory => ({
        memory,
        relevanceScore: this.calculateRelevanceScore(memory, context)
      }))
      .filter(item => item.relevanceScore > (context.relevanceThreshold || 0.3))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, context.maxMemories || 10)
      .map(item => item.memory);
  }

  private calculateRelevanceScore(memory: MemoryEntry, context: MemoryRetrievalContext): number {
    let score = memory.importance;

    // Boost score for matching symbol
    if (context.symbol && memory.content.symbol === context.symbol) {
      score += 0.3;
    }

    // Boost score for matching analysis type
    if (context.analysisType && memory.content.analysisType === context.analysisType) {
      score += 0.2;
    }

    // Boost score for matching market condition
    if (context.marketCondition && memory.content.marketCondition === context.marketCondition) {
      score += 0.2;
    }

    // Boost score for recent memories
    const daysSinceCreated = (Date.now() - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 1) score += 0.2;
    else if (daysSinceCreated < 7) score += 0.1;

    // Boost score for specific memory types based on context
    if (memory.type === MemoryType.MARKET_CONTEXT && context.symbol) score += 0.15;
    if (memory.type === MemoryType.ANALYSIS_HISTORY && context.analysisType) score += 0.15;

    return Math.min(1.0, score);
  }

  public async storeMarketContext(
    agentId: string,
    context: MarketContextMemory,
    importance: number = 0.8
  ): Promise<string> {
    return this.storeMemory({
      agentId,
      type: MemoryType.MARKET_CONTEXT,
      content: context,
      importance,
      tags: ['market', context.symbol, context.marketCondition, context.trend],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
  }

  public async storeAnalysisHistory(
    agentId: string,
    analysis: AnalysisHistoryMemory,
    importance: number = 0.6
  ): Promise<string> {
    return this.storeMemory({
      agentId,
      type: MemoryType.ANALYSIS_HISTORY,
      content: analysis,
      importance,
      tags: ['analysis', analysis.analysisType, analysis.input.symbol || 'unknown'],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
  }

  public async storePerformanceFeedback(
    agentId: string,
    feedback: PerformanceFeedbackMemory,
    importance: number = 0.9
  ): Promise<string> {
    return this.storeMemory({
      agentId,
      type: MemoryType.PERFORMANCE_FEEDBACK,
      content: feedback,
      importance,
      tags: ['performance', 'feedback', feedback.predicted.symbol, feedback.predicted.action],
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    });
  }

  public async storeConversation(
    agentId: string,
    conversation: ConversationMemory,
    importance: number = 0.5
  ): Promise<string> {
    return this.storeMemory({
      agentId,
      type: MemoryType.CONVERSATION,
      content: conversation,
      importance,
      tags: ['conversation', conversation.role, conversation.context],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });
  }

  public async updateMemoryImportance(memoryId: string, newImportance: number): Promise<void> {
    const memory = this.memories.get(memoryId);
    if (memory) {
      memory.importance = Math.max(0, Math.min(1, newImportance));
      this.emit('memoryUpdated', memory);
    }
  }

  public async deleteMemory(memoryId: string): Promise<void> {
    const memory = this.memories.get(memoryId);
    if (memory) {
      this.removeFromIndices(memory);
      this.memories.delete(memoryId);
      this.emit('memoryDeleted', memory);
    }
  }

  private async enforceMemoryLimits(): Promise<void> {
    if (this.memories.size <= this.maxMemories) return;

    // Get memories sorted by importance (ascending) and age (oldest first)
    const memories = Array.from(this.memories.values())
      .sort((a, b) => {
        const importanceDiff = a.importance - b.importance;
        if (Math.abs(importanceDiff) > 0.1) return importanceDiff;
        return a.timestamp.getTime() - b.timestamp.getTime();
      });

    // Remove lowest importance and oldest memories
    const toRemove = this.memories.size - this.maxMemories;
    for (let i = 0; i < toRemove; i++) {
      await this.deleteMemory(memories[i].id);
    }
  }

  private cleanupExpiredMemories(): void {
    const now = new Date();
    const expiredIds: string[] = [];

    this.memories.forEach((memory, id) => {
      if (memory.expiresAt && memory.expiresAt <= now) {
        expiredIds.push(id);
      }
    });

    expiredIds.forEach(id => {
      this.deleteMemory(id);
    });

    if (expiredIds.length > 0) {
      this.emit('memoriesExpired', expiredIds.length);
    }
  }

  private async persistMemory(memory: MemoryEntry): Promise<void> {
    try {
      const filePath = path.join(this.persistencePath, `${memory.agentId}_${memory.id}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(memory, null, 2));
    } catch (error) {
      console.error('Failed to persist memory:', error);
    }
  }

  private loadMemoriesFromDisk(): void {
    try {
      if (!fs.existsSync(this.persistencePath)) return;

      const files = fs.readdirSync(this.persistencePath);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.persistencePath, file);
            const data = fs.readFileSync(filePath, 'utf8');
            const memory: MemoryEntry = JSON.parse(data);
            
            // Convert timestamp strings back to dates
            memory.timestamp = new Date(memory.timestamp);
            if (memory.expiresAt) {
              memory.expiresAt = new Date(memory.expiresAt);
            }

            this.memories.set(memory.id, memory);
            this.updateIndices(memory);
          } catch (error) {
            console.error(`Failed to load memory from ${file}:`, error);
          }
        }
      });

      console.log(`Loaded ${this.memories.size} memories from disk`);
    } catch (error) {
      console.error('Failed to load memories from disk:', error);
    }
  }

  public async getMemoryStats(): Promise<{
    totalMemories: number;
    memoriesByType: Record<string, number>;
    memoriesByAgent: Record<string, number>;
    averageImportance: number;
    oldestMemory: Date | null;
    newestMemory: Date | null;
  }> {
    const memories = Array.from(this.memories.values());
    
    const memoriesByType: Record<string, number> = {};
    const memoriesByAgent: Record<string, number> = {};
    
    Object.values(MemoryType).forEach(type => {
      memoriesByType[type] = this.typeIndex.get(type)?.size || 0;
    });

    this.agentMemories.forEach((memoryIds, agentId) => {
      memoriesByAgent[agentId] = memoryIds.size;
    });

    const importance = memories.map(m => m.importance);
    const timestamps = memories.map(m => m.timestamp);

    return {
      totalMemories: memories.length,
      memoriesByType,
      memoriesByAgent,
      averageImportance: importance.length > 0 ? importance.reduce((a, b) => a + b) / importance.length : 0,
      oldestMemory: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : null,
      newestMemory: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : null,
    };
  }

  public async storeSentimentContext(
    agentId: string,
    context: any,
    importance: number = 0.7
  ): Promise<string> {
    return this.storeMemory({
      agentId,
      type: MemoryType.MARKET_CONTEXT,
      content: context,
      importance,
      tags: ['sentiment', context.symbol, context.timeframe, 'analysis'],
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
    });
  }

  public async clearMemories(agentId?: string): Promise<void> {
    if (agentId) {
      const memoryIds = this.agentMemories.get(agentId) || new Set();
      for (const id of memoryIds) {
        await this.deleteMemory(id);
      }
    } else {
      this.memories.clear();
      this.agentMemories.clear();
      this.initializeIndices();
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.removeAllListeners();
  }
}