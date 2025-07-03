import { SentimentAnalysisAgent } from '../../../src/agents/sentiment/SentimentAnalysisAgent';
import { AgentConfig } from '../../../src/types';

// Mock the services before importing
const mockNewsService = {
  fetchTechCrunchArticles: jest.fn(),
  fetchDecoderArticles: jest.fn()
};

const mockRedditService = {
  fetchInvestmentPosts: jest.fn(),
  getTrendingSymbols: jest.fn()
};

// Mock the service constructors
jest.mock('../../../src/services/NewsDataService', () => ({
  NewsDataService: jest.fn().mockImplementation(() => mockNewsService)
}));

jest.mock('../../../src/services/RedditDataService', () => ({
  RedditDataService: jest.fn().mockImplementation(() => mockRedditService)
}));

jest.mock('../../../src/services/ClaudeClient');
jest.mock('../../../src/services/A2AService');

describe('SentimentAnalysisAgent', () => {
  let agent: SentimentAnalysisAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      id: 'sentiment-agent-1',
      name: 'Test Sentiment Agent',
      type: 'SENTIMENT',
      enabled: true,
      parameters: {
        symbols: ['AAPL', 'MSFT'],
        sentimentThreshold: 0.3
      },
      weight: 1.0
    };

    // Clear mocks
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockNewsService.fetchTechCrunchArticles.mockResolvedValue([]);
    mockNewsService.fetchDecoderArticles.mockResolvedValue([]);
    mockRedditService.fetchInvestmentPosts.mockResolvedValue([]);

    agent = new SentimentAnalysisAgent(config, false, false); // Disable Claude and memory for basic tests
  });

  afterEach(async () => {
    if (agent) {
      await agent.stop();
    }
  });

  describe('Lifecycle Management', () => {
    it('should start successfully', async () => {
      await expect(agent.start()).resolves.not.toThrow();
      // Note: isRunning is protected, but start() should complete without error
    });

    it('should stop successfully', async () => {
      await agent.start();
      await expect(agent.stop()).resolves.not.toThrow();
      // Note: isRunning is protected, but stop() should complete without error
    });
  });

  describe('Sentiment Analysis', () => {
    it('should return empty array when no sentiment data is found', async () => {
      const signals = await agent.analyzeSentiment(['AAPL'], 7);
      expect(signals).toEqual([]);
    });

    it('should generate buy signal for positive sentiment', async () => {
      // Mock positive sentiment data
      const mockSentimentData = [
        {
          source: 'techcrunch' as const,
          title: 'Apple Reports Strong Earnings, Stock Soars',
          content: 'Apple exceeded expectations with record revenue and strong iPhone sales. Analysts bullish on future growth.',
          url: 'https://techcrunch.com/test-article',
          publishedAt: new Date(),
          author: 'Tech Reporter',
          symbol: 'AAPL'
        },
        {
          source: 'reddit' as const,
          title: 'AAPL to the moon! 🚀',
          content: 'Just bought calls on AAPL. This stock is going up big time. Strong fundamentals and great products.',
          url: 'https://reddit.com/r/wallstreetbets/test',
          publishedAt: new Date(),
          author: 'investor123',
          score: 250,
          comments: 45,
          subreddit: 'wallstreetbets',
          symbol: 'AAPL'
        }
      ];

      mockNewsService.fetchTechCrunchArticles.mockResolvedValue([mockSentimentData[0]]);
      mockRedditService.fetchInvestmentPosts.mockResolvedValue([mockSentimentData[1]]);

      const signals = await agent.analyzeSentiment(['AAPL'], 7);
      
      expect(signals.length).toBeGreaterThan(0);
      const buySignals = signals.filter(s => s.action === 'BUY');
      expect(buySignals.length).toBeGreaterThan(0);
      
      const signal = buySignals[0];
      expect(signal.symbol).toBe('AAPL');
      expect(signal.confidence).toBeGreaterThan(0.3);
      expect(signal.reasoning).toContain('positive');
      expect(signal.metadata?.indicator).toBe('SENTIMENT');
    });

    it('should generate sell signal for negative sentiment', async () => {
      // Mock negative sentiment data
      const mockSentimentData = [
        {
          source: 'techcrunch' as const,
          title: 'Apple Faces Major Lawsuit, Stock Tumbles',
          content: 'Apple is facing a significant lawsuit that could impact future sales. Concerns about declining market share.',
          url: 'https://techcrunch.com/test-article-2',
          publishedAt: new Date(),
          author: 'Business Reporter',
          symbol: 'AAPL'
        },
        {
          source: 'reddit' as const,
          title: 'AAPL puts printing money 📉',
          content: 'Apple is going down. Weak earnings, lawsuit concerns, and bearish technical indicators. Time to short.',
          url: 'https://reddit.com/r/wallstreetbets/test-2',
          publishedAt: new Date(),
          author: 'beartrader',
          score: 180,
          comments: 67,
          subreddit: 'wallstreetbets',
          symbol: 'AAPL'
        }
      ];

      mockNewsService.fetchTechCrunchArticles.mockResolvedValue([mockSentimentData[0]]);
      mockRedditService.fetchInvestmentPosts.mockResolvedValue([mockSentimentData[1]]);

      const signals = await agent.analyzeSentiment(['AAPL'], 7);
      
      expect(signals.length).toBeGreaterThan(0);
      const sellSignals = signals.filter(s => s.action === 'SELL');
      expect(sellSignals.length).toBeGreaterThan(0);
      
      const signal = sellSignals[0];
      expect(signal.symbol).toBe('AAPL');
      expect(signal.confidence).toBeGreaterThan(0.3);
      expect(signal.reasoning).toContain('negative');
      expect(signal.metadata?.indicator).toBe('SENTIMENT');
    });

    it('should not generate signal for neutral sentiment', async () => {
      // Mock neutral sentiment data
      const mockSentimentData = [
        {
          source: 'techcrunch' as const,
          title: 'Apple Releases Quarterly Report',
          content: 'Apple released its quarterly report with standard metrics. Various areas maintained previous levels.',
          url: 'https://techcrunch.com/neutral-article',
          publishedAt: new Date(),
          author: 'Reporter',
          symbol: 'AAPL'
        }
      ];

      mockNewsService.fetchTechCrunchArticles.mockResolvedValue(mockSentimentData);
      mockRedditService.fetchInvestmentPosts.mockResolvedValue([]);

      const signals = await agent.analyzeSentiment(['AAPL'], 7);
      
      // Should return empty array for neutral sentiment below threshold
      expect(signals).toEqual([]);
    });

    it('should handle multiple symbols', async () => {
      const mockAAPLData = [{
        source: 'reddit' as const,
        title: 'AAPL bullish trend continues',
        content: 'Apple stock showing strong momentum with bullish indicators',
        url: 'https://reddit.com/test',
        publishedAt: new Date(),
        author: 'trader',
        score: 100,
        subreddit: 'stocks',
        symbol: 'AAPL'
      }];

      const mockMSFTData = [{
        source: 'techcrunch' as const,
        title: 'Microsoft faces major decline, stock tumbles',
        content: 'Microsoft reported disappointing earnings with weak cloud growth. Concerns about significant decline and bearish outlook.',
        url: 'https://techcrunch.com/msft',
        publishedAt: new Date(),
        author: 'reporter',
        symbol: 'MSFT'
      }];

      // Mock different responses for different symbols
      mockNewsService.fetchTechCrunchArticles
        .mockImplementation((symbol) => {
          if (symbol === 'AAPL') return Promise.resolve([]);
          if (symbol === 'MSFT') return Promise.resolve(mockMSFTData);
          return Promise.resolve([]);
        });

      mockRedditService.fetchInvestmentPosts
        .mockImplementation((symbol) => {
          if (symbol === 'AAPL') return Promise.resolve(mockAAPLData);
          if (symbol === 'MSFT') return Promise.resolve([]);
          return Promise.resolve([]);
        });

      const signals = await agent.analyzeSentiment(['AAPL', 'MSFT'], 7);
      
      // Should get signals for both symbols
      const symbols = signals.map(s => s.symbol);
      expect(symbols).toContain('AAPL');
      expect(symbols).toContain('MSFT');
    });
  });

  describe('Data Source Integration', () => {
    it('should call all data sources', async () => {
      await agent.analyzeSentiment(['AAPL'], 7);
      
      expect(mockNewsService.fetchTechCrunchArticles).toHaveBeenCalledWith(
        'AAPL',
        expect.any(Date),
        expect.any(Date)
      );
      
      expect(mockNewsService.fetchDecoderArticles).toHaveBeenCalledWith(
        'AAPL',
        expect.any(Date),
        expect.any(Date)
      );
      
      expect(mockRedditService.fetchInvestmentPosts).toHaveBeenCalledWith(
        'AAPL',
        expect.any(Date),
        expect.any(Date)
      );
    });

    it('should handle service errors gracefully', async () => {
      mockNewsService.fetchTechCrunchArticles.mockRejectedValue(new Error('API Error'));
      mockNewsService.fetchDecoderArticles.mockRejectedValue(new Error('RSS Error'));
      mockRedditService.fetchInvestmentPosts.mockResolvedValue([]);

      const signals = await agent.analyzeSentiment(['AAPL'], 7);
      
      // Should not throw and return empty array
      expect(signals).toEqual([]);
    });
  });

  describe('Message Handling', () => {
    it('should handle sentiment analysis requests', async () => {
      const mockMessage = {
        from: 'test-agent',
        to: agent.getId(),
        type: 'REQUEST' as const,
        payload: {
          type: 'sentiment-analysis',
          symbol: 'AAPL',
          timeframe: 7
        },
        timestamp: new Date(),
        id: 'msg-123'
      };

      // Mock some positive sentiment data
      mockNewsService.fetchTechCrunchArticles.mockResolvedValue([{
        source: 'techcrunch' as const,
        title: 'Apple Stock Soars on Strong Earnings',
        content: 'Apple reported strong quarterly earnings with bullish outlook',
        url: 'https://techcrunch.com/test',
        publishedAt: new Date(),
        author: 'reporter',
        symbol: 'AAPL'
      }]);

      // Listen for sentiment analysis complete event
      const eventPromise = new Promise(resolve => {
        agent.once('sentimentAnalysisComplete', resolve);
      });

      // Send the message via the protected onMessage method
      (agent as any).onMessage(mockMessage);

      // Wait for analysis to complete
      const result = await eventPromise;
      
      expect(result).toBeDefined();
      expect((result as any).symbol).toBe('AAPL');
    });

    it('should ignore non-sentiment messages', async () => {
      const mockMessage = {
        from: 'test-agent',
        to: agent.getId(),
        type: 'DATA' as const,
        payload: {
          type: 'market-data',
          symbol: 'AAPL',
          data: []
        },
        timestamp: new Date(),
        id: 'msg-124'
      };

      // Should not throw
      expect(() => (agent as any).onMessage(mockMessage)).not.toThrow();
    });
  });

  describe('Configuration and Parameters', () => {
    it('should use custom sentiment threshold', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          sentimentThreshold: 0.7 // Higher threshold
        }
      };

      const customAgent = new SentimentAnalysisAgent(customConfig, false, false);

      // Mock weak positive sentiment
      const weakPositiveData = [{
        source: 'reddit' as const,
        title: 'AAPL might be okay',
        content: 'Apple stock is alright I guess, nothing special',
        url: 'https://reddit.com/test',
        publishedAt: new Date(),
        author: 'trader',
        score: 5,
        subreddit: 'stocks',
        symbol: 'AAPL'
      }];

      mockRedditService.fetchInvestmentPosts.mockResolvedValue(weakPositiveData);
      mockNewsService.fetchTechCrunchArticles.mockResolvedValue([]);
      mockNewsService.fetchDecoderArticles.mockResolvedValue([]);

      const signals = await customAgent.analyzeSentiment(['AAPL'], 7);
      
      // Should not generate signal due to high threshold
      expect(signals).toEqual([]);

      await customAgent.stop();
    });

    it('should work with default parameters when not specified', async () => {
      const minimalConfig = {
        id: 'sentiment-minimal',
        name: 'Minimal Sentiment Agent',
        type: 'SENTIMENT' as const,
        enabled: true,
        parameters: {},
        weight: 1.0
      };

      const minimalAgent = new SentimentAnalysisAgent(minimalConfig, false, false);
      
      await expect(minimalAgent.start()).resolves.not.toThrow();
      
      const signals = await minimalAgent.analyzeSentiment(['AAPL'], 7);
      expect(Array.isArray(signals)).toBe(true);

      await minimalAgent.stop();
    });
  });

  describe('Capabilities and Methods', () => {
    it('should expose correct capabilities', () => {
      const capabilities = (agent as any).getCapabilities();
      
      expect(capabilities).toContain('sentiment-analysis');
      expect(capabilities).toContain('news-aggregation');
      expect(capabilities).toContain('social-media-analysis');
      expect(capabilities).toContain('techcrunch-monitoring');
      expect(capabilities).toContain('reddit-analysis');
      expect(capabilities).toContain('wallstreetbets-tracking');
    });

    it('should provide method information', () => {
      const methods = (agent as any).getMethodInfo();
      
      expect(methods).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'analyzeSentiment',
            description: expect.stringContaining('sentiment'),
            parameters: expect.objectContaining({
              symbols: 'string[]',
              days: 'number'
            })
          })
        ])
      );
    });
  });

  describe('Signal Quality and Metadata', () => {
    it('should include comprehensive metadata in signals', async () => {
      const mockData = [{
        source: 'reddit' as const,
        title: 'AAPL moon rocket gains bullish',
        content: 'Apple stock showing strong bullish momentum with rocket gains',
        url: 'https://reddit.com/test',
        publishedAt: new Date(),
        author: 'trader',
        score: 500,
        comments: 100,
        subreddit: 'wallstreetbets',
        symbol: 'AAPL'
      }];

      mockRedditService.fetchInvestmentPosts.mockResolvedValue(mockData);
      mockNewsService.fetchTechCrunchArticles.mockResolvedValue([]);
      mockNewsService.fetchDecoderArticles.mockResolvedValue([]);

      const signals = await agent.analyzeSentiment(['AAPL'], 7);
      
      expect(signals.length).toBeGreaterThan(0);
      
      const signal = signals[0];
      expect(signal.metadata).toEqual(
        expect.objectContaining({
          sentimentScore: expect.any(Number),
          sentimentConfidence: expect.any(Number),
          positiveRatio: expect.any(Number),
          negativeRatio: expect.any(Number),
          neutralRatio: expect.any(Number),
          keywords: expect.any(Array),
          entities: expect.any(Array),
          indicator: 'SENTIMENT',
          signal_type: 'SENTIMENT_ANALYSIS'
        })
      );
    });

    it('should provide meaningful reasoning', async () => {
      const mockData = [{
        source: 'techcrunch' as const,
        title: 'Apple Innovation Drives Growth',
        content: 'Apple continues to innovate with strong product lineup driving growth',
        url: 'https://techcrunch.com/test',
        publishedAt: new Date(),
        author: 'reporter',
        symbol: 'AAPL'
      }];

      mockNewsService.fetchTechCrunchArticles.mockResolvedValue(mockData);
      mockRedditService.fetchInvestmentPosts.mockResolvedValue([]);
      mockNewsService.fetchDecoderArticles.mockResolvedValue([]);

      const signals = await agent.analyzeSentiment(['AAPL'], 7);
      
      if (signals.length > 0) {
        const signal = signals[0];
        expect(signal.reasoning).toMatch(/sentiment analysis shows/i);
        expect(signal.reasoning).toContain('confidence');
        expect(typeof signal.reasoning).toBe('string');
        expect(signal.reasoning.length).toBeGreaterThan(10);
      }
    });
  });
});