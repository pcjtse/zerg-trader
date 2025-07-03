import axios, { AxiosInstance } from 'axios';
import { SentimentData } from '../agents/sentiment/SentimentAnalysisAgent';

export interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

export interface NewsArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string;
}

export interface TechCrunchFeedItem {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  author?: string;
  guid: string;
}

export class NewsDataService {
  private client: AxiosInstance;
  private newsAPIKey: string;
  private readonly NEWS_API_BASE = 'https://newsapi.org/v2';
  private readonly TECHCRUNCH_RSS = 'https://techcrunch.com/feed/';
  private readonly DECODER_RSS = 'https://www.theverge.com/rss/index.xml';
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between requests

  constructor() {
    this.newsAPIKey = process.env.NEWS_API_KEY || '';
    
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'ZergTrader-NewsService/1.0.0',
        'Accept': 'application/json, application/rss+xml, text/xml',
      },
    });

    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.delay(this.RATE_LIMIT_DELAY);
      return config;
    });
  }

  public async fetchTechCrunchArticles(symbol: string, startDate: Date, endDate: Date): Promise<SentimentData[]> {
    try {
      // First try RSS feed for latest articles
      const rssArticles = await this.fetchTechCrunchRSS(symbol, startDate, endDate);
      
      // Then try NewsAPI for more comprehensive search
      if (this.newsAPIKey) {
        const newsAPIArticles = await this.fetchFromNewsAPI('techcrunch.com', symbol, startDate, endDate);
        
        // Merge and deduplicate
        const combined = [...rssArticles, ...newsAPIArticles];
        return this.deduplicateArticles(combined);
      }
      
      return rssArticles;
    } catch (error) {
      console.error(`TechCrunch fetch error for ${symbol}:`, error);
      return [];
    }
  }

  public async fetchDecoderArticles(symbol: string, startDate: Date, endDate: Date): Promise<SentimentData[]> {
    try {
      // Fetch from The Verge RSS (Decoder is part of The Verge)
      const articles = await this.fetchVergeRSS(symbol, startDate, endDate);
      
      // Filter for Decoder-specific content or tech-related articles
      return articles.filter(article => 
        this.isDecoderRelated(article.title, article.content) ||
        this.mentionsSymbol(article.title + ' ' + article.content, symbol)
      );
    } catch (error) {
      console.error(`Decoder fetch error for ${symbol}:`, error);
      return [];
    }
  }

  private async fetchTechCrunchRSS(symbol: string, startDate: Date, endDate: Date): Promise<SentimentData[]> {
    try {
      const response = await this.client.get(this.TECHCRUNCH_RSS);
      const feedItems = await this.parseRSSFeed(response.data);
      
      return feedItems
        .filter(item => {
          const pubDate = new Date(item.pubDate);
          return pubDate >= startDate && 
                 pubDate <= endDate && 
                 this.mentionsSymbol(item.title + ' ' + item.content, symbol);
        })
        .map(item => ({
          source: 'techcrunch' as const,
          title: item.title,
          content: this.extractTextContent(item.content),
          url: item.link,
          publishedAt: new Date(item.pubDate),
          author: item.author || 'TechCrunch',
          symbol: symbol
        }));
    } catch (error) {
      console.error('TechCrunch RSS fetch error:', error);
      return [];
    }
  }

  private async fetchVergeRSS(symbol: string, startDate: Date, endDate: Date): Promise<SentimentData[]> {
    try {
      const response = await this.client.get(this.DECODER_RSS);
      const feedItems = await this.parseRSSFeed(response.data);
      
      return feedItems
        .filter(item => {
          const pubDate = new Date(item.pubDate);
          return pubDate >= startDate && 
                 pubDate <= endDate && 
                 (this.mentionsSymbol(item.title + ' ' + item.content, symbol) ||
                  this.isRelevantTechNews(item.title, item.content));
        })
        .map(item => ({
          source: 'decoder' as const,
          title: item.title,
          content: this.extractTextContent(item.content),
          url: item.link,
          publishedAt: new Date(item.pubDate),
          author: item.author || 'The Verge',
          symbol: symbol
        }));
    } catch (error) {
      console.error('Verge RSS fetch error:', error);
      return [];
    }
  }

  private async fetchFromNewsAPI(domain: string, symbol: string, startDate: Date, endDate: Date): Promise<SentimentData[]> {
    if (!this.newsAPIKey) {
      return [];
    }

    try {
      const params = {
        apiKey: this.newsAPIKey,
        domains: domain,
        q: `${symbol} OR ${this.getCompanyName(symbol)}`,
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        sortBy: 'publishedAt',
        pageSize: 100
      };

      const response = await this.client.get(`${this.NEWS_API_BASE}/everything`, { params });
      const data: NewsAPIResponse = response.data;

      if (data.status !== 'ok') {
        throw new Error(`NewsAPI error: ${data.status}`);
      }

      return data.articles.map(article => ({
        source: domain.includes('techcrunch') ? 'techcrunch' as const : 'decoder' as const,
        title: article.title,
        content: article.content || article.description || '',
        url: article.url,
        publishedAt: new Date(article.publishedAt),
        author: article.author || article.source.name,
        symbol: symbol
      }));
    } catch (error) {
      console.error(`NewsAPI fetch error for ${domain}:`, error);
      return [];
    }
  }

  private async parseRSSFeed(xmlData: string): Promise<TechCrunchFeedItem[]> {
    try {
      // Basic XML parsing for RSS feeds
      const items: TechCrunchFeedItem[] = [];
      
      // Extract items using regex (for simplicity, in production use proper XML parser)
      const itemRegex = /<item>(.*?)<\/item>/gs;
      const matches = xmlData.match(itemRegex);
      
      if (!matches) return items;

      for (const match of matches) {
        const title = this.extractXMLTag(match, 'title');
        const link = this.extractXMLTag(match, 'link');
        const pubDate = this.extractXMLTag(match, 'pubDate');
        const content = this.extractXMLTag(match, 'content:encoded') || 
                       this.extractXMLTag(match, 'description') || '';
        const guid = this.extractXMLTag(match, 'guid');
        const author = this.extractXMLTag(match, 'dc:creator') || 
                      this.extractXMLTag(match, 'author');

        if (title && link && pubDate) {
          items.push({
            title: this.decodeHTMLEntities(title),
            link,
            pubDate,
            content: this.decodeHTMLEntities(content),
            author,
            guid: guid || link
          });
        }
      }

      return items;
    } catch (error) {
      console.error('RSS parsing error:', error);
      return [];
    }
  }

  private extractXMLTag(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'is');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  }

  private extractTextContent(html: string): string {
    // Remove HTML tags and extract text content
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private decodeHTMLEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  private mentionsSymbol(text: string, symbol: string): boolean {
    const companyName = this.getCompanyName(symbol);
    const searchText = text.toLowerCase();
    
    return searchText.includes(symbol.toLowerCase()) ||
           searchText.includes(companyName.toLowerCase()) ||
           searchText.includes(`$${symbol.toLowerCase()}`);
  }

  private isDecoderRelated(title: string, content: string): boolean {
    const decoderKeywords = [
      'decoder', 'nilay patel', 'tech regulation', 'platform', 'social media',
      'apple', 'google', 'microsoft', 'meta', 'amazon', 'tesla', 'nvidia'
    ];
    
    const text = (title + ' ' + content).toLowerCase();
    return decoderKeywords.some(keyword => text.includes(keyword));
  }

  private isRelevantTechNews(title: string, content: string): boolean {
    const techKeywords = [
      'earnings', 'revenue', 'stock', 'market', 'investment', 'ipo', 'acquisition',
      'merger', 'partnership', 'launch', 'product', 'innovation', 'ai', 'artificial intelligence'
    ];
    
    const text = (title + ' ' + content).toLowerCase();
    return techKeywords.some(keyword => text.includes(keyword));
  }

  private getCompanyName(symbol: string): string {
    const companyMap: Record<string, string> = {
      'AAPL': 'Apple',
      'MSFT': 'Microsoft',
      'GOOGL': 'Google',
      'GOOG': 'Alphabet',
      'TSLA': 'Tesla',
      'AMZN': 'Amazon',
      'META': 'Meta',
      'NVDA': 'Nvidia',
      'NFLX': 'Netflix',
      'CRM': 'Salesforce',
      'ORCL': 'Oracle',
      'IBM': 'IBM',
      'INTC': 'Intel',
      'AMD': 'AMD',
      'PYPL': 'PayPal',
      'ADBE': 'Adobe',
      'ZM': 'Zoom',
      'SPOT': 'Spotify',
      'TWTR': 'Twitter',
      'SNAP': 'Snapchat',
      'UBER': 'Uber',
      'LYFT': 'Lyft',
      'SQ': 'Square',
      'ROKU': 'Roku'
    };
    
    return companyMap[symbol] || symbol;
  }

  private deduplicateArticles(articles: SentimentData[]): SentimentData[] {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = `${article.title}_${article.url}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}