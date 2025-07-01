# ZergTrader

A next-generation multi-agent trading system powered by **Google's Agent2Agent (A2A) protocol** and **Claude AI**. Features specialized AI agents for technical analysis, fundamental analysis, and decision fusion with advanced interoperability and AI-enhanced decision making.

## 🚀 Features

### 🤖 AI-Enhanced Multi-Agent Architecture
- **Claude AI Integration**: Advanced LLM-powered market analysis and decision support
- **Agent2Agent Protocol**: Full compliance with Google's A2A standard for cross-platform agent communication
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

### 🧠 AI-Powered Analytics
- **Claude-Enhanced Technical Analysis**: AI-powered interpretation of technical indicators
- **Intelligent Pattern Recognition**: Advanced ML-based market pattern detection
- **Smart Signal Fusion**: AI-optimized combination of multiple analysis sources
- **Technical Indicators**: SMA, EMA, RSI, MACD, Bollinger Bands, VWAP, Fibonacci retracements
- **Fundamental Analysis**: AI-enhanced DCF valuation, P/E ratios, debt analysis, profitability metrics
- **Risk Metrics**: VaR, Sharpe ratio, Sortino ratio, maximum drawdown, beta/alpha calculation
- **AI Sentiment Analysis**: Advanced natural language processing for market sentiment

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
│                    🌐 Agent2Agent Network                      │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │ External    │   │ External    │   │ External    │          │
│  │ A2A Agents  │   │ A2A Agents  │   │ A2A Agents  │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
└─────────────────────┬───────────────────────┬───────────────────┘
                      │                       │
              ┌───────▼───────────────────────▼───────┐
              │        🚀 A2A Service Manager        │
              │    (Discovery, Routing, Registry)     │
              └───────┬───────────────────────────────┘
                      │
   ┌──────────────────┼──────────────────┐
   │                  │                  │
┌──▼────────────┐  ┌──▼────────────┐  ┌──▼────────────┐
│ 🧠 Technical   │  │ 📊 Fundamental │  │ 📰 News/      │
│ Analysis +     │  │ Analysis +     │  │ Sentiment +   │
│ Claude AI      │  │ Claude AI      │  │ Claude AI     │
└───────┬────────┘  └───────┬────────┘  └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ 🤖 AI Decision Fusion    │
              │ (Claude + ML Ensemble)   │
              └─────────────┬─────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ 🛡️ Risk Management       │
              │ (AI-Enhanced)            │
              └─────────────┬─────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ 💼 Portfolio Management  │
              │ (AI-Optimized)           │
              └─────────────┬─────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ ⚡ Execution Agent       │
              └───────────────────────────┘
```

### 🔄 Enhanced Data Flow with AI & A2A
1. **Data Collection**: Market data, fundamental data, and news sentiment
2. **A2A Agent Discovery**: Automatic discovery and registration of external agents
3. **AI-Enhanced Analysis**: Each agent processes data using Claude AI for deeper insights
4. **Cross-Agent Communication**: Agents share insights via A2A protocol
5. **Intelligent Signal Fusion**: AI-powered fusion combining multiple sources
6. **Risk Evaluation**: AI-enhanced risk assessment with traditional constraints
7. **Trade Execution**: Portfolio manager executes approved trades
8. **Performance Tracking**: Continuous monitoring with AI performance optimization
9. **External Agent Integration**: Real-time collaboration with external A2A agents

### UI Architecture
- **React-like Components**: Modular UI components with state management
- **Real-time Updates**: WebSocket integration for live data
- **Chart.js Integration**: Professional financial charts and visualizations
- **Responsive Design**: Mobile-first responsive layout
- **API Client**: Comprehensive REST API integration

## 🧪 Testing

ZergTrader includes comprehensive unit tests covering all major components and business logic.

### Test Coverage
- **280+ test cases** covering core functionality and new AI/A2A features
- **Agent System**: BaseAgent, AgentManager with A2A protocol support
- **AI Integration**: ClaudeClient with comprehensive LLM testing
- **A2A Protocol**: A2AService with agent discovery and communication
- **Portfolio Management**: PortfolioManager with trade execution and performance tracking
- **Risk Management**: RiskManager with position sizing and risk alerts
- **Backtesting**: BacktestEngine with historical simulation and parameter sweeps
- **Enhanced Agents**: Technical, Fundamental, and Fusion agents with AI capabilities

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