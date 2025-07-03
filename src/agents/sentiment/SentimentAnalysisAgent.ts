import { BaseAgent } from '../BaseAgent';
import { AgentConfig, Signal, Agent2AgentMessage } from '../../types';
import { ClaudeAnalysisRequest } from '../../services/ClaudeClient';
import { NewsDataService } from '../../services/NewsDataService';
import { RedditDataService } from '../../services/RedditDataService';
import { v4 as uuidv4 } from 'uuid';

export interface SentimentData {
  source: 'techcrunch' | 'decoder' | 'reddit' | 'news';
  title: string;
  content: string;
  url: string;
  publishedAt: Date;
  author?: string;
  score?: number; // Reddit specific
  comments?: number; // Reddit specific
  subreddit?: string; // Reddit specific
  symbol?: string; // If article mentions specific stock
}

export interface SentimentScore {
  overall: number; // -1 to 1 scale
  confidence: number; // 0 to 1 scale
  positive: number;
  negative: number;
  neutral: number;
  keywords: string[];
  entities: string[]; // Company/stock mentions
}

export class SentimentAnalysisAgent extends BaseAgent {
  private newsService: NewsDataService;
  private redditService: RedditDataService;
  private sentimentCache: Map<string, { score: SentimentScore; timestamp: Date }> = new Map();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  constructor(
    config: AgentConfig, 
    enableClaude: boolean = true, 
    enableMemory: boolean = true
  ) {
    super(config, enableClaude, true, enableMemory);
    this.newsService = new NewsDataService();
    this.redditService = new RedditDataService();
  }

  protected async onStart(): Promise<void> {
    this.log('info', 'Sentiment Analysis Agent started');
    
    // Start periodic sentiment analysis for configured symbols
    this.startPeriodicAnalysis();
  }

  protected async onStop(): Promise<void> {
    this.log('info', 'Sentiment Analysis Agent stopped');
    this.sentimentCache.clear();
  }

  protected onMessage(message: Agent2AgentMessage): void {
    if (message.type === 'REQUEST' && message.payload.type === 'sentiment-analysis') {
      this.handleSentimentRequest(message.payload);
    }
  }

  protected async onA2AMessage(message: any): Promise<void> {
    if (message.payload?.sentimentRequest) {
      const { symbols, timeframe } = message.payload.sentimentRequest;
      const sentimentAnalysis = await this.analyzeSentiment(symbols, timeframe);
      
      if (this.a2aService) {
        await this.sendA2AMessage(message.from, 'sentimentResult', {
          requestId: message.id,
          sentiment: sentimentAnalysis,
          agent: this.config.name
        });
      }
    }
  }

  private startPeriodicAnalysis(): void {
    const symbols = this.config.parameters.symbols || ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN'];
    
    // Run analysis every 2 hours
    setInterval(async () => {
      try {
        for (const symbol of symbols) {
          const signals = await this.analyzeSentiment([symbol]);
          
          for (const signal of signals) {
            this.emitSignal(signal);
            
            // Broadcast via A2A if available
            if (this.a2aService) {
              await this.broadcastSignal(signal);
            }
          }
        }
      } catch (error) {
        this.log('error', `Periodic sentiment analysis failed: ${error}`);
      }
    }, 2 * 60 * 60 * 1000); // 2 hours

    // Initial run
    setTimeout(async () => {
      for (const symbol of symbols) {
        try {
          const signals = await this.analyzeSentiment([symbol]);
          signals.forEach(signal => this.emitSignal(signal));
        } catch (error) {
          this.log('warn', `Initial sentiment analysis failed for ${symbol}: ${error}`);
        }
      }
    }, 5000); // 5 second delay to allow startup
  }

  // Implementation of abstract method from BaseAgent
  public async analyze(data: any): Promise<Signal[]> {
    const { symbols, days = 7 } = data;
    return this.analyzeSentiment(symbols || ['AAPL'], days);
  }

  public async analyzeSentiment(symbols: string[], days: number = 7): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    for (const symbol of symbols) {
      try {
        // Check cache first
        const cacheKey = `${symbol}_${days}d`;
        const cached = this.sentimentCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp.getTime() < this.CACHE_DURATION) {
          const signal = this.createSentimentSignal(symbol, cached.score);
          if (signal) signals.push(signal);
          continue;
        }

        // Fetch fresh data from all sources
        const sentimentData = await this.fetchSentimentData(symbol, days);
        
        if (sentimentData.length === 0) {
          this.log('warn', `No sentiment data found for ${symbol}`);
          continue;
        }

        // Analyze sentiment using Claude AI
        const sentimentScore = await this.computeSentimentScore(symbol, sentimentData);
        
        // Cache the result
        this.sentimentCache.set(cacheKey, {
          score: sentimentScore,
          timestamp: new Date()
        });

        // Store in memory for future context
        if (this.enableMemory && this.memoryService) {
          await this.storeSentimentContext(symbol, sentimentScore, sentimentData);
        }

        // Generate trading signal
        const signal = this.createSentimentSignal(symbol, sentimentScore);
        if (signal) {
          signals.push(signal);
        }

      } catch (error) {
        this.log('error', `Sentiment analysis failed for ${symbol}: ${error}`);
      }
    }

    this.lastUpdate = new Date();
    return signals;
  }

  private async fetchSentimentData(symbol: string, days: number): Promise<SentimentData[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const allData: SentimentData[] = [];

    try {
      // Fetch from TechCrunch
      const techCrunchData = await this.newsService.fetchTechCrunchArticles(symbol, startDate, endDate);
      allData.push(...techCrunchData);
      this.log('info', `Fetched ${techCrunchData.length} TechCrunch articles for ${symbol}`);
    } catch (error) {
      this.log('warn', `TechCrunch fetch failed for ${symbol}: ${error}`);
    }

    try {
      // Fetch from The Verge Decoder
      const decoderData = await this.newsService.fetchDecoderArticles(symbol, startDate, endDate);
      allData.push(...decoderData);
      this.log('info', `Fetched ${decoderData.length} Decoder articles for ${symbol}`);
    } catch (error) {
      this.log('warn', `Decoder fetch failed for ${symbol}: ${error}`);
    }

    try {
      // Fetch from Reddit (WallStreetBets and investing subreddits)
      const redditData = await this.redditService.fetchInvestmentPosts(symbol, startDate, endDate);
      allData.push(...redditData);
      this.log('info', `Fetched ${redditData.length} Reddit posts for ${symbol}`);
    } catch (error) {
      this.log('warn', `Reddit fetch failed for ${symbol}: ${error}`);
    }

    // Sort by published date (newest first)
    allData.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    return allData;
  }

  private async computeSentimentScore(symbol: string, data: SentimentData[]): Promise<SentimentScore> {
    if (!this.claudeClient) {
      // Fallback to simple keyword-based sentiment
      return this.computeBasicSentiment(symbol, data);
    }

    try {
      // Get memory context for enhanced analysis
      const memoryContext = await this.getMemoryContext(symbol, 'sentiment');
      
      // Prepare data for Claude analysis
      const analysisContent = this.prepareSentimentAnalysisContent(symbol, data);
      
      const claudeRequest: ClaudeAnalysisRequest = {
        type: 'sentiment',
        data: analysisContent,
        symbol,
        context: `Sentiment analysis for ${symbol}. Recent sentiment patterns: ${memoryContext}`
      };

      const response = await this.claudeClient.analyzeMarketData(claudeRequest);
      
      // Parse Claude's sentiment analysis
      return this.parseClaudeSentimentResponse(response, data);
      
    } catch (error) {
      this.log('warn', `Claude sentiment analysis failed for ${symbol}: ${error}`);
      return this.computeBasicSentiment(symbol, data);
    }
  }

  private prepareSentimentAnalysisContent(symbol: string, data: SentimentData[]): any {
    return {
      symbol,
      totalArticles: data.length,
      sources: {
        techcrunch: data.filter(d => d.source === 'techcrunch').length,
        decoder: data.filter(d => d.source === 'decoder').length,
        reddit: data.filter(d => d.source === 'reddit').length
      },
      recentArticles: data.slice(0, 10).map(article => ({
        source: article.source,
        title: article.title,
        content: article.content.substring(0, 500), // First 500 chars
        publishedAt: article.publishedAt,
        score: article.score,
        subreddit: article.subreddit
      })),
      redditMetrics: {
        averageScore: this.calculateAverageRedditScore(data),
        totalComments: data.reduce((sum, d) => sum + (d.comments || 0), 0),
        topSubreddits: this.getTopSubreddits(data)
      }
    };
  }

  private parseClaudeSentimentResponse(response: any, data: SentimentData[]): SentimentScore {
    // Parse Claude's response and extract sentiment metrics
    const analysis = response.reasoning || response;
    
    // Extract sentiment from Claude's reasoning text
    const reasoning = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    
    // Basic sentiment extraction from Claude's text analysis
    const positiveWords = ['positive', 'bullish', 'optimistic', 'growth', 'strong'];
    const negativeWords = ['negative', 'bearish', 'pessimistic', 'decline', 'weak'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (reasoning.toLowerCase().includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (reasoning.toLowerCase().includes(word)) negativeCount++;
    });
    
    const totalSentimentWords = positiveCount + negativeCount;
    const overallSentiment = totalSentimentWords > 0 ? 
      (positiveCount - negativeCount) / totalSentimentWords : 0;
    
    return {
      overall: this.normalizeScore(overallSentiment),
      confidence: Math.min(1, Math.max(0, response.confidence || 0.7)),
      positive: totalSentimentWords > 0 ? positiveCount / totalSentimentWords : 0.33,
      negative: totalSentimentWords > 0 ? negativeCount / totalSentimentWords : 0.33,
      neutral: totalSentimentWords > 0 ? 
        Math.max(0, 1 - (positiveCount + negativeCount) / totalSentimentWords) : 0.34,
      keywords: this.extractKeywordsFromClaude(reasoning),
      entities: data.map(d => d.symbol).filter((v, i, a) => v && a.indexOf(v) === i) as string[] // unique symbols
    };
  }
  
  private extractKeywordsFromClaude(reasoning: string): string[] {
    // Extract meaningful keywords from Claude's analysis
    const words = reasoning.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const importantWords = words.filter(word => 
      ['earnings', 'revenue', 'growth', 'market', 'stock', 'bull', 'bear', 
       'positive', 'negative', 'strong', 'weak', 'rise', 'fall'].includes(word)
    );
    
    return [...new Set(importantWords)].slice(0, 10);
  }

  private computeBasicSentiment(symbol: string, data: SentimentData[]): SentimentScore {
    const positiveKeywords = [
      'bullish', 'buy', 'long', 'moon', 'rocket', 'gains', 'profit', 'up', 'rise', 'surge',
      'breakthrough', 'innovation', 'growth', 'strong', 'beat', 'exceed', 'outperform'
    ];
    
    const negativeKeywords = [
      'bearish', 'sell', 'short', 'crash', 'drop', 'fall', 'loss', 'down', 'decline',
      'disappointing', 'miss', 'weak', 'concern', 'risk', 'threat', 'lawsuit', 'fine'
    ];

    let totalScore = 0;
    let totalWeight = 0;
    const allKeywords: string[] = [];

    for (const item of data) {
      const text = `${item.title} ${item.content}`.toLowerCase();
      const weight = this.calculateItemWeight(item);
      
      let itemScore = 0;
      
      // Count positive keywords
      for (const keyword of positiveKeywords) {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        itemScore += matches * 0.1;
        if (matches > 0) allKeywords.push(keyword);
      }
      
      // Count negative keywords
      for (const keyword of negativeKeywords) {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        itemScore -= matches * 0.1;
        if (matches > 0) allKeywords.push(keyword);
      }

      // Reddit-specific scoring
      if (item.source === 'reddit' && item.score) {
        itemScore += Math.tanh(item.score / 100) * 0.2; // Normalize Reddit score
      }

      totalScore += itemScore * weight;
      totalWeight += weight;
    }

    const overallScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const normalizedScore = Math.tanh(overallScore); // Normalize to -1 to 1

    // Calculate positive/negative/neutral distribution
    const positive = Math.max(0, normalizedScore);
    const negative = Math.max(0, -normalizedScore);
    const neutral = 1 - Math.abs(normalizedScore);

    return {
      overall: normalizedScore,
      confidence: Math.min(0.9, Math.max(0.3, totalWeight / 100)), // Confidence based on data volume
      positive,
      negative,
      neutral,
      keywords: [...new Set(allKeywords)], // Remove duplicates
      entities: [symbol] // Basic entity extraction
    };
  }

  private calculateItemWeight(item: SentimentData): number {
    let weight = 1;
    
    // Recent articles have higher weight
    const ageHours = (Date.now() - item.publishedAt.getTime()) / (1000 * 60 * 60);
    weight *= Math.exp(-ageHours / 48); // Exponential decay over 48 hours
    
    // Source-specific weights
    switch (item.source) {
      case 'techcrunch':
        weight *= 1.2; // TechCrunch articles have high credibility
        break;
      case 'decoder':
        weight *= 1.1; // The Verge has good tech coverage
        break;
      case 'reddit':
        // Reddit weight based on score and subreddit
        if (item.subreddit === 'wallstreetbets') {
          weight *= 0.8; // WSB can be very noisy
        } else if (item.subreddit === 'investing') {
          weight *= 1.0; // More serious discussion
        }
        if (item.score && item.score > 100) {
          weight *= 1.2; // High-scored posts are more significant
        }
        break;
    }

    return weight;
  }

  private createSentimentSignal(symbol: string, sentiment: SentimentScore): Signal | null {
    const threshold = this.config.parameters.sentimentThreshold || 0.3;
    
    if (Math.abs(sentiment.overall) < threshold) {
      return null; // Sentiment not strong enough for signal
    }

    const action: 'BUY' | 'SELL' | 'HOLD' = sentiment.overall > threshold ? 'BUY' : 
                                          sentiment.overall < -threshold ? 'SELL' : 'HOLD';
    
    if (action === 'HOLD') return null;

    const confidence = Math.min(0.85, sentiment.confidence * Math.abs(sentiment.overall));
    const strength = confidence * 0.7; // Sentiment signals are supporting, not primary

    return {
      id: uuidv4(),
      agent_id: this.config.id,
      symbol,
      action,
      confidence,
      strength,
      timestamp: new Date(),
      reasoning: `Sentiment analysis shows ${sentiment.overall > 0 ? 'positive' : 'negative'} sentiment (${(sentiment.overall * 100).toFixed(1)}%) with ${sentiment.confidence * 100}% confidence. Key indicators: ${sentiment.keywords.slice(0, 3).join(', ')}`,
      metadata: {
        sentimentScore: sentiment.overall,
        sentimentConfidence: sentiment.confidence,
        positiveRatio: sentiment.positive,
        negativeRatio: sentiment.negative,
        neutralRatio: sentiment.neutral,
        keywords: sentiment.keywords,
        entities: sentiment.entities,
        indicator: 'SENTIMENT',
        signal_type: 'SENTIMENT_ANALYSIS'
      }
    };
  }

  private async storeSentimentContext(symbol: string, sentiment: SentimentScore, data: SentimentData[]): Promise<void> {
    if (!this.memoryService) return;

    try {
      await this.memoryService.storeSentimentContext(
        this.config.id,
        {
          symbol,
          timeframe: '7d',
          sentiment,
          dataVolume: data.length,
          sources: {
            techcrunch: data.filter(d => d.source === 'techcrunch').length,
            decoder: data.filter(d => d.source === 'decoder').length,
            reddit: data.filter(d => d.source === 'reddit').length
          },
          topKeywords: sentiment.keywords.slice(0, 10),
          lastAnalysis: new Date()
        },
        0.7 // Medium-high importance
      );
    } catch (error) {
      this.log('warn', `Failed to store sentiment context: ${error}`);
    }
  }

  private handleSentimentRequest(payload: any): void {
    const { symbol, timeframe = 7 } = payload;
    
    this.analyzeSentiment([symbol], timeframe).then(signals => {
      this.emit('sentimentAnalysisComplete', {
        symbol,
        signals,
        timestamp: new Date()
      });
    }).catch(error => {
      this.log('error', `Sentiment request failed: ${error}`);
    });
  }

  private calculateAverageRedditScore(data: SentimentData[]): number {
    const redditPosts = data.filter(d => d.source === 'reddit' && d.score);
    if (redditPosts.length === 0) return 0;
    
    return redditPosts.reduce((sum, post) => sum + (post.score || 0), 0) / redditPosts.length;
  }

  private getTopSubreddits(data: SentimentData[]): string[] {
    const subredditCounts = new Map<string, number>();
    
    data.filter(d => d.source === 'reddit' && d.subreddit)
        .forEach(post => {
          const count = subredditCounts.get(post.subreddit!) || 0;
          subredditCounts.set(post.subreddit!, count + 1);
        });

    return Array.from(subredditCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  private normalizeScore(score: number): number {
    return Math.max(-1, Math.min(1, score));
  }

  protected getCapabilities(): string[] {
    return [
      'sentiment-analysis',
      'news-aggregation',
      'social-media-analysis',
      'techcrunch-monitoring',
      'decoder-monitoring',
      'reddit-analysis',
      'wallstreetbets-tracking',
      'keyword-extraction',
      'entity-recognition',
      'ai-enhanced-sentiment',
      'real-time-sentiment'
    ];
  }

  protected getMethodInfo() {
    return [
      {
        name: 'analyzeSentiment',
        description: 'Analyze sentiment for given symbols from multiple sources',
        parameters: {
          symbols: 'string[]',
          days: 'number'
        },
        returns: { signals: 'Signal[]' }
      },
      {
        name: 'fetchSentimentData',
        description: 'Fetch raw sentiment data from TechCrunch, Decoder, and Reddit',
        parameters: {
          symbol: 'string',
          days: 'number'
        },
        returns: { data: 'SentimentData[]' }
      },
      {
        name: 'computeSentimentScore',
        description: 'Compute sentiment score using AI and keyword analysis',
        parameters: {
          symbol: 'string',
          data: 'SentimentData[]'
        },
        returns: { score: 'SentimentScore' }
      }
    ];
  }
}