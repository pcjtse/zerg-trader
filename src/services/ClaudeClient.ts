import Anthropic from '@anthropic-ai/sdk';
import { Signal, MarketData, TechnicalIndicator, FundamentalData, NewsData } from '../types';

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

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async analyzeMarketData(request: ClaudeAnalysisRequest): Promise<ClaudeAnalysisResponse> {
    const systemPrompt = this.buildSystemPrompt(request.type);
    const userPrompt = this.buildUserPrompt(request);

    try {
      const message = await this.client.messages.create({
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
      });

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

  private parseResponse(response: string, request: ClaudeAnalysisRequest): ClaudeAnalysisResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
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

      return {
        signals,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        risks: parsed.risks || [],
        recommendations: parsed.recommendations || [],
      };
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
}