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