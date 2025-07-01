import { DecisionFusionAgent } from '../../../src/agents/fusion/DecisionFusionAgent';
import { AgentConfig, Signal } from '../../../src/types';

describe('DecisionFusionAgent', () => {
  let agent: DecisionFusionAgent;
  let config: AgentConfig;
  let mockSignals: Signal[];

  beforeEach(() => {
    config = {
      id: 'fusion-agent-1',
      name: 'Test Decision Fusion Agent',
      type: 'FUSION',
      enabled: true,
      parameters: {
        fusion_methods: ['weighted', 'voting', 'ml'],
        min_signals_required: 2,
        signal_expiry_minutes: 5,
        confidence_threshold: 0.6,
        enable_meta_fusion: true,
        performance_window_days: 30
      },
      weight: 1.0
    };

    agent = new DecisionFusionAgent(config);

    // Create diverse mock signals from different agents
    mockSignals = [
      {
        id: 'signal-1',
        agent_id: 'technical-agent-1',
        symbol: 'AAPL',
        action: 'BUY',
        confidence: 0.8,
        strength: 0.7,
        timestamp: new Date(),
        reasoning: 'Strong upward trend in technical indicators',
        metadata: { 
          signal_type: 'TECHNICAL',
          indicators: ['SMA', 'RSI'],
          timeframe: '1d'
        }
      },
      {
        id: 'signal-2',
        agent_id: 'fundamental-agent-1',
        symbol: 'AAPL',
        action: 'BUY',
        confidence: 0.9,
        strength: 0.8,
        timestamp: new Date(),
        reasoning: 'Undervalued based on P/E ratio and strong fundamentals',
        metadata: { 
          signal_type: 'FUNDAMENTAL',
          pe_ratio: 18.5,
          roe: 0.25
        }
      },
      {
        id: 'signal-3',
        agent_id: 'mean-reversion-agent-1',
        symbol: 'AAPL',
        action: 'SELL',
        confidence: 0.6,
        strength: 0.5,
        timestamp: new Date(),
        reasoning: 'Price approaching overbought levels',
        metadata: { 
          signal_type: 'TECHNICAL',
          indicators: ['RSI', 'Bollinger Bands'],
          rsi_value: 75
        }
      },
      {
        id: 'signal-4',
        agent_id: 'sentiment-agent-1',
        symbol: 'AAPL',
        action: 'HOLD',
        confidence: 0.7,
        strength: 0.4,
        timestamp: new Date(),
        reasoning: 'Mixed sentiment in news and social media',
        metadata: { 
          signal_type: 'SENTIMENT',
          sentiment_score: 0.1,
          news_count: 15
        }
      }
    ];
  });

  describe('Lifecycle Management', () => {
    it('should start successfully', async () => {
      const messageListener = jest.fn();
      const logListener = jest.fn();
      
      agent.on('message', messageListener);
      agent.on('log', logListener);
      
      await agent.start();
      
      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '*',
          type: 'REQUEST',
          payload: expect.objectContaining({
            type: 'subscribe_signals',
            subscriber: 'fusion-agent-1'
          })
        })
      );
      
      expect(logListener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Decision Fusion Agent started'
        })
      );
    });

    it('should stop successfully and clear data', async () => {
      const logListener = jest.fn();
      agent.on('log', logListener);
      
      await agent.start();
      await agent.stop();
      
      expect(logListener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Decision Fusion Agent stopped'
        })
      );
    });
  });

  describe('Signal Analysis and Fusion', () => {
    beforeEach(async () => {
      await agent.start();
    });

    afterEach(async () => {
      await agent.stop();
    });

    it('should generate fused signals with sufficient input signals', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      expect(Array.isArray(signals)).toBe(true);
      expect(signals.length).toBeGreaterThan(0);
      
      // Check signal structure
      signals.forEach(signal => {
        expect(signal.id).toBeDefined();
        expect(signal.agent_id).toBe('fusion-agent-1');
        expect(signal.symbol).toBe('AAPL');
        expect(['BUY', 'SELL', 'HOLD']).toContain(signal.action);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(1);
        expect(signal.timestamp).toBeInstanceOf(Date);
        expect(signal.reasoning).toBeDefined();
        expect(signal.metadata).toBeDefined();
      });
    });

    it('should return empty array with insufficient signals', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: [mockSignals[0]] // Only one signal
      });
      
      expect(signals).toEqual([]);
    });

    it('should perform weighted fusion correctly', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      const weightedSignals = signals.filter(s => 
        s.reasoning.toLowerCase().includes('weighted') ||
        s.metadata?.fusion_method === 'weighted'
      );
      
      expect(weightedSignals.length).toBeGreaterThan(0);
      
      weightedSignals.forEach(signal => {
        expect(signal.metadata?.input_signals_count).toBeGreaterThan(1);
        expect(signal.metadata?.fusion_method).toBeDefined();
      });
    });

    it('should perform voting fusion correctly', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      const votingSignals = signals.filter(s => 
        s.reasoning.toLowerCase().includes('voting') ||
        s.metadata?.fusion_method === 'voting'
      );
      
      expect(votingSignals.length).toBeGreaterThan(0);
      
      votingSignals.forEach(signal => {
        expect(signal.metadata?.vote_counts).toBeDefined();
        expect(signal.action).toBeDefined();
      });
    });

    it('should perform ML ensemble fusion', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      const mlSignals = signals.filter(s => 
        s.reasoning.toLowerCase().includes('ml') ||
        s.reasoning.toLowerCase().includes('ensemble') ||
        s.metadata?.fusion_method === 'ml'
      );
      
      expect(mlSignals.length).toBeGreaterThan(0);
      
      mlSignals.forEach(signal => {
        expect(signal.metadata?.ensemble_score).toBeDefined();
        expect(signal.confidence).toBeGreaterThan(0);
      });
    });

    it('should handle conflicting signals appropriately', async () => {
      // Create strongly conflicting signals
      const conflictingSignals = [
        {
          ...mockSignals[0],
          action: 'BUY' as const,
          confidence: 0.9,
          strength: 0.9
        },
        {
          ...mockSignals[1],
          action: 'SELL' as const,
          confidence: 0.9,
          strength: 0.9
        }
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: conflictingSignals
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Should either choose one side or suggest HOLD due to conflict
      signals.forEach(signal => {
        if (signal.action === 'HOLD') {
          expect(signal.reasoning.toLowerCase()).toContain('conflict');
        } else {
          // If it chooses a side, confidence should reflect the uncertainty
          expect(signal.confidence).toBeLessThan(0.9);
        }
      });
    });

    it('should perform meta-fusion when enabled', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      // Should generate meta-fusion signal that combines other fusion methods
      const metaSignals = signals.filter(s => 
        s.reasoning.toLowerCase().includes('meta') ||
        s.metadata?.fusion_method === 'meta'
      );
      
      expect(metaSignals.length).toBeGreaterThan(0);
      
      metaSignals.forEach(signal => {
        expect(signal.metadata?.component_methods).toBeDefined();
        expect(Array.isArray(signal.metadata?.component_methods)).toBe(true);
      });
    });

    it('should filter expired signals', async () => {
      // Create signals with different timestamps
      const expiredSignals = mockSignals.map((signal, index) => ({
        ...signal,
        timestamp: new Date(Date.now() - (10 * 60 * 1000)) // 10 minutes ago (expired)
      }));
      
      const mixedSignals = [
        ...expiredSignals.slice(0, 2), // 2 expired signals
        ...mockSignals.slice(2)        // 2 current signals
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mixedSignals
      });
      
      // Should still generate signals but with fewer input signals
      expect(signals.length).toBeGreaterThan(0);
      
      signals.forEach(signal => {
        // Should indicate that some signals were filtered out
        expect(signal.metadata?.input_signals_count).toBeLessThanOrEqual(2);
      });
    });

    it('should track agent performance over time', async () => {
      // Simulate multiple rounds of signals from the same agents
      for (let i = 0; i < 3; i++) {
        await agent.analyze({
          symbol: 'AAPL',
          inputSignals: mockSignals
        });
      }
      
      // Performance tracking should be active
      const performanceData = (agent as any).agentPerformances;
      expect(performanceData.size).toBeGreaterThan(0);
      
      // Each agent should have performance metrics
      mockSignals.forEach(signal => {
        const performance = performanceData.get(signal.agent_id);
        expect(performance).toBeDefined();
        expect(performance.totalSignals).toBeGreaterThan(0);
      });
    });
  });

  describe('Message Handling', () => {
    it('should handle signal messages from other agents', async () => {
      await agent.start();
      
      const message = {
        from: 'technical-agent-1',
        to: 'fusion-agent-1',
        type: 'SIGNAL' as const,
        payload: mockSignals[0],
        timestamp: new Date(),
        id: 'msg-1'
      };
      
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });

    it('should handle subscription requests', async () => {
      await agent.start();
      
      const message = {
        from: 'portfolio-manager',
        to: 'fusion-agent-1',
        type: 'REQUEST' as const,
        payload: {
          type: 'subscribe_fusion_signals',
          symbols: ['AAPL', 'MSFT']
        },
        timestamp: new Date(),
        id: 'msg-2'
      };
      
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });

    it('should handle performance feedback messages', async () => {
      await agent.start();
      
      const message = {
        from: 'portfolio-manager',
        to: 'fusion-agent-1',
        type: 'RESPONSE' as const,
        payload: {
          type: 'signal_performance',
          signal_id: 'signal-1',
          success: true,
          return: 0.05
        },
        timestamp: new Date(),
        id: 'msg-3'
      };
      
      expect(() => {
        (agent as any).onMessage(message);
      }).not.toThrow();
      
      await agent.stop();
    });
  });

  describe('Configuration and Parameters', () => {
    it('should work with default parameters', () => {
      const minimalConfig: AgentConfig = {
        id: 'minimal-fusion-agent',
        name: 'Minimal Fusion Agent',
        type: 'FUSION',
        enabled: true,
        parameters: {},
        weight: 1.0
      };
      
      expect(() => {
        new DecisionFusionAgent(minimalConfig);
      }).not.toThrow();
    });

    it('should respect custom minimum signals requirement', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          min_signals_required: 4
        }
      };
      
      const customAgent = new DecisionFusionAgent(customConfig);
      await customAgent.start();
      
      // With only 3 signals, should not generate fusion signals
      const signals = await customAgent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals.slice(0, 3)
      });
      
      expect(signals).toEqual([]);
      
      await customAgent.stop();
    });

    it('should respect confidence threshold', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          confidence_threshold: 0.9 // Very high threshold
        }
      };
      
      const customAgent = new DecisionFusionAgent(customConfig);
      await customAgent.start();
      
      const signals = await customAgent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      // Should generate fewer signals due to high confidence threshold
      signals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThanOrEqual(0.8);
      });
      
      await customAgent.stop();
    });
  });

  describe('Fusion Methods Validation', () => {
    beforeEach(async () => {
      await agent.start();
    });

    afterEach(async () => {
      await agent.stop();
    });

    it('should weight signals based on agent performance', async () => {
      // Simulate agent performance history
      const mockPerformance = new Map([
        ['technical-agent-1', { 
          agentId: 'technical-agent-1',
          accuracy: 0.8,
          totalSignals: 100,
          successfulSignals: 80,
          averageReturn: 0.05,
          sharpeRatio: 1.5,
          lastUpdated: new Date()
        }],
        ['fundamental-agent-1', { 
          agentId: 'fundamental-agent-1',
          accuracy: 0.9,
          totalSignals: 50,
          successfulSignals: 45,
          averageReturn: 0.08,
          sharpeRatio: 2.0,
          lastUpdated: new Date()
        }]
      ]);
      
      (agent as any).agentPerformances = mockPerformance;
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Better performing agents should have higher influence
      signals.forEach(signal => {
        expect(signal.metadata?.agent_weights).toBeDefined();
      });
    });

    it('should handle unanimous agreement', async () => {
      // Create signals where all agents agree
      const unanimousSignals = mockSignals.map(signal => ({
        ...signal,
        action: 'BUY' as const,
        confidence: 0.8
      }));
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: unanimousSignals
      });
      
      expect(signals.length).toBeGreaterThan(0);
      
      // Should have high confidence due to agreement
      const buySignals = signals.filter(s => s.action === 'BUY');
      expect(buySignals.length).toBeGreaterThan(0);
      
      buySignals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThan(0.7);
        expect(signal.reasoning.toLowerCase()).toContain('agreement');
      });
    });

    it('should handle majority voting correctly', async () => {
      // Create 3 BUY signals and 1 SELL signal
      const majoritySignals = [
        { ...mockSignals[0], action: 'BUY' as const },
        { ...mockSignals[1], action: 'BUY' as const },
        { ...mockSignals[2], action: 'BUY' as const },
        { ...mockSignals[3], action: 'SELL' as const }
      ];
      
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: majoritySignals
      });
      
      const votingSignals = signals.filter(s => 
        s.metadata?.fusion_method === 'voting'
      );
      
      expect(votingSignals.length).toBeGreaterThan(0);
      
      // Majority should win
      votingSignals.forEach(signal => {
        expect(signal.action).toBe('BUY');
        expect(signal.metadata?.vote_counts).toBeDefined();
      });
    });
  });

  describe('Signal Quality and Metadata', () => {
    beforeEach(async () => {
      await agent.start();
    });

    afterEach(async () => {
      await agent.stop();
    });

    it('should include comprehensive metadata', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      signals.forEach(signal => {
        expect(signal.metadata).toBeDefined();
        expect(signal.metadata?.fusion_method).toBeDefined();
        expect(signal.metadata?.input_signals_count).toBeDefined();
        expect(signal.metadata?.component_confidences).toBeDefined();
        
        // Should track which agents contributed
        expect(signal.metadata?.contributing_agents).toBeDefined();
        expect(Array.isArray(signal.metadata?.contributing_agents)).toBe(true);
      });
    });

    it('should provide detailed fusion reasoning', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      signals.forEach(signal => {
        expect(signal.reasoning).toBeDefined();
        expect(signal.reasoning.length).toBeGreaterThan(20);
        
        // Should mention fusion methodology
        const reasoning = signal.reasoning.toLowerCase();
        const hasFusionTerm = reasoning.includes('fusion') || 
                             reasoning.includes('combined') ||
                             reasoning.includes('consensus') ||
                             reasoning.includes('weighted') ||
                             reasoning.includes('voting');
        expect(hasFusionTerm).toBe(true);
      });
    });

    it('should maintain signal traceability', async () => {
      const signals = await agent.analyze({
        symbol: 'AAPL',
        inputSignals: mockSignals
      });
      
      signals.forEach(signal => {
        // Should be able to trace back to input signals
        expect(signal.metadata?.input_signal_ids).toBeDefined();
        expect(Array.isArray(signal.metadata?.input_signal_ids)).toBe(true);
        expect(signal.metadata?.input_signal_ids.length).toBeGreaterThan(0);
      });
    });
  });
});