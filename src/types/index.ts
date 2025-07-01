export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicator {
  name: string;
  value: number;
  timestamp: Date;
  parameters?: Record<string, any>;
}

export interface FundamentalData {
  symbol: string;
  timestamp: Date;
  pe_ratio?: number;
  eps?: number;
  debt_to_equity?: number;
  roe?: number;
  roa?: number;
  revenue?: number;
  net_income?: number;
}

export interface NewsData {
  id: string;
  symbol: string;
  title: string;
  content: string;
  sentiment: number; // -1 to 1
  timestamp: Date;
  source: string;
}

export interface Signal {
  id: string;
  agent_id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0 to 1
  strength: number; // 0 to 1
  timestamp: Date;
  reasoning: string;
  metadata?: Record<string, any>;
}

export interface Position {
  symbol: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  realized_pnl: number;
  timestamp: Date;
}

export interface Portfolio {
  id: string;
  cash: number;
  positions: Position[];
  total_value: number;
  daily_pnl: number;
  total_pnl: number;
  timestamp: Date;
}

export interface RiskMetrics {
  portfolio_var: number; // Value at Risk
  max_drawdown: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  beta: number;
  alpha: number;
}

export interface Trade {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: Date;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  agent_signals: string[]; // Signal IDs that contributed
  metadata?: Record<string, any>;
}

export interface AgentConfig {
  id: string;
  name: string;
  type: 'TECHNICAL' | 'FUNDAMENTAL' | 'FUSION' | 'RISK' | 'PORTFOLIO' | 'EXECUTION';
  enabled: boolean;
  parameters: Record<string, any>;
  weight: number; // Used in fusion agent
}

export interface BacktestResult {
  id: string;
  start_date: Date;
  end_date: Date;
  initial_capital: number;
  final_capital: number;
  total_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  total_trades: number;
  winning_trades: number;
  win_rate: number;
  trades: Trade[];
}

export interface A2AMessage {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number;
}

export interface A2AResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number;
}

export interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  endpoint: string;
  methods: A2AMethodInfo[];
  metadata?: Record<string, any>;
}

export interface A2AMethodInfo {
  name: string;
  description: string;
  parameters: Record<string, any>;
  returns?: Record<string, any>;
}

export interface A2ATask {
  id: string;
  method: string;
  params: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: any;
  created_at: Date;
  updated_at: Date;
}

export interface Agent2AgentMessage {
  from: string;
  to: string;
  type: 'SIGNAL' | 'DATA' | 'REQUEST' | 'RESPONSE';
  payload: any;
  timestamp: Date;
  id: string;
}

export interface MemoryEntry {
  id: string;
  agentId: string;
  type: MemoryType;
  content: any;
  timestamp: Date;
  importance: number; // 0-1 scale
  tags: string[];
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export enum MemoryType {
  MARKET_CONTEXT = 'market_context',
  ANALYSIS_HISTORY = 'analysis_history',
  PERFORMANCE_FEEDBACK = 'performance_feedback',
  TRADING_PATTERN = 'trading_pattern',
  SIGNAL_CONTEXT = 'signal_context',
  CONVERSATION = 'conversation',
  MARKET_CONDITION = 'market_condition',
  RISK_EVENT = 'risk_event',
  LEARNING = 'learning'
}

export interface MarketContextMemory {
  symbol: string;
  timeframe: string;
  marketCondition: 'bullish' | 'bearish' | 'neutral' | 'volatile';
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  volatility: number;
  volume: 'high' | 'normal' | 'low';
  trend: 'uptrend' | 'downtrend' | 'sideways';
  lastAnalysis: Date;
}

export interface AnalysisHistoryMemory {
  analysisType: string;
  input: any;
  output: Signal[];
  claudeReasoning: string;
  accuracy?: number; // Measured after outcome known
  marketOutcome?: 'correct' | 'incorrect' | 'partial';
  lessons?: string[];
}

export interface PerformanceFeedbackMemory {
  signalId: string;
  predicted: Signal;
  actual: {
    priceMovement: number;
    timeToTarget: number;
    accuracy: number;
  };
  feedback: string;
  adjustments: string[];
}

export interface ConversationMemory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  context: string;
  importance: number;
}

export interface MemorySearchOptions {
  agentId?: string;
  type?: MemoryType;
  tags?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  minImportance?: number;
  includeExpired?: boolean;
}

export interface MemoryRetrievalContext {
  symbol?: string;
  analysisType?: string;
  timeframe?: string;
  marketCondition?: string;
  maxMemories?: number;
  relevanceThreshold?: number;
}

// TradingView API Types
export interface TradingViewConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  rateLimit?: number;
  enableWebSocket?: boolean;
  enableRealtimeData?: boolean;
  enabled?: boolean;
}

export interface TradingViewSymbolInfo {
  symbol: string;
  name: string;
  type: 'stock' | 'forex' | 'crypto' | 'futures' | 'index';
  exchange: string;
  timezone: string;
  minmov: number;
  pricescale: number;
  session: string;
  description: string;
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  supported_resolutions: string[];
  volume_precision?: number;
  data_status: 'streaming' | 'endofday' | 'pulsed' | 'delayed_streaming';
}

export interface TradingViewBar {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TradingViewHistoryRequest {
  symbol: string;
  resolution: '1' | '5' | '15' | '30' | '60' | '240' | '1D' | '1W' | '1M';
  from: number; // Unix timestamp
  to: number;   // Unix timestamp
  countback?: number;
  firstDataRequest?: boolean;
}

export interface TradingViewHistoryResponse {
  s: 'ok' | 'no_data' | 'error';
  t?: number[]; // time array
  o?: number[]; // open array
  h?: number[]; // high array
  l?: number[]; // low array
  c?: number[]; // close array
  v?: number[]; // volume array
  errmsg?: string;
  nextTime?: number;
}

export interface TradingViewQuote {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

export interface TradingViewIndicatorRequest {
  symbol: string;
  resolution: string;
  indicator: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BB' | 'STOCH' | 'VWAP';
  period?: number;
  parameters?: Record<string, any>;
  from: number;
  to: number;
}

export interface TradingViewIndicatorResponse {
  s: 'ok' | 'error';
  t: number[]; // timestamps
  v: number[]; // values
  errmsg?: string;
}

export interface TradingViewScreenerRequest {
  filter: TradingViewScreenerFilter[];
  options?: {
    lang?: string;
    active_symbols_only?: boolean;
  };
  markets?: string[];
  symbols?: {
    query?: {
      types?: string[];
    };
    tickers?: string[];
  };
  sort?: {
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };
  range?: [number, number];
}

export interface TradingViewScreenerFilter {
  left: string;
  operation: 'greater' | 'less' | 'egreater' | 'eless' | 'equal' | 'nequal' | 'in_range' | 'not_in_range' | 'in_day_range' | 'not_in_day_range' | 'above' | 'below' | 'crosses' | 'crosses_above' | 'crosses_below' | 'in_range' | 'not_in_range';
  right: number | string | number[];
}

export interface TradingViewScreenerResponse {
  data: Array<{
    s: string; // symbol
    d: any[]; // data array matching requested columns
  }>;
  totalCount: number;
}

export interface TradingViewWebSocketMessage {
  m: string; // method
  p: any[];  // parameters
}

export interface TradingViewRealtimeUpdate {
  symbol: string;
  price: number;
  volume?: number;
  bid?: number;
  ask?: number;
  timestamp: number;
  change?: number;
  change_percent?: number;
}

export interface TradingViewBacktestConfig {
  strategy: string;
  symbol: string;
  resolution: string;
  from: number;
  to: number;
  parameters: Record<string, any>;
  currency?: string;
  commission?: number;
  slippage?: number;
}

export interface TradingViewBacktestResult {
  strategy: string;
  symbol: string;
  period: {
    from: number;
    to: number;
  };
  performance: {
    totalReturn: number;
    annualizedReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    avgTradeReturn: number;
  };
  trades: Array<{
    entryTime: number;
    exitTime: number;
    side: 'long' | 'short';
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    pnl: number;
    pnlPercent: number;
    runup: number;
    drawdown: number;
  }>;
  equity: Array<{
    time: number;
    value: number;
  }>;
}

export interface TradingViewTechnicalAnalysis {
  symbol: string;
  timeframe: string;
  summary: {
    recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    buy: number;
    sell: number;
    neutral: number;
  };
  oscillators: {
    recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    indicators: Record<string, {
      action: 'BUY' | 'SELL' | 'NEUTRAL';
      value: number;
    }>;
  };
  moving_averages: {
    recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    indicators: Record<string, {
      action: 'BUY' | 'SELL' | 'NEUTRAL';
      value: number;
    }>;
  };
  timestamp: number;
}