import { ClaudeClient, ClaudeAnalysisRequest, ClaudeAnalysisResponse } from '../../src/services/ClaudeClient';
import { MarketData, Signal } from '../../src/types';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk');

describe('ClaudeClient', () => {
  let claudeClient: ClaudeClient;
  let mockAnthropic: jest.Mocked<Anthropic>;
  let mockMessages: jest.Mocked<Anthropic.Messages>;

  beforeEach(() => {
    mockMessages = {
      create: jest.fn()
    } as any;

    mockAnthropic = {
      messages: mockMessages
    } as any;

    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => mockAnthropic);
    
    claudeClient = new ClaudeClient('test-api-key');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided API key', () => {
      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key'
      });
    });

    it('should use environment variable if no API key provided', () => {
      process.env.ANTHROPIC_API_KEY = 'env-api-key';
      new ClaudeClient();
      
      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'env-api-key'
      });
    });
  });

  const mockMarketData: MarketData[] = [
    {
      symbol: 'AAPL',
      timestamp: new Date(),
      open: 150,
      high: 155,
      low: 148,
      close: 153,
      volume: 1000000
    }
  ];

  describe('analyzeMarketData', () => {

    const mockRequest: ClaudeAnalysisRequest = {
      type: 'technical',
      data: mockMarketData,
      symbol: 'AAPL',
      context: 'Test analysis'
    };

    it('should analyze market data successfully', async () => {
      const mockResponse = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            signals: [{
              id: 'test-signal',
              agent_id: 'claude_technical',
              symbol: 'AAPL',
              action: 'BUY',
              confidence: 0.8,
              strength: 0.7,
              timestamp: new Date().toISOString(),
              reasoning: 'Strong technical indicators'
            }],
            reasoning: 'Technical analysis shows bullish trend',
            confidence: 0.8,
            risks: ['Market volatility'],
            recommendations: ['Monitor support levels']
          })
        }]
      };

      mockMessages.create.mockResolvedValue(mockResponse as any);

      const result = await claudeClient.analyzeMarketData(mockRequest);

      expect(mockMessages.create).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.1,
        system: expect.stringContaining('technical analysis'),
        messages: [{
          role: 'user',
          content: expect.stringContaining('AAPL')
        }]
      });

      expect(result).toEqual({
        signals: expect.arrayContaining([
          expect.objectContaining({
            action: 'BUY',
            confidence: 0.8,
            symbol: 'AAPL'
          })
        ]),
        reasoning: 'Technical analysis shows bullish trend',
        confidence: 0.8,
        risks: ['Market volatility'],
        recommendations: ['Monitor support levels']
      });
    });

    it('should handle different analysis types', async () => {
      const fundamentalRequest: ClaudeAnalysisRequest = {
        type: 'fundamental',
        data: mockMarketData,
        symbol: 'AAPL'
      };

      mockMessages.create.mockResolvedValue({
        content: [{ type: 'text', text: '{"signals": [], "reasoning": "Test", "confidence": 0.5, "risks": [], "recommendations": []}' }]
      } as any);

      await claudeClient.analyzeMarketData(fundamentalRequest);

      expect(mockMessages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('fundamental analysis')
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockMessages.create.mockRejectedValue(new Error('API Error'));

      await expect(claudeClient.analyzeMarketData(mockRequest))
        .rejects.toThrow('Claude analysis failed: API Error');
    });

    it('should handle invalid JSON response', async () => {
      mockMessages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'Invalid JSON response' }]
      } as any);

      const result = await claudeClient.analyzeMarketData(mockRequest);

      expect(result).toEqual({
        signals: [],
        reasoning: 'Failed to parse Claude response',
        confidence: 0,
        risks: ['API parsing error'],
        recommendations: ['Review Claude response format']
      });
    });

    it('should handle non-text response', async () => {
      mockMessages.create.mockResolvedValue({
        content: [{ type: 'image' }]
      } as any);

      await expect(claudeClient.analyzeMarketData(mockRequest))
        .rejects.toThrow('Unexpected response type from Claude');
    });

    it('should generate proper prompts for different analysis types', async () => {
      const newsRequest: ClaudeAnalysisRequest = {
        type: 'news',
        data: mockMarketData,
        symbol: 'AAPL'
      };

      mockMessages.create.mockResolvedValue({
        content: [{ type: 'text', text: '{"signals": [], "reasoning": "Test", "confidence": 0.5, "risks": [], "recommendations": []}' }]
      } as any);

      await claudeClient.analyzeMarketData(newsRequest);

      expect(mockMessages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('sentiment analysis')
        })
      );
    });
  });

  describe('validateConnection', () => {
    it('should return true for successful connection', async () => {
      mockMessages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello' }]
      } as any);

      const result = await claudeClient.validateConnection();
      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      mockMessages.create.mockRejectedValue(new Error('Connection failed'));

      const result = await claudeClient.validateConnection();
      expect(result).toBe(false);
    });

    it('should return false for empty response', async () => {
      mockMessages.create.mockResolvedValue({
        content: []
      } as any);

      const result = await claudeClient.validateConnection();
      expect(result).toBe(false);
    });
  });

  describe('Response Parsing', () => {
    it('should parse response with missing fields gracefully', async () => {
      const incompleteResponse = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            signals: [{
              symbol: 'AAPL',
              action: 'BUY'
              // Missing other required fields
            }]
          })
        }]
      };

      mockMessages.create.mockResolvedValue(incompleteResponse as any);

      const result = await claudeClient.analyzeMarketData({
        type: 'technical',
        data: mockMarketData,
        symbol: 'AAPL'
      });

      expect(result.signals[0]).toEqual(expect.objectContaining({
        symbol: 'AAPL',
        action: 'BUY',
        timestamp: expect.any(Date),
        agent_id: expect.stringContaining('claude_'),
        id: expect.any(String)
      }));
    });

    it('should clamp confidence values between 0 and 1', async () => {
      const responseWithInvalidConfidence = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            signals: [],
            reasoning: 'Test',
            confidence: 1.5, // Invalid - above 1
            risks: [],
            recommendations: []
          })
        }]
      };

      mockMessages.create.mockResolvedValue(responseWithInvalidConfidence as any);

      const result = await claudeClient.analyzeMarketData({
        type: 'technical',
        data: mockMarketData,
        symbol: 'AAPL'
      });

      expect(result.confidence).toBe(1); // Should be clamped to 1
    });
  });
});