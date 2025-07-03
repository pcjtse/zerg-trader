import axios, { AxiosInstance } from 'axios';
import { SentimentData } from '../agents/sentiment/SentimentAnalysisAgent';

export interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    author: string;
    subreddit: string;
    score: number;
    num_comments: number;
    created_utc: number;
    url: string;
    permalink: string;
    upvote_ratio: number;
    link_flair_text?: string;
    is_self: boolean;
  };
}

export interface RedditResponse {
  data: {
    children: RedditPost[];
    after?: string;
    before?: string;
  };
}

export interface RedditComment {
  data: {
    id: string;
    body: string;
    author: string;
    score: number;
    created_utc: number;
    replies?: {
      data: {
        children: RedditComment[];
      };
    };
  };
}

export class RedditDataService {
  private client: AxiosInstance;
  private readonly REDDIT_BASE = 'https://www.reddit.com';
  private readonly RATE_LIMIT_DELAY = 2000; // 2 seconds between requests
  private readonly INVESTMENT_SUBREDDITS = [
    'wallstreetbets',
    'investing',
    'stocks',
    'SecurityAnalysis',
    'ValueInvesting',
    'financialindependence',
    'StockMarket',
    'pennystocks',
    'options',
    'daytrading'
  ];

  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'ZergTrader-RedditService/1.0.0 (Investment Analysis Bot)',
        'Accept': 'application/json',
      },
    });

    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.delay(this.RATE_LIMIT_DELAY);
      return config;
    });
  }

  public async fetchInvestmentPosts(symbol: string, startDate: Date, endDate: Date): Promise<SentimentData[]> {
    const allPosts: SentimentData[] = [];
    
    for (const subreddit of this.INVESTMENT_SUBREDDITS) {
      try {
        const posts = await this.fetchSubredditPosts(subreddit, symbol, startDate, endDate);
        allPosts.push(...posts);
        
        // Add delay between subreddit requests
        await this.delay(1000);
      } catch (error) {
        console.error(`Error fetching from r/${subreddit}:`, error);
      }
    }

    // Sort by score (Reddit popularity) and recency
    allPosts.sort((a, b) => {
      const scoreA = (a.score || 0) * this.getRecencyMultiplier(a.publishedAt);
      const scoreB = (b.score || 0) * this.getRecencyMultiplier(b.publishedAt);
      return scoreB - scoreA;
    });

    return allPosts;
  }

  private async fetchSubredditPosts(subreddit: string, symbol: string, startDate: Date, endDate: Date): Promise<SentimentData[]> {
    const posts: SentimentData[] = [];
    let after: string | undefined;
    let attempts = 0;
    const maxAttempts = 5; // Limit pagination to avoid excessive requests

    while (attempts < maxAttempts) {
      try {
        const url = `${this.REDDIT_BASE}/r/${subreddit}/new.json`;
        const params: any = {
          limit: 100,
          t: 'week' // Focus on last week for better performance
        };
        
        if (after) {
          params.after = after;
        }

        const response = await this.client.get(url, { params });
        const data: RedditResponse = response.data;

        if (!data.data.children || data.data.children.length === 0) {
          break;
        }

        for (const post of data.data.children) {
          const postDate = new Date(post.data.created_utc * 1000);
          
          // Skip posts outside date range
          if (postDate < startDate || postDate > endDate) {
            continue;
          }

          // Check if post mentions the symbol
          if (this.mentionsSymbol(post.data.title + ' ' + post.data.selftext, symbol)) {
            const sentimentData = await this.convertPostToSentimentData(post, subreddit, symbol);
            posts.push(sentimentData);
          }
        }

        // Check for pagination
        after = data.data.after;
        if (!after) {
          break;
        }

        attempts++;
      } catch (error) {
        console.error(`Error fetching page ${attempts + 1} from r/${subreddit}:`, error);
        break;
      }
    }

    return posts;
  }

  private async convertPostToSentimentData(post: RedditPost, subreddit: string, symbol: string): Promise<SentimentData> {
    let content = post.data.selftext || '';
    
    // For popular posts, fetch top comments for additional context
    if (post.data.score > 100 && post.data.num_comments > 10) {
      try {
        const comments = await this.fetchTopComments(post.data.permalink, 5);
        content += ' ' + comments.join(' ');
      } catch (error) {
        console.error(`Error fetching comments for post ${post.data.id}:`, error);
      }
    }

    return {
      source: 'reddit',
      title: post.data.title,
      content: this.cleanRedditText(content),
      url: `${this.REDDIT_BASE}${post.data.permalink}`,
      publishedAt: new Date(post.data.created_utc * 1000),
      author: post.data.author,
      score: post.data.score,
      comments: post.data.num_comments,
      subreddit: subreddit,
      symbol: symbol
    };
  }

  private async fetchTopComments(permalink: string, limit: number = 5): Promise<string[]> {
    try {
      const url = `${this.REDDIT_BASE}${permalink}.json`;
      const params = {
        limit: limit,
        sort: 'top'
      };

      const response = await this.client.get(url, { params });
      
      if (!Array.isArray(response.data) || response.data.length < 2) {
        return [];
      }

      const commentsData = response.data[1].data.children;
      const comments: string[] = [];

      for (const comment of commentsData.slice(0, limit)) {
        if (comment.data && comment.data.body && comment.data.body !== '[deleted]' && comment.data.body !== '[removed]') {
          comments.push(this.cleanRedditText(comment.data.body));
        }
      }

      return comments;
    } catch (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
  }

  public async searchSymbolMentions(symbol: string, timeframe: 'hour' | 'day' | 'week' = 'week'): Promise<SentimentData[]> {
    const allMentions: SentimentData[] = [];
    
    for (const subreddit of this.INVESTMENT_SUBREDDITS) {
      try {
        const url = `${this.REDDIT_BASE}/r/${subreddit}/search.json`;
        const params = {
          q: `${symbol} OR $${symbol}`,
          restrict_sr: true,
          sort: 'relevance',
          t: timeframe,
          limit: 25
        };

        const response = await this.client.get(url, { params });
        const data: RedditResponse = response.data;

        for (const post of data.data.children) {
          const sentimentData = await this.convertPostToSentimentData(post, subreddit, symbol);
          allMentions.push(sentimentData);
        }

        await this.delay(1000); // Rate limiting
      } catch (error) {
        console.error(`Error searching r/${subreddit} for ${symbol}:`, error);
      }
    }

    return allMentions;
  }

  public async getSubredditSentiment(subreddit: string, symbol: string): Promise<{
    averageScore: number;
    totalPosts: number;
    sentimentTrend: 'bullish' | 'bearish' | 'neutral';
    topKeywords: string[];
  }> {
    try {
      const posts = await this.fetchSubredditPosts(subreddit, symbol, 
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        new Date()
      );

      if (posts.length === 0) {
        return {
          averageScore: 0,
          totalPosts: 0,
          sentimentTrend: 'neutral',
          topKeywords: []
        };
      }

      const averageScore = posts.reduce((sum, post) => sum + (post.score || 0), 0) / posts.length;
      const keywords = this.extractKeywords(posts.map(p => p.title + ' ' + p.content).join(' '));
      
      // Analyze sentiment based on keywords and scores
      let sentimentTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      const bullishKeywords = ['moon', 'rocket', 'calls', 'buy', 'bull', 'gains', 'up'];
      const bearishKeywords = ['puts', 'short', 'bear', 'crash', 'down', 'sell', 'dump'];
      
      const bullishCount = keywords.filter(k => bullishKeywords.some(bk => k.includes(bk))).length;
      const bearishCount = keywords.filter(k => bearishKeywords.some(bk => k.includes(bk))).length;
      
      if (bullishCount > bearishCount && averageScore > 10) {
        sentimentTrend = 'bullish';
      } else if (bearishCount > bullishCount || averageScore < 0) {
        sentimentTrend = 'bearish';
      }

      return {
        averageScore,
        totalPosts: posts.length,
        sentimentTrend,
        topKeywords: keywords.slice(0, 10)
      };
    } catch (error) {
      console.error(`Error analyzing sentiment for r/${subreddit}:`, error);
      return {
        averageScore: 0,
        totalPosts: 0,
        sentimentTrend: 'neutral',
        topKeywords: []
      };
    }
  }

  private mentionsSymbol(text: string, symbol: string): boolean {
    const searchText = text.toLowerCase();
    const symbolLower = symbol.toLowerCase();
    
    // Look for exact symbol matches with $ prefix or standalone
    const symbolPatterns = [
      `\\$${symbolLower}\\b`,           // $AAPL
      `\\b${symbolLower}\\b`,           // AAPL (standalone word)
      `\\(${symbolLower}\\)`,           // (AAPL)
      `\\b${symbolLower}\\s+(stock|shares|calls|puts)` // AAPL stock/shares/calls/puts
    ];

    return symbolPatterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(searchText);
    });
  }

  private cleanRedditText(text: string): string {
    return text
      .replace(/\n+/g, ' ')          // Replace newlines with spaces
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .replace(/&gt;/g, '>')         // Decode HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
      .replace(/\[deleted\]/g, '')   // Remove deleted content markers
      .replace(/\[removed\]/g, '')
      .replace(/^\s*EDIT:.*$/gm, '') // Remove edit notices
      .replace(/^\s*UPDATE:.*$/gm, '')
      .trim();
  }

  private extractKeywords(text: string): string[] {
    // Extract meaningful keywords from Reddit text
    const words = text.toLowerCase()
      .replace(/[^\w\s$]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Count word frequency
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    // Filter out common words and return top keywords
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this',
      'that', 'these', 'those', 'all', 'any', 'some', 'each', 'every', 'just',
      'now', 'then', 'here', 'there', 'where', 'when', 'why', 'how', 'what',
      'who', 'which', 'reddit', 'post', 'comment', 'sub', 'thread'
    ]);

    return Array.from(wordCount.entries())
      .filter(([word, count]) => !stopWords.has(word) && count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(entry => entry[0]);
  }

  private getRecencyMultiplier(publishedAt: Date): number {
    const ageHours = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    // Posts lose relevance over time, but more gradually than news articles
    return Math.exp(-ageHours / 72); // 72-hour half-life
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method to get trending symbols from WallStreetBets
  public async getTrendingSymbols(limit: number = 10): Promise<{ symbol: string; mentions: number; sentiment: 'bullish' | 'bearish' | 'neutral' }[]> {
    try {
      const url = `${this.REDDIT_BASE}/r/wallstreetbets/hot.json`;
      const params = { limit: 50 };

      const response = await this.client.get(url, { params });
      const data: RedditResponse = response.data;

      const symbolCounts = new Map<string, number>();
      const symbolSentiments = new Map<string, { bullish: number; bearish: number }>();

      // Common stock symbols pattern
      const symbolPattern = /\$([A-Z]{1,5})\b/g;

      for (const post of data.data.children) {
        const text = post.data.title + ' ' + post.data.selftext;
        const matches = text.match(symbolPattern);
        
        if (matches) {
          const bullishKeywords = ['moon', 'rocket', 'calls', 'buy', 'bull'];
          const bearishKeywords = ['puts', 'short', 'bear', 'crash', 'dump'];
          
          const isBullish = bullishKeywords.some(keyword => text.toLowerCase().includes(keyword));
          const isBearish = bearishKeywords.some(keyword => text.toLowerCase().includes(keyword));

          matches.forEach(match => {
            const symbol = match.replace('$', '');
            symbolCounts.set(symbol, (symbolCounts.get(symbol) || 0) + 1);
            
            const sentiment = symbolSentiments.get(symbol) || { bullish: 0, bearish: 0 };
            if (isBullish) sentiment.bullish++;
            if (isBearish) sentiment.bearish++;
            symbolSentiments.set(symbol, sentiment);
          });
        }
      }

      return Array.from(symbolCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([symbol, mentions]) => {
          const sentiment = symbolSentiments.get(symbol) || { bullish: 0, bearish: 0 };
          let overallSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
          
          if (sentiment.bullish > sentiment.bearish) {
            overallSentiment = 'bullish';
          } else if (sentiment.bearish > sentiment.bullish) {
            overallSentiment = 'bearish';
          }

          return { symbol, mentions, sentiment: overallSentiment };
        });
    } catch (error) {
      console.error('Error fetching trending symbols:', error);
      return [];
    }
  }
}