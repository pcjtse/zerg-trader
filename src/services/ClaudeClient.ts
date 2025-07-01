import Anthropic from '@anthropic-ai/sdk';
import { Signal, MarketData, TechnicalIndicator, FundamentalData, NewsData } from '../types';
import { MemoryService } from './MemoryService';

export interface ClaudeAnalysisRequest {
  type: 'technical' | 'fundamental' | 'news' | 'fusion';
  data: MarketData[] | TechnicalIndicator[] | FundamentalData[] | NewsData[] | Signal[];
  context?: string;
  symbol?: string;
}

export interface ClaudeAnalysisResponse {
  signals: Signal[];
  reasoning: string;
  confidence: number;
  risks: string[];
  recommendations: string[];
}

export class ClaudeClient {
  private client: Anthropic;
  private model: string = 'claude-3-5-sonnet-20241022';
  private memoryService?: MemoryService;
  private enableClaudeAnalysis: boolean;
  private confidenceThreshold: number;
  private analysisTimeout: number;

  constructor(apiKey?: string, memoryService?: MemoryService) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.memoryService = memoryService;
    this.enableClaudeAnalysis = process.env.ENABLE_CLAUDE_ANALYSIS !== 'false';
    this.confidenceThreshold = parseFloat(process.env.CLAUDE_CONFIDENCE_THRESHOLD || '0.7');
    this.analysisTimeout = parseInt(process.env.AI_ANALYSIS_TIMEOUT || '30000');
  }

  async analyzeMarketData(request: ClaudeAnalysisRequest): Promise<ClaudeAnalysisResponse> {
    if (!this.enableClaudeAnalysis) {
      return {
        signals: [],
        reasoning: 'Claude analysis is disabled',
        confidence: 0,
        risks: ['Analysis disabled'],
        recommendations: []
      };
    }

    const systemPrompt = this.buildSystemPrompt(request.type);
    const userPrompt = this.buildUserPrompt(request);

    try {
      const message = await Promise.race([
        this.client.messages.create({
          model: this.model,
          max_tokens: 4000,
          temperature: 0.1,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Analysis timeout')), this.analysisTimeout)
        )
      ]);

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return this.parseResponse(content.text, request);
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error(`Claude analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildSystemPrompt(analysisType: string): string {
    const basePrompt = `You are an expert financial analyst AI specializing in ${analysisType} analysis for algorithmic trading systems. 
Your role is to analyze market data and provide actionable trading signals with clear reasoning.

Response format should be JSON with this structure:
{
  "signals": [
    {
      "id": "unique_id",
      "agent_id": "claude_${analysisType}",
      "symbol": "SYMBOL",
      "action": "BUY|SELL|HOLD",
      "confidence": 0.0-1.0,
      "strength": 0.0-1.0,
      "timestamp": "ISO_DATE",
      "reasoning": "detailed explanation",
      "metadata": {}
    }
  ],
  "reasoning": "overall analysis summary",
  "confidence": 0.0-1.0,
  "risks": ["risk1", "risk2"],
  "recommendations": ["rec1", "rec2"]
}

Guidelines:
- Be conservative with confidence scores
- Provide clear, actionable reasoning
- Consider risk management
- Flag high-risk scenarios
- Use technical/fundamental principles appropriately`;

    switch (analysisType) {
      case 'technical':
        return basePrompt + `\n\nFocus on: price patterns, indicators, volume analysis, support/resistance levels, momentum signals.`;
      case 'fundamental':
        return basePrompt + `\n\nFocus on: financial ratios, earnings, revenue, debt levels, industry trends, economic indicators.`;
      case 'news':
        return basePrompt + `\n\nFocus on: sentiment analysis, market impact assessment, event categorization, timing considerations.`;
      case 'fusion':
        return basePrompt + `\n\nFocus on: synthesizing multiple signal types, conflict resolution, overall market direction assessment.`;
      default:
        return basePrompt;
    }
  }

  private buildUserPrompt(request: ClaudeAnalysisRequest): string {
    let prompt = `Analyze the following ${request.type} data and provide trading signals:\n\n`;
    
    if (request.symbol) {
      prompt += `Symbol: ${request.symbol}\n`;
    }
    
    if (request.context) {
      prompt += `Context: ${request.context}\n\n`;
    }

    prompt += `Data:\n${JSON.stringify(request.data, null, 2)}\n\n`;
    prompt += `Please provide your analysis in the specified JSON format.`;

    return prompt;
  }

  private parseResponse(responseText: string, request: ClaudeAnalysisRequest): ClaudeAnalysisResponse {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const signals: Signal[] = parsed.signals?.map((signal: any) => ({
        ...signal,
        timestamp: new Date(signal.timestamp || Date.now()),
        agent_id: signal.agent_id || `claude_${request.type}`,
        id: signal.id || `claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      })) || [];

      const response = {
        signals: signals.filter(signal => signal.confidence >= this.confidenceThreshold),
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        risks: parsed.risks || [],
        recommendations: parsed.recommendations || [],
      };

      // Filter out low confidence signals
      if (response.signals.length < signals.length) {
        response.risks.push(`${signals.length - response.signals.length} signals filtered due to low confidence`);
      }

      return response;
    } catch (error) {
      console.error('Failed to parse Claude response:', error);
      return {
        signals: [],
        reasoning: 'Failed to parse Claude response',
        confidence: 0,
        risks: ['API parsing error'],
        recommendations: ['Review Claude response format'],
      };
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      });
      return message.content.length > 0;
    } catch (error) {
      console.error('Claude connection validation failed:', error);
      return false;
    }
  }

  public async updateMemoryWithFeedback(
    agentId: string,
    signalId: string,
    actualOutcome: {
      priceMovement: number;
      timeToTarget: number;
      accuracy: number;
    },
    feedback: string
  ): Promise<void> {
    if (!this.memoryService) return;

    try {
      // Find the original signal in memory
      const memories = await this.memoryService.retrieveMemories({
        agentId,
        type: 'analysis_history' as any,
        limit: 50
      });

      const relevantMemory = memories.find(memory => 
        memory.content.output?.some((signal: Signal) => signal.id === signalId)
      );

      if (relevantMemory) {
        const signal = relevantMemory.content.output.find((s: Signal) => s.id === signalId);
        if (signal) {
          // Store performance feedback
          await this.memoryService.storePerformanceFeedback(
            agentId,
            {
              signalId,
              predicted: signal,
              actual: actualOutcome,
              feedback,
              adjustments: this.generateAdjustments(signal, actualOutcome)
            },
            0.9 // High importance for performance feedback
          );

          // Update the original memory's importance based on accuracy
          const newImportance = relevantMemory.importance * (0.5 + actualOutcome.accuracy * 0.5);
          await this.memoryService.updateMemoryImportance(relevantMemory.id, newImportance);
        }
      }
    } catch (error) {
      console.error('Failed to update memory with feedback:', error);
    }
  }

  private generateAdjustments(predicted: Signal, actual: any): string[] {
    const adjustments: string[] = [];

    if (actual.accuracy < 0.5) {
      adjustments.push(`Low accuracy (${actual.accuracy}%) - review ${predicted.action} signal criteria`);
    }

    if (Math.abs(actual.priceMovement) < 0.01) {
      adjustments.push('Minimal price movement - consider higher volatility threshold');
    }

    if (predicted.confidence > 0.8 && actual.accuracy < 0.6) {
      adjustments.push('Overconfident prediction - be more conservative with confidence scores');
    }

    if (predicted.confidence < 0.5 && actual.accuracy > 0.8) {
      adjustments.push('Underconfident prediction - similar patterns may warrant higher confidence');
    }

    return adjustments;
  }

  public setMemoryService(memoryService: MemoryService): void {
    this.memoryService = memoryService;
  }
}