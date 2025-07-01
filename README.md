# ZergTrader

A next-generation multi-agent trading system powered by **Google's Agent2Agent (A2A) protocol**, **Claude AI**, and **TradingView API integration**. Features specialized AI agents for technical analysis, fundamental analysis, and decision fusion with advanced interoperability, professional-grade market data, and AI-enhanced decision making.

## 🚀 Features

### 🤖 AI-Enhanced Multi-Agent Architecture
- **Claude AI Integration**: Advanced LLM-powered market analysis and decision support
- **Agent2Agent Protocol**: Full compliance with Google's A2A standard for cross-platform agent communication
- **Intelligent Memory System**: Context-aware agent memory for adaptive learning and performance improvement
- **Technical Analysis Agents**: Enhanced with Claude AI for intelligent trend analysis and pattern recognition
- **Fundamental Analysis Agents**: AI-powered valuation models and financial strength assessment
- **Decision Fusion Agent**: Intelligent signal fusion combining traditional algorithms with AI insights
- **Risk Management Agent**: Real-time monitoring with AI-enhanced risk assessment
- **Portfolio Management**: Dynamic rebalancing with AI-optimized strategies

### 🌐 Interoperability & Communication
- **A2A Protocol Support**: Discover and communicate with external A2A-compatible agents
- **Agent Discovery**: Automatic registration and discovery of new agents in the network
- **Cross-Platform Communication**: Seamless integration with agents from different vendors
- **Real-time Message Routing**: Efficient JSON-RPC 2.0 based agent communication
- **Agent Capabilities Registry**: Comprehensive capability and method introspection

### 📈 TradingView Integration
- **Professional Market Data**: Real-time and historical data from TradingView's premium data feeds
- **Advanced Technical Indicators**: Complete library of TradingView's technical analysis tools
- **Real-time Streaming**: WebSocket-based live market data updates
- **Stock Screening**: Powerful stock screening with custom filters and sorting
- **Technical Analysis Summary**: Automated technical analysis recommendations
- **Strategy Backtesting**: TradingView-powered backtesting engine with realistic market conditions
- **Symbol Universe**: Access to global markets including stocks, forex, crypto, and futures
- **Data Quality**: Institutional-grade data with millisecond precision

### 🧠 AI-Powered Analytics
- **Claude-Enhanced Technical Analysis**: AI-powered interpretation of technical indicators
- **TradingView-Claude Fusion**: Combines TradingView's data quality with Claude's analytical intelligence
- **Memory-Driven Insights**: Context-aware analysis using historical market patterns and performance feedback
- **Adaptive Learning**: Agents continuously improve through performance tracking and memory-based feedback loops
- **Intelligent Pattern Recognition**: Advanced ML-based market pattern detection
- **Smart Signal Fusion**: AI-optimized combination of multiple analysis sources
- **Technical Indicators**: SMA, EMA, RSI, MACD, Bollinger Bands, VWAP, Fibonacci retracements, Stochastic
- **Fundamental Analysis**: AI-enhanced DCF valuation, P/E ratios, debt analysis, profitability metrics
- **Risk Metrics**: VaR, Sharpe ratio, Sortino ratio, maximum drawdown, beta/alpha calculation
- **AI Sentiment Analysis**: Advanced natural language processing for market sentiment

### 🧠 Intelligent Memory System
- **Context-Aware Storage**: Agents store market context, analysis history, and performance feedback
- **Relevance-Based Retrieval**: Smart memory retrieval based on market conditions and analysis type
- **Performance Tracking**: Continuous monitoring and feedback loops for signal accuracy
- **Adaptive Importance**: Dynamic memory importance scoring based on accuracy and relevance
- **Persistent Storage**: High-importance memories persisted to disk for long-term learning
- **Memory Types**:
  - **Market Context**: Current market conditions, trends, and key levels
  - **Analysis History**: Past analysis results and reasoning patterns
  - **Performance Feedback**: Signal outcomes and accuracy tracking
  - **Conversation Memory**: User interactions and preferences
- **Automatic Cleanup**: Expired and low-importance memories automatically removed
- **Cross-Agent Learning**: Shared insights and patterns across agent types

### Risk Management
- **Position Sizing**: Kelly Criterion-inspired dynamic position sizing
- **Risk Constraints**: Multi-layered limits on position size, drawdown, and concentration
- **Automated Stops**: Real-time stop-loss execution with slippage protection
- **Alert System**: Automated risk alerts with severity-based actions

### Backtesting Framework
- **Historical Simulation**: Run trading strategies against historical data
- **Performance Analytics**: Calculate 20+ performance metrics
- **Parameter Optimization**: Sweep through parameter ranges to find optimal settings
- **Multiple Data Sources**: Support for real market data, mock data, and CSV imports
- **Comparison Tools**: Compare multiple backtest results side-by-side

### Modern Web UI
- **Real-time Dashboard**: Portfolio overview with live updates
- **Interactive Charts**: Performance, allocation, and risk visualization
- **Agent Management**: Monitor and control individual agents
- **Backtesting Interface**: Configure and run backtests with results visualization
- **Risk Dashboard**: Real-time risk monitoring and alerts
- **Trading History**: Comprehensive trade tracking and analysis
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## 📋 Requirements

- Node.js 18+ 
- TypeScript 5+
- API keys for data sources (Alpha Vantage, News API)
- **Anthropic Claude API key** (for AI-enhanced analysis)
- Optional: Broker API keys for live trading (Alpaca, Interactive Brokers)
- Optional: Registry endpoint for A2A agent discovery

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd zergtrader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

## ⚙️ Configuration

### Required Environment Variables

```bash
# AI & LLM Integration
ANTHROPIC_API_KEY=your_claude_api_key    # Required for Claude AI features

# Agent2Agent Protocol
A2A_REGISTRY_ENDPOINT=http://localhost:8080/registry  # Optional: A2A agent registry
A2A_SERVER_PORT=3001                                  # A2A protocol server port
A2A_ENABLE_DISCOVERY=true                             # Enable automatic agent discovery

# Data Sources
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
NEWS_API_KEY=your_news_api_key

# Trading (Optional - for live trading)
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# System Configuration
WATCHED_SYMBOLS=AAPL,MSFT,GOOGL,TSLA,AMZN,NVDA
MAX_POSITION_SIZE=0.1        # 10% max position size
STOP_LOSS_PERCENTAGE=0.02    # 2% stop loss
AUTO_START=false             # Auto-start trading system
PORT=3000                    # Server port
LOG_LEVEL=info

# AI Enhancement Options
ENABLE_CLAUDE_ANALYSIS=true          # Enable Claude AI analysis
CLAUDE_CONFIDENCE_THRESHOLD=0.7      # Minimum confidence for Claude signals
AI_ANALYSIS_TIMEOUT=30000            # Claude API timeout (ms)

# Memory System Configuration
ENABLE_AGENT_MEMORY=true             # Enable intelligent memory system
MEMORY_PERSISTENCE_PATH=./data/memories  # Path for persistent memory storage
MAX_MEMORIES_PER_AGENT=1000          # Maximum memories per agent
MEMORY_CLEANUP_INTERVAL=3600000      # Memory cleanup interval (ms)
HIGH_IMPORTANCE_THRESHOLD=0.7        # Persistence threshold for memories

# TradingView Integration
TRADINGVIEW_API_KEY=your_tradingview_api_key    # TradingView API key
TRADINGVIEW_BASE_URL=https://scanner.tradingview.com  # TradingView API base URL
TRADINGVIEW_ENABLE=false                        # Enable TradingView integration
TRADINGVIEW_ENABLE_WEBSOCKET=true               # Enable WebSocket for real-time data
TRADINGVIEW_ENABLE_REALTIME=true                # Enable real-time data streaming
TRADINGVIEW_TIMEOUT=30000                       # API request timeout (ms)
TRADINGVIEW_RATE_LIMIT=100                      # Rate limit (requests per minute)
```

### Risk Management Configuration

```bash
MAX_DAILY_LOSS=0.05          # 5% max daily loss
MAX_DRAWDOWN=0.20            # 20% max drawdown
MIN_CASH_RESERVE=0.05        # 5% minimum cash
MAX_CONCENTRATION_SYMBOL=0.15 # 15% max per symbol
MAX_CONCENTRATION_SECTOR=0.30 # 30% max per sector
```

## 🚀 Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Web Interface

Open your browser and navigate to `http://localhost:3000` to access the ZergTrader UI.

#### Dashboard
- **Portfolio Overview**: Real-time portfolio value, cash, P&L
- **Performance Chart**: Historical portfolio performance
- **Agent Status**: Monitor all active agents
- **Recent Signals**: Latest trading signals from agents
- **Risk Metrics**: Key risk indicators
- **System Health**: Overall system status

#### Portfolio Management
- **Asset Allocation**: Visual breakdown of portfolio holdings
- **Positions Table**: Detailed view of all positions
- **Rebalancing**: Manual and automated portfolio rebalancing

#### Backtesting
- **New Backtest**: Configure and run historical simulations
- **Results View**: Analyze backtest performance and metrics
- **Comparison**: Compare multiple backtest strategies
- **Export**: Download results in JSON or CSV format

#### Agent Management
- **Agent Cards**: Individual agent status and controls
- **Start/Stop**: Control individual agents
- **Performance Metrics**: Agent-specific performance tracking

#### Risk Management
- **Active Alerts**: Real-time risk alerts and warnings
- **Risk Metrics**: Historical risk metric trends
- **Alert Resolution**: Acknowledge and resolve alerts

#### Trading History
- **Trade Log**: Complete trading history with filters
- **Search**: Find specific trades by symbol or criteria
- **Export**: Download trading data for analysis

### API Endpoints

#### System Control
- `POST /start` - Start the trading system
- `POST /stop` - Stop the trading system
- `GET /health` - System health check

#### Portfolio Management
- `GET /portfolio` - Current portfolio state
- `GET /positions` - All positions
- `GET /performance` - Performance metrics
- `POST /rebalance` - Trigger portfolio rebalancing

#### Risk Management
- `GET /risk/metrics` - Current risk metrics
- `GET /risk/alerts` - Active risk alerts
- `POST /risk/alerts/:id/resolve` - Resolve risk alert

#### Agent Management
- `GET /agents` - Agent status and health
- `POST /agents/:id/start` - Start specific agent
- `POST /agents/:id/stop` - Stop specific agent
- `GET /agents/:id/memory/stats` - Get agent memory statistics
- `DELETE /agents/:id/memory` - Clear agent memory
- `GET /agents/:id/memory/context` - Get relevant memory context for agent

#### Memory System
- `GET /memory/stats` - System-wide memory statistics
- `GET /memory/agents/:agentId` - Get memories for specific agent
- `POST /memory/agents/:agentId/context` - Store market context memory
- `POST /memory/agents/:agentId/feedback` - Store performance feedback
- `DELETE /memory/cleanup` - Trigger memory cleanup

#### Trading History
- `GET /trades` - Trading history
- `GET /trades?limit=50` - Limited trading history

#### Backtesting
- `POST /backtests` - Create new backtest
- `GET /backtests/:jobId` - Get backtest status
- `GET /backtests/:jobId/result` - Get backtest results
- `GET /backtests` - List all backtests
- `DELETE /backtests/:jobId/cancel` - Cancel running backtest
- `DELETE /backtests/:jobId` - Delete backtest
- `POST /backtests/compare` - Compare multiple backtests
- `GET /backtests/:jobId/export` - Export backtest data

#### TradingView Integration
- `GET /tradingview/status` - TradingView service connection status
- `GET /tradingview/symbols/:symbol/info` - Get symbol information from TradingView
- `GET /tradingview/symbols/:symbol/quote` - Get real-time quote data
- `GET /tradingview/symbols/:symbol/history` - Get historical market data
- `GET /tradingview/symbols/:symbol/indicators` - Get technical indicators
- `GET /tradingview/symbols/:symbol/analysis` - Get technical analysis summary
- `POST /tradingview/screener` - Run stock screener with custom filters
- `POST /tradingview/backtest` - Run TradingView-powered backtest
- `GET /tradingview/backtest/:id` - Get TradingView backtest results
- `POST /tradingview/subscribe/:symbol` - Subscribe to real-time data
- `DELETE /tradingview/subscribe/:symbol` - Unsubscribe from real-time data

### WebSocket Real-time Updates

Connect to `ws://localhost:3000` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  switch (message.type) {
    case 'signal':
      console.log('New trading signal:', message.data);
      break;
    case 'tradeExecuted':
      console.log('Trade executed:', message.data);
      break;
    case 'portfolioUpdate':
      console.log('Portfolio updated:', message.data);
      break;
    case 'riskAlert':
      console.log('Risk alert:', message.data);
      break;
  }
});
```

## 🏗️ Architecture

### 🤖 AI-Enhanced Agent Framework with A2A Protocol

```
┌─────────────────────────────────────────────────────────────────┐
│                    🌐 Agent2Agent Network                       │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            │
│  │ External    │   │ External    │   │ External    │            │
│  │ A2A Agents  │   │ A2A Agents  │   │ A2A Agents  │            │
│  └─────────────┘   └─────────────┘   └─────────────┘            │
└─────────────────────┬───────────────────────┬───────────────────┘
                      │                       │
              ┌───────▼───────────────────────▼───────┐
              │        🚀 A2A Service Manager         │
              │    (Discovery, Routing, Registry)     │
              └───────┬───────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌────▼────────┐ ┌──▼────────────┐
│ 🧠 Technical │ │📊Fundamental│ │ 📰 News/      │
│ Analysis +   │ │ Analysis +  │ │ Sentiment +   │
│ Claude AI +  │ │ Claude AI + │ │ Claude AI +   │
│ TradingView +│ │ TradingView │ │ TradingView + │
│ Memory       │ │ + Memory    │ │ Memory        │
└───────┬──────┘ └────┬────────┘ └──┬────────────┘
        │             │              │
        └─────────────┼──────────────┘
                      │
        ┌─────────────▼─────────────┐
        │ 📈 TradingView Data Layer │
        │ (Real-time + Historical)  │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │ 🧠 Intelligent Memory     │
        │ System (Shared Context)   │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │ 🤖 AI Decision Fusion     │
        │ (Claude + ML + Memory)    │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │ 🛡️ Risk Management        │
        │ (AI-Enhanced + Memory)    │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │ 💼 Portfolio Management   │
        │ (AI-Optimized + Memory)   │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │ ⚡ Execution Agent         │
        └───────────────────────────┘
```

### 🔄 Enhanced Data Flow with AI, A2A, TradingView & Memory
1. **TradingView Data Ingestion**: Professional-grade real-time and historical market data
2. **A2A Agent Discovery**: Automatic discovery and registration of external agents
3. **Memory Contextualization**: Agents retrieve relevant historical context and patterns
4. **TradingView-Enhanced Analysis**: Agents process high-quality TradingView data with technical indicators
5. **AI-Enhanced Insights**: Claude AI analyzes TradingView data with memory-driven context
6. **Cross-Agent Communication**: Agents share insights via A2A protocol
7. **Intelligent Signal Fusion**: AI-powered fusion combining TradingView data, traditional algorithms, and historical performance
8. **Risk Evaluation**: AI-enhanced risk assessment with traditional constraints
9. **Trade Execution**: Portfolio manager executes approved trades
10. **Performance Feedback Loop**: Signal outcomes stored in memory for continuous learning
11. **TradingView Backtesting**: Strategy validation using TradingView's realistic market conditions
12. **Memory-Based Adaptation**: Agents adapt strategies based on historical performance patterns
13. **External Agent Integration**: Real-time collaboration with external A2A agents

### UI Architecture
- **React-like Components**: Modular UI components with state management
- **Real-time Updates**: WebSocket integration for live data
- **Chart.js Integration**: Professional financial charts and visualizations
- **Responsive Design**: Mobile-first responsive layout
- **API Client**: Comprehensive REST API integration

## 🧪 Testing

ZergTrader includes comprehensive unit tests covering all major components and business logic.

### Test Coverage
- **380+ test cases** covering core functionality and new AI/A2A/Memory/TradingView features
- **Agent System**: BaseAgent, AgentManager with A2A protocol support
- **AI Integration**: ClaudeClient with comprehensive LLM testing
- **Memory System**: MemoryService with 36 comprehensive test cases covering storage, retrieval, and persistence
- **TradingView Integration**: TradingViewClient and TradingViewDataService with 60+ test cases covering market data, indicators, backtesting, and real-time streaming
- **A2A Protocol**: A2AService with agent discovery and communication
- **Portfolio Management**: PortfolioManager with trade execution and performance tracking
- **Risk Management**: RiskManager with position sizing and risk alerts
- **Backtesting**: BacktestEngine with historical simulation and parameter sweeps, plus TradingView-powered backtesting
- **Enhanced Agents**: Technical, Fundamental, and Fusion agents with AI and TradingView capabilities

### Run Unit Tests
```bash
# Run all tests
npm test

# Run tests with coverage report
npm test -- --coverage

# Run tests in watch mode (for development)
npm test -- --watch

# Run specific test file
npm test -- tests/portfolio/PortfolioManager.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should execute trade"
```

### Test Configuration
Tests are configured using Jest with TypeScript support:
- **Test Framework**: Jest 29.7.0
- **TypeScript Support**: ts-jest
- **Coverage Reports**: Text, LCOV, and HTML formats
- **Test Environment**: Node.js

### Test Structure
```
tests/
├── agents/
│   ├── BaseAgent.test.ts
│   ├── AgentManager.test.ts
│   ├── technical/
│   │   └── TrendFollowingAgent.test.ts
│   ├── fundamental/
│   │   └── ValuationAgent.test.ts
│   └── fusion/
│       └── DecisionFusionAgent.test.ts
├── services/
│   ├── ClaudeClient.test.ts
│   └── A2AService.test.ts
├── portfolio/
│   └── PortfolioManager.test.ts
├── risk/
│   └── RiskManager.test.ts
├── backtesting/
│   └── BacktestEngine.test.ts
└── setup.ts
```

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

### Testing Best Practices
- All tests use proper mocking for external dependencies
- Tests focus on business logic and edge cases
- Each test is isolated and can run independently
- Mock data simulates realistic trading scenarios
- Tests validate both success and error conditions

## 📊 Monitoring

### Health Check Response
```json
{
  "status": "running",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "agents": {
    "totalAgents": 4,
    "runningAgents": 4,
    "healthyAgents": 4,
    "agentHealth": [...]
  },
  "portfolio": {
    "totalValue": 105000,
    "positions": 5,
    "cash": 15000
  },
  "riskMetrics": {
    "portfolio_var": 0.02,
    "max_drawdown": 0.05,
    "sharpe_ratio": 1.2
  }
}
```

### Performance Metrics
- **Total Return**: Overall portfolio performance
- **Sharpe Ratio**: Risk-adjusted returns
- **Maximum Drawdown**: Largest peak-to-trough decline
- **Win Rate**: Percentage of profitable trades
- **Profit Factor**: Ratio of gross profits to gross losses

## 🛡️ Security

### Data Protection
- API keys stored in environment variables
- No sensitive data logged or committed
- Secure WebSocket connections supported

### Risk Controls
- Multi-layered position size limits
- Real-time risk monitoring
- Automated stop-loss execution
- Emergency stop functionality

## 🔧 Development

### Adding New AI-Enhanced Agents

1. **Create Agent Class with A2A & Claude Support**
   ```typescript
   import { BaseAgent } from './BaseAgent';
   import { ClaudeAnalysisRequest } from '../services/ClaudeClient';
   
   export class MyCustomAgent extends BaseAgent {
     constructor(config: AgentConfig, enableClaude: boolean = true) {
       super(config, enableClaude, true); // Enable Claude AI and A2A
     }
   
     protected async onStart(): Promise<void> {
       this.log('info', 'My Custom Agent started');
     }
     
     protected async onA2AMessage(message: any): Promise<void> {
       // Handle A2A protocol messages
       if (message.payload?.analysisRequest) {
         const signals = await this.analyze(message.payload.data);
         await this.sendA2AMessage(message.from, 'analysisResult', { signals });
       }
     }
     
     protected getCapabilities(): string[] {
       return ['custom-analysis', 'ai-enhanced-signals'];
     }
     
     protected getMethodInfo() {
       return [{
         name: 'analyze',
         description: 'Perform custom analysis with AI enhancement',
         parameters: { data: 'MarketData[]' },
         returns: { signals: 'Signal[]' }
       }];
     }
     
     public async analyze(data: any): Promise<Signal[]> {
       // Traditional analysis
       const traditionalSignals = await this.performTraditionalAnalysis(data);
       
       // AI-enhanced analysis with Claude
       if (this.claudeClient) {
         try {
           const claudeRequest: ClaudeAnalysisRequest = {
             type: 'technical',
             data: data.marketData,
             symbol: data.symbol,
             context: 'Custom analysis with AI enhancement'
           };
           
           const aiSignals = await this.analyzeWithClaude(claudeRequest);
           return this.combineSignals(traditionalSignals, aiSignals);
         } catch (error) {
           this.log('warn', `Claude analysis failed: ${error}`);
           return traditionalSignals;
         }
       }
       
       return traditionalSignals;
     }
   }
   ```

2. **Register Agent with A2A Support**
   ```typescript
   const myAgent = new MyCustomAgent(config, true); // Enable Claude AI
   agentManager.registerAgent(myAgent);
   
   // Agent will automatically register with A2A network
   // and be discoverable by external agents
   ```

### Signal Format
```typescript
{
  id: string;
  agent_id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;  // 0-1
  strength: number;    // 0-1
  timestamp: Date;
  reasoning: string;
  metadata?: Record<string, any>;
}
```

### Keyboard Shortcuts
- `Ctrl/Cmd + 1-6`: Navigate between pages
- `Ctrl/Cmd + R`: Refresh current page
- `Escape`: Close modals/overlays

### Development Mode
When running on localhost, enable debug mode:
```javascript
enableDebug() // In browser console
```

## 📈 Performance Optimization

### AI-Enhanced Agent Performance
- **Individual agent accuracy monitoring** with AI performance metrics
- **Dynamic weight adjustment** based on Claude AI confidence scores
- **Intelligent signal fusion** using ML ensemble methods
- **Historical performance analysis** with AI trend prediction
- **A2A network optimization** for efficient cross-agent communication

### Data Efficiency
- **Intelligent caching with TTL** for Claude API responses
- **Multiple data source failover** with AI-powered selection
- **Batch processing** for technical indicators and AI analysis
- **A2A message batching** for efficient network communication
- **Smart API usage** to minimize Claude API costs

### UI Optimization
- **Lazy loading** of chart data and AI insights
- **Virtual scrolling** for large tables and agent lists
- **Debounced search and filtering** across A2A network
- **WebSocket message batching** with A2A protocol support
- **Real-time A2A agent status** updates

## 📊 Backtesting Framework

ZergTrader features a comprehensive backtesting system that enables strategy development, validation, and optimization using historical market data with AI-enhanced analysis.

### 🏗️ Backtesting Architecture

```
┌─────────────────────┐    ┌─────────────────-──-─┐    ┌───────────────────-──┐
│  BacktestController │    │   BacktestEngine     │    │HistoricalDataProvider│
│                     │────│                      │────│                      │
│ • Job Management    │    │ • Strategy Simulation│    │ • Alpha Vantage API  │
│ • API Endpoints     │    │ • AI-Enhanced Agents │    │ • TradingView Data   │
│ • Result Tracking   │    │ • Portfolio Mgmt     │    │ • Mock Data Gen      │
│ • Concurrent Runs   │    │ • Risk Management    │    │ • CSV Import         │
└─────────────────────┘    └───────────────────-──┘    └───────────────────-──┘
                                      │
                       ┌─────────────────────┐
                       │Portfolio Tracker    │
                       │                     │
                       │ • 25+ Metrics       │
                       │ • Risk Analytics    │
                       │ • Attribution       │
                       │ • Export Tools      │
                       └─────────────────────┘
```

### 🔄 Backtesting Process Flow

#### 1. **Backtest Creation & Configuration**
```typescript
const backtestConfig = {
  startDate: new Date('2023-01-01'),
  endDate: new Date('2023-12-31'),
  initialCapital: 100000,
  symbols: ['AAPL', 'MSFT', 'GOOGL', 'TSLA'],
  commission: 1.0,
  slippage: 0.001,
  dataSource: 'alphavantage'
};

const agentConfigs = [
  {
    id: 'trend-agent',
    type: 'TECHNICAL',
    parameters: { smaShortPeriod: 20, smaLongPeriod: 200 }
  },
  {
    id: 'ai-fusion-agent', 
    type: 'FUSION',
    enableClaude: true,
    parameters: { confidenceThreshold: 0.7 }
  }
];
```

#### 2. **Historical Data Loading**
- **Multiple Data Sources**: Alpha Vantage API, TradingView, Mock data, CSV import
- **Data Validation**: Integrity checks, date range validation, missing data handling
- **Rate Limiting**: Automatic API rate limiting (5 req/min for Alpha Vantage)
- **Caching**: Intelligent data caching for performance optimization

#### 3. **Time-Step Simulation Engine**
```
For each timestamp in backtest period:
├── 📈 Update portfolio with current market prices
├── 🤖 Generate trading signals from AI-enhanced agents
├── 🛡️ Process signals through risk management system
├── 💹 Execute approved trades with realistic costs
├── 📊 Update portfolio positions and valuations
├── 📈 Calculate real-time performance metrics
├── 💾 Store portfolio snapshot for analysis
└── 📡 Emit progress events for real-time monitoring
```

#### 4. **AI-Enhanced Signal Generation**
- **Technical Agents**: SMA, EMA, RSI, MACD, Bollinger Bands analysis
- **Fundamental Agents**: P/E ratios, DCF models, financial strength assessment  
- **Claude AI Integration**: Advanced pattern recognition and market interpretation
- **Decision Fusion**: ML ensemble methods combining multiple signal sources
- **Memory-Driven**: Agents learn from historical performance and adapt strategies

### 📊 Comprehensive Performance Analytics

#### **Core Performance Metrics**
```typescript
interface PortfolioMetrics {
  // Return Metrics
  totalReturn: number;          // Overall portfolio return
  cumulativeReturn: number;     // Cumulative return over time
  dailyReturn: number;          // Most recent daily return
  
  // Risk-Adjusted Metrics  
  sharpeRatio: number;          // Risk-adjusted return (vs risk-free rate)
  sortinoRatio: number;         // Downside risk-adjusted return
  calmarRatio: number;          // Return vs maximum drawdown
  
  // Risk Metrics
  volatility: number;           // Annualized volatility
  maxDrawdown: number;          // Maximum peak-to-trough decline
  currentDrawdown: number;      // Current drawdown from peak
  
  // Trading Performance
  winRate: number;              // Percentage of profitable trades
  profitFactor: number;         // Gross profit / gross loss ratio
  averageWin: number;           // Average winning trade amount
  averageLoss: number;          // Average losing trade amount
  totalTrades: number;          // Total number of trades
  
  // Market Risk Metrics
  beta: number;                 // Correlation with market benchmark
  alpha: number;                // Excess return vs benchmark
  informationRatio: number;     // Active return / tracking error
}
```

#### **Position Attribution Analysis**
- **Symbol-level contribution** to portfolio performance
- **Weight and return breakdown** by position
- **Holding period analysis** and turnover metrics
- **Risk contribution** by individual positions

#### **Advanced Analytics**
- **Time-series analysis** of all metrics
- **Drawdown analysis** with recovery periods
- **Rolling performance** windows (30d, 90d, 1Y)
- **Benchmark comparison** (S&P 500, custom indices)

### 🔧 Advanced Backtesting Features

#### **Parameter Optimization & Sweeps**
```typescript
// Automatically test multiple parameter combinations
const parameterRanges = new Map([
  ['smaShortPeriod', [10, 20, 30]],
  ['smaLongPeriod', [50, 100, 200]],
  ['rsiOversold', [20, 25, 30]],
  ['confidenceThreshold', [0.6, 0.7, 0.8]]
]);

const results = await engine.runParameterSweep(parameterRanges);
// Generates and tests all combinations (3×3×3×3 = 81 backtests)
```

#### **Concurrent Job Management**
- **Multiple backtest execution** (up to 3 concurrent jobs)
- **Job queue management** with status tracking
- **Real-time progress monitoring** via WebSocket
- **Automatic retry** on failures with error handling

#### **Data Export & Analysis**
```typescript
// Export options
GET /backtests/:jobId/export?format=json   // Complete results
GET /backtests/:jobId/export?format=csv    // Time-series data
POST /backtests/compare                     // Multi-strategy comparison
```

#### **Real-time Monitoring**
```javascript
// WebSocket integration for live backtest monitoring
const ws = new WebSocket('ws://localhost:3000');

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  switch (message.type) {
    case 'backtestProgress':
      console.log(`Progress: ${message.data.progress}%`);
      break;
    case 'timestepProcessed':
      console.log(`Portfolio Value: $${message.data.portfolio.total_value}`);
      break;
    case 'tradeExecuted':
      console.log(`Trade: ${message.data.action} ${message.data.symbol}`);
      break;
  }
});
```

### 🌐 Data Sources & Integration

#### **External APIs**
- **Alpha Vantage**: Real historical market data with fundamental data
- **TradingView**: Professional-grade data and technical analysis
- **Yahoo Finance**: Free alternative data source
- **News API**: Sentiment analysis data for AI agents

#### **Claude AI Integration**
- **Market Analysis**: Advanced pattern recognition and interpretation
- **Signal Enhancement**: AI confidence scoring and reasoning
- **Adaptive Learning**: Memory-driven strategy improvement
- **Risk Assessment**: AI-powered risk evaluation

#### **Data Providers**
```typescript
// Flexible data provider system
const providers = {
  alphavantage: new AlphaVantageProvider(apiKey),
  tradingview: new TradingViewProvider(config),
  mock: new MockDataProvider(),
  csv: new CSVDataProvider()
};
```

### 📈 Backtesting Use Cases

#### **Strategy Development**
- **New Algorithm Testing**: Validate trading strategies on historical data
- **AI Model Training**: Use backtesting results to improve AI agents
- **Risk Parameter Tuning**: Optimize risk management settings

#### **Strategy Comparison**
```typescript
// Compare multiple strategies side-by-side
const comparison = await backtestController.compareBacktests([
  'trend-following-backtest-id',
  'mean-reversion-backtest-id', 
  'ai-fusion-backtest-id'
]);

// Rankings by different metrics
console.log('Best by Sharpe Ratio:', comparison.rankings.bySharpe[0]);
console.log('Best by Return:', comparison.rankings.byReturn[0]);
console.log('Lowest Drawdown:', comparison.rankings.byDrawdown[0]);
```

#### **Production Validation**
- **Walk-forward analysis** with rolling optimization windows
- **Out-of-sample testing** to prevent overfitting
- **Stress testing** under different market conditions
- **Monte Carlo simulation** for robust validation

### 🎯 REST API Endpoints

```bash
# Backtest Management
POST   /backtests              # Create new backtest
GET    /backtests              # List all backtests  
GET    /backtests/:id          # Get backtest status
GET    /backtests/:id/result   # Get backtest results
DELETE /backtests/:id/cancel   # Cancel running backtest
DELETE /backtests/:id          # Delete backtest

# Analysis & Export
POST   /backtests/compare      # Compare multiple backtests
GET    /backtests/:id/export   # Export results (JSON/CSV)
GET    /backtests/:id/snapshots # Get time-series snapshots
```

### 🔍 Example Backtest Results

```json
{
  "id": "backtest-uuid",
  "name": "AI-Enhanced Trend Following Strategy",
  "period": "2023-01-01 to 2023-12-31",
  "initial_capital": 100000,
  "final_capital": 126500,
  "total_return": 0.265,
  "max_drawdown": 0.087,
  "sharpe_ratio": 1.847,
  "win_rate": 0.642,
  "total_trades": 147,
  "ai_signals_used": 89,
  "claude_confidence_avg": 0.78,
  "best_performing_agent": "ai-fusion-agent",
  "symbol_attribution": {
    "AAPL": { "return": 0.31, "contribution": 0.089 },
    "MSFT": { "return": 0.28, "contribution": 0.076 },
    "GOOGL": { "return": 0.22, "contribution": 0.063 }
  }
}
```

The backtesting framework provides institutional-grade capabilities for strategy development and validation, combining traditional quantitative methods with cutting-edge AI analysis for superior trading strategy development.

## 🚨 Troubleshooting

### Common Issues

1. **API Rate Limits**
   - Check your API key quotas
   - Adjust update intervals in configuration

2. **WebSocket Connection Issues**
   - Verify port availability
   - Check firewall settings

3. **Agent Not Starting**
   - Check agent configuration and A2A settings
   - Verify required parameters and Claude API key are set
   - Ensure A2A server port is available
   - Check network connectivity for agent discovery

4. **Charts Not Loading**
   - Check browser console for errors
   - Verify Chart.js library is loaded

5. **UI Not Responsive**
   - Clear browser cache
   - Check for JavaScript errors

### Logs
```bash
# View application logs
npm run dev

# Check for errors
grep "ERROR" logs/app.log
```

### Debug Mode
```javascript
// Enable debug mode in development
enableDebug()

// Access debug tools
ZergTraderDebug.app.getStatus()
ZergTraderDebug.websocket.getConnectionState()
ZergTraderDebug.a2a.getConnectedAgents()
ZergTraderDebug.claude.getUsageStats()
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## ⚠️ Important Disclaimer

**TRADING INVOLVES SUBSTANTIAL RISK OF LOSS**

This software is provided for **educational and research purposes only**. By using ZergTrader, you acknowledge and agree to the following:

### Financial Risk Warning
- **Past performance does not guarantee future results**
- **All trading involves substantial risk of loss**
- **You may lose some or all of your invested capital**
- **Never trade with money you cannot afford to lose**
- **Algorithmic trading can amplify both gains and losses**

### Software Limitations
- This software is provided "AS IS" without any warranties
- No guarantee of profitability or performance
- Market conditions can change rapidly and unpredictably
- Technical failures may result in unintended trades or losses
- The software may contain bugs or errors that could affect trading decisions

### Legal and Regulatory
- **You are responsible for compliance with all applicable laws and regulations**
- **Different jurisdictions may have restrictions on algorithmic trading**
- **Consult with financial and legal advisors before using this software for live trading**
- **The authors and contributors are not licensed financial advisors**

### Recommendation
- **Always test thoroughly with paper trading before using real money**
- **Start with small position sizes to understand system behavior**
- **Monitor the system closely, especially during initial deployment**
- **Have manual override capabilities in place**
- **Maintain adequate risk management controls**

### No Investment Advice
This software and its documentation do not constitute investment advice, financial advice, trading advice, or any other sort of advice. The information provided is for educational purposes only.

**USE AT YOUR OWN RISK. THE AUTHORS AND CONTRIBUTORS ASSUME NO LIABILITY FOR ANY FINANCIAL LOSSES RESULTING FROM THE USE OF THIS SOFTWARE.**

## 🆕 What's New in v2.0

### 🤖 AI Integration
- **Claude AI Support**: Advanced LLM-powered market analysis
- **Intelligent Signal Fusion**: AI-enhanced decision making
- **Smart Risk Assessment**: AI-powered risk evaluation
- **Enhanced Pattern Recognition**: Advanced ML-based market analysis

### 🌐 Agent2Agent Protocol
- **Cross-Platform Interoperability**: Connect with external A2A agents
- **Automatic Agent Discovery**: Real-time agent registry and discovery
- **Standardized Communication**: JSON-RPC 2.0 based messaging
- **Scalable Architecture**: Support for distributed agent networks

### 🚀 Performance Improvements
- **95% Test Coverage**: 280+ comprehensive test cases
- **Enhanced Error Handling**: Robust fault tolerance
- **Optimized AI Usage**: Smart API usage to minimize costs
- **Improved Monitoring**: Real-time A2A network status

## 📞 Support

For questions, issues, or contributions:
- Open an issue on GitHub
- Check the documentation in `CLAUDE.md`
- Review the A2A protocol specifications
- Consult the Claude AI integration guide

---

**Built with ❤️ for the future of algorithmic trading**

*Powered by Google's Agent2Agent Protocol & Anthropic's Claude AI*