# ZergTrader

An AI-powered multi-agent trading system that combines traditional technical analysis with modern AI intelligence for smarter trading decisions.

## 🚀 Key Features

- **🤖 AI-Enhanced Analysis**: Claude AI integration for intelligent market pattern recognition
- **📊 Advanced Technical Analysis**: 9+ indicators including Stochastic, ADX, Williams %R, CCI
- **🛡️ Smart Risk Management**: Volatility-based position sizing and risk-adjusted signals
- **📈 Professional Data**: TradingView API integration for institutional-grade market data
- **🌐 Agent Communication**: Google Agent2Agent protocol for cross-platform agent interoperability
- **🧠 Intelligent Memory**: Context-aware learning and performance tracking
- **⚡ Real-time Trading**: Live market data and WebSocket updates
- **🧪 Advanced Backtesting**: Historical strategy validation with 25+ performance metrics

## 🛠️ Quick Start

### Installation
```bash
git clone <repository-url>
cd zergtrader
npm install
npm run build
```

### Configuration
```bash
cp .env.example .env
# Edit .env with your API keys
```

Required API keys:
- `ANTHROPIC_API_KEY` - For AI analysis (optional but recommended)
- `ALPHA_VANTAGE_API_KEY` - For market data
- `NEWS_API_KEY` - For news sentiment analysis (optional)
- `TRADINGVIEW_API_KEY` - For professional data (optional)

### Start Trading
```bash
# Development mode
npm run dev

# Production mode  
npm start
```

Open `http://localhost:3000` for the web interface.

## 📊 Trading Agents

### Technical Analysis Agent
- **9 Advanced Indicators**: SMA, EMA, RSI, MACD, Stochastic, ADX, Williams %R, CCI, ATR
- **AI-Enhanced Signals**: Claude AI pattern recognition and market interpretation
- **Risk-Adjusted Confidence**: Volatility-based signal strength adjustment
- **Smart Position Sizing**: ATR-based position sizing recommendations

### Mean Reversion Agent  
- **Counter-Trend Analysis**: RSI, Bollinger Bands, statistical arbitrage
- **Volume Confirmation**: High-volume reversal pattern detection
- **Trend Strength Assessment**: Multi-timeframe risk evaluation

### Sentiment Analysis Agent 🆕
- **Multi-Source Data**: TechCrunch, The Verge Decoder, Reddit (WallStreetBets, investing, stocks)
- **AI-Enhanced Analysis**: Claude AI sentiment interpretation with keyword extraction
- **Real-time Monitoring**: Automatic sentiment tracking every 2 hours
- **Social Media Intelligence**: Reddit post scoring, comment analysis, trending symbols
- **News Aggregation**: RSS feeds + NewsAPI integration for comprehensive coverage

### Decision Fusion Agent
- **Signal Aggregation**: Weighted fusion of multiple agent signals
- **Performance-Based Weighting**: Dynamic agent weight adjustment
- **Ensemble Methods**: ML-style signal combination

## 🎯 API Usage

### Portfolio Status
```bash
curl http://localhost:3000/portfolio
```

### Agent Control
```bash
# Start specific agent
curl -X POST http://localhost:3000/agents/trend-agent/start

# Get agent memory stats
curl http://localhost:3000/agents/trend-agent/memory/stats
```

### Risk Monitoring
```bash
curl http://localhost:3000/risk/metrics
```

### Sentiment Analysis
```bash
# Get sentiment for specific symbols
curl http://localhost:3000/sentiment/analyze \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL", "TSLA"], "days": 7}'

# Get trending symbols from Reddit
curl http://localhost:3000/sentiment/trending

# Get sentiment breakdown by source
curl http://localhost:3000/sentiment/AAPL/sources
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific component
npm test -- --testPathPattern=TrendFollowingAgent

# Coverage report
npm test -- --coverage
```

**Test Coverage**: 380+ test cases covering all major components.

## 📈 Backtesting

### Create Backtest
```bash
curl -X POST http://localhost:3000/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2023-01-01",
    "endDate": "2023-12-31", 
    "initialCapital": 100000,
    "symbols": ["AAPL", "MSFT", "GOOGL"]
  }'
```

### Features
- **Historical Simulation**: Test strategies on real market data
- **25+ Metrics**: Sharpe ratio, max drawdown, win rate, profit factor
- **Parameter Optimization**: Automated parameter sweeps
- **Real-time Monitoring**: Live backtest progress via WebSocket

## 🔧 Configuration

### Agent Parameters
```javascript
// Technical Analysis Agent
{
  "symbols": ["AAPL", "MSFT"],
  "sma_short": 20,
  "sma_long": 50,
  "rsi_oversold": 30,
  "rsi_overbought": 70,
  "stoch_oversold": 20,
  "adx_strong": 25
}

// Sentiment Analysis Agent
{
  "symbols": ["AAPL", "TSLA", "MSFT"],
  "sentimentThreshold": 0.3,
  "updateInterval": 7200000,  // 2 hours
  "sources": ["techcrunch", "decoder", "reddit"],
  "subreddits": ["wallstreetbets", "investing", "stocks"]
}
```

### Risk Management
```bash
MAX_POSITION_SIZE=0.1        # 10% max position
STOP_LOSS_PERCENTAGE=0.02    # 2% stop loss
MAX_DAILY_LOSS=0.05         # 5% max daily loss
```

## 🧠 AI Features

### Claude AI Integration
- **Market Analysis**: Advanced pattern recognition
- **Signal Enhancement**: AI confidence scoring
- **Risk Assessment**: Intelligent risk evaluation
- **Memory-Driven Context**: Historical performance integration

### Agent Memory System
- **Context Storage**: Market conditions and analysis history
- **Performance Tracking**: Signal accuracy monitoring
- **Adaptive Learning**: Strategy improvement over time

## 🌐 Google Agent2Agent (A2A) Protocol Integration

ZergTrader integrates with Google's official Agent2Agent protocol for seamless cross-platform agent communication and collaboration. Using the `@a2a-js/sdk`, ZergTrader can communicate with any A2A-compliant agent system.

### 🤖 A2A Agent Architecture

Each ZergTrader agent automatically exposes A2A capabilities:

```javascript
// Agent Card Example
{
  "name": "ZergTrader-TechnicalAnalysis-Agent",
  "description": "TECHNICAL analysis agent for financial markets",
  "version": "1.0.0",
  "capabilities": [
    "trend-analysis", "sma-analysis", "ema-analysis", "macd-analysis",
    "stochastic-analysis", "adx-analysis", "williams-r-analysis", 
    "cci-analysis", "risk-adjusted-signals", "position-sizing"
  ],
  "endpoint": "http://localhost:3001",
  "methods": [
    {
      "name": "analyze",
      "description": "Perform comprehensive trend following analysis with advanced indicators",
      "parameters": {
        "symbol": "string",
        "marketData": "MarketData[]", 
        "indicators": "TechnicalIndicator[]"
      },
      "returns": { "signals": "Signal[]" }
    }
  ]
}
```

### 🔧 A2A Configuration

```bash
# Environment Variables
A2A_ENABLE_DISCOVERY=true                    # Enable agent discovery
A2A_REGISTRY_ENDPOINT=http://localhost:8080  # External agent registry URL
A2A_SERVER_PORT=3001                         # A2A server port
A2A_ENABLE_SERVER=true                       # Enable A2A server
A2A_ENABLE_CLIENT=true                       # Enable A2A client
```

**✨ Key Features with Google A2A SDK:**
- **Standard Compliance**: Uses official Google Agent2Agent protocol
- **Cross-Platform**: Compatible with any A2A-compliant agent system
- **Message Streaming**: Support for real-time message streaming
- **Task Management**: Built-in task lifecycle tracking
- **Agent Discovery**: Automatic agent registration and discovery
- **JSON-RPC 2.0**: Full specification compliance
- **Production Ready**: Enterprise-grade reliability and performance

### 📡 A2A Communication Methods

#### **Market Analysis Requests**
```javascript
// Request analysis from external agent
const request = {
  "jsonrpc": "2.0",
  "method": "analyzeMarketData",
  "params": {
    "symbol": "AAPL",
    "marketData": [...],
    "analysisType": "technical"
  },
  "id": "req-123"
}

// Response from ZergTrader agent
{
  "jsonrpc": "2.0", 
  "result": {
    "signals": [
      {
        "action": "BUY",
        "confidence": 0.75,
        "reasoning": "Golden cross pattern with high ADX confirmation",
        "metadata": { "indicators": ["SMA", "ADX"], "riskAdjusted": true }
      }
    ],
    "agent": "trend-following-agent"
  },
  "id": "req-123"
}
```

#### **Agent Discovery**
```javascript
// Discover available agents
const discoveryRequest = {
  "jsonrpc": "2.0",
  "method": "discoverAgents", 
  "params": {
    "capabilities": ["technical-analysis", "risk-management"]
  },
  "id": "discovery-1"
}

// Response with matching agents
{
  "jsonrpc": "2.0",
  "result": {
    "agents": [
      {
        "name": "ZergTrader-TechnicalAnalysis",
        "endpoint": "http://localhost:3001",
        "capabilities": ["trend-analysis", "stochastic-analysis"],
        "status": "online"
      }
    ]
  },
  "id": "discovery-1"
}
```

#### **Signal Broadcasting**
```javascript
// ZergTrader broadcasts signals to A2A network
const signalBroadcast = {
  "jsonrpc": "2.0",
  "method": "signalGenerated",
  "params": {
    "signal": {
      "symbol": "AAPL",
      "action": "BUY", 
      "confidence": 0.82,
      "agent": "ai-fusion-agent",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

### 🔍 A2A Method Registry

ZergTrader agents expose these A2A methods:

| Method | Description | Parameters |
|--------|-------------|------------|
| `analyze` | Perform market analysis | `symbol`, `marketData`, `indicators` |
| `getCapabilities` | List agent capabilities | none |
| `getPerformanceMetrics` | Get agent performance stats | `timeRange` |
| `updateConfiguration` | Update agent parameters | `parameters` |
| `getMemoryContext` | Retrieve relevant memories | `symbol`, `analysisType` |
| `recordSignalOutcome` | Record signal performance | `signalId`, `outcome` |

### 🌐 Multi-Agent Collaboration

#### **Cross-Agent Signal Fusion**
```javascript
// ZergTrader requests analysis from multiple A2A agents
const collaborationRequest = {
  "participants": [
    "external-sentiment-agent",
    "external-fundamental-agent", 
    "zergtrader-technical-agent"
  ],
  "task": {
    "type": "consensus-analysis",
    "symbol": "AAPL",
    "data": marketData
  }
}

// Fusion result combines all agent signals
{
  "consensus": {
    "action": "BUY",
    "confidence": 0.78,
    "participantCount": 3,
    "agreement": 0.89
  },
  "participants": [
    { "agent": "sentiment", "signal": "BUY", "confidence": 0.85 },
    { "agent": "fundamental", "signal": "BUY", "confidence": 0.72 },
    { "agent": "technical", "signal": "BUY", "confidence": 0.78 }
  ]
}
```

#### **Real-time Data Sharing**
```javascript
// External agents can subscribe to ZergTrader's market data
const subscriptionRequest = {
  "jsonrpc": "2.0",
  "method": "subscribeToMarketData",
  "params": {
    "symbols": ["AAPL", "MSFT"],
    "dataTypes": ["price", "volume", "technical-indicators"],
    "frequency": "1min"
  }
}
```

### 🔒 A2A Security & Authentication

```bash
# Optional authentication for A2A network
A2A_AUTH_ENABLED=true
A2A_API_KEY=your-network-key
A2A_TRUSTED_AGENTS=agent1.example.com,agent2.example.com
```

### 📊 A2A Performance Monitoring

Monitor A2A network performance:

```bash
# Get A2A network status
curl http://localhost:3000/a2a/status

# Response
{
  "status": "connected",
  "connectedAgents": 5,
  "messagesSent": 1247,
  "messagesReceived": 892,
  "networkLatency": 23,
  "lastDiscovery": "2024-01-01T12:00:00Z"
}
```

### 🚀 A2A Integration Examples

#### **External Agent Integration**
```typescript
// External agent connecting to ZergTrader using Google A2A SDK
import { A2AClient } from '@a2a-js/sdk';

const client = new A2AClient('http://zergtrader-host:3001');

// Request technical analysis
const result = await client.sendMessage({
  message: {
    content: {
      symbol: 'AAPL',
      marketData: latestData,
      indicators: ['SMA', 'RSI', 'MACD']
    },
    type: 'text'
  },
  configuration: {
    blocking: true
  }
});

console.log('ZergTrader Analysis:', result);

// Streaming analysis
const messageStream = client.sendMessageStream({
  message: {
    content: { symbol: 'AAPL', marketData: latestData },
    type: 'text'
  },
  configuration: {
    blocking: false
  }
});

for await (const response of messageStream) {
  console.log('Streaming response:', response);
}
```

#### **ZergTrader as A2A Client**
```typescript
// ZergTrader requesting external sentiment analysis using Google A2A SDK
const sentimentAgent = await a2aService.discoverAgent('http://sentiment-agent:3002');
const sentimentSignal = await a2aService.sendMessage(
  sentimentAgent.endpoint,
  'analyzeSentiment', 
  { symbol: 'AAPL', newsData: recentNews }
);

// Google A2A SDK handles:
// - Standard Agent2Agent protocol compliance
// - JSON-RPC 2.0 formatting
// - HTTP transport and error handling
// - Response parsing and validation
// - Cross-platform compatibility
```

### 🎯 A2A Use Cases

1. **Multi-Platform Trading Networks**: Connect ZergTrader with external institutional agents
2. **Sentiment Analysis Integration**: Combine technical analysis with external news sentiment
3. **Alternative Data Sources**: Access proprietary indicators from specialized agents  
4. **Risk Management Collaboration**: Share risk assessments across trading platforms
5. **Strategy Validation**: Cross-validate signals with external quantitative agents
6. **Distributed Backtesting**: Coordinate large-scale backtesting across multiple systems

The Google Agent2Agent protocol transforms ZergTrader from a standalone system into a node in a collaborative trading intelligence network, enabling seamless integration with any A2A-compliant agent system.

## 🔄 Recent Major Updates

### 🚀 Google Agent2Agent Protocol Integration (Latest)

**ZergTrader now uses the official Google Agent2Agent SDK!** We've integrated with Google's standard A2A protocol for maximum compatibility and interoperability.

#### ✅ **What's New:**
- **Official Google A2A SDK**: Now using `@a2a-js/sdk` for standard compliance
- **Cross-Platform Compatibility**: Works with any A2A-compliant agent system
- **Standard Protocol**: Full compliance with Google's Agent2Agent specification
- **Enterprise Integration**: Connect with institutional trading systems and external agents
- **Streaming Support**: Real-time message streaming capabilities
- **Production Ready**: Enterprise-grade reliability with Google's SDK

#### 🔧 **Technical Improvements:**
- **A2A Client Integration**: Full Google A2A client functionality
- **Message Streaming**: Support for real-time streaming communications
- **Task Management**: Compatible with A2A task lifecycle management
- **Agent Discovery**: Standard A2A agent discovery and registration
- **JSON-RPC 2.0**: Full specification compliance via Google SDK
- **Error Handling**: Robust error handling through Google's implementation

#### 📈 **Benefits:**
- **Standard Compliance**: Follows official Google Agent2Agent specification
- **Ecosystem Integration**: Compatible with growing A2A agent ecosystem
- **Future Proof**: Maintained by Google with ongoing updates and support
- **Reliability**: Enterprise-grade reliability and performance
- **Interoperability**: Seamless communication with external A2A agents
- **Documentation**: Comprehensive documentation and community support

#### 🔀 **Migration Notes:**
- **Backward Compatible**: Existing agent code works without changes
- **Same API**: All A2A methods and interfaces remain the same
- **Enhanced Features**: Additional capabilities through Google's SDK
- **Standard Protocol**: Now fully compliant with official A2A specification
- **Testing**: All 428+ tests pass with Google A2A SDK integration

This update positions ZergTrader as a fully compliant participant in the Google Agent2Agent ecosystem, enabling integration with any A2A-compatible agent system.

## 📊 Performance Metrics

### Key Metrics
- **Total Return**: Overall portfolio performance
- **Sharpe Ratio**: Risk-adjusted returns
- **Maximum Drawdown**: Largest decline from peak
- **Win Rate**: Percentage of profitable trades
- **Profit Factor**: Gross profit / gross loss ratio

### Real-time Monitoring
```javascript
// WebSocket connection
const ws = new WebSocket('ws://localhost:3000');

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Signal:', message.type, message.data);
});
```

## 🛡️ Security & Risk

### Risk Controls
- **Position Limits**: Multiple layer position size controls
- **Real-time Monitoring**: Continuous risk assessment
- **Automated Stops**: Emergency stop functionality
- **API Security**: Environment variable protection

### ⚠️ CRITICAL DISCLAIMER - READ BEFORE USE ⚠️

**THIS SOFTWARE IS PROVIDED FOR EDUCATIONAL AND RESEARCH PURPOSES ONLY. THE AUTHOR DISCLAIMS ALL LIABILITY AND RESPONSIBILITY FOR ANY FINANCIAL LOSSES, DAMAGES, OR CONSEQUENCES ARISING FROM THE USE OF THIS SOFTWARE.**

🚨 **FINANCIAL RISK WARNING** 🚨
- **YOU CAN LOSE ALL YOUR MONEY** - Trading and investing involve substantial risk of financial loss
- **NO GUARANTEES** - Past performance does not guarantee future results
- **EXPERIMENTAL SOFTWARE** - This is beta software that may contain bugs, errors, or unexpected behavior
- **NOT FINANCIAL ADVICE** - Nothing in this software constitutes investment advice or recommendations

## 🔧 Development

### Adding Custom Agents
```typescript
export class MyAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config, true, true); // Enable Claude AI and A2A
  }
  
  public async analyze(data: MarketData[]): Promise<Signal[]> {
    // Your analysis logic
    const signals = await this.performAnalysis(data);
    
    // Optional AI enhancement
    if (this.claudeClient) {
      return await this.enhanceWithAI(signals, data);
    }
    
    return signals;
  }
}
```

### Project Structure
```
src/
├── agents/           # Trading agents
├── services/         # External services (Claude, A2A, TradingView)
├── portfolio/        # Portfolio management
├── risk/            # Risk management
├── backtesting/     # Backtesting framework
└── web/            # Web interface
```

## 📝 License

MIT License - see LICENSE file for details.

## ⚠️ COMPREHENSIVE LEGAL DISCLAIMER AND LIABILITY WAIVER

### 🚨 ABSOLUTE DISCLAIMER OF LIABILITY 🚨

**BY USING THIS SOFTWARE, YOU ACKNOWLEDGE AND AGREE TO THE FOLLOWING:**

#### **COMPLETE DISCLAIMER OF RESPONSIBILITY**
- **THE AUTHOR(S) AND CONTRIBUTORS BEAR ZERO RESPONSIBILITY** for any financial losses, damages, or consequences resulting from use of this software
- **NO LIABILITY WHATSOEVER** - The author disclaims all liability whether direct, indirect, incidental, special, consequential, or punitive
- **USE AT YOUR SOLE RISK** - You assume full responsibility for all trading decisions and their outcomes

#### **FINANCIAL RISK ACKNOWLEDGMENT**
- **TOTAL LOSS POSSIBLE** - You may lose 100% of your invested capital
- **LEVERAGED TRADING RISKS** - Algorithmic trading can amplify losses exponentially
- **MARKET VOLATILITY** - Financial markets are unpredictable and can move against you rapidly
- **SYSTEM FAILURES** - Technical failures may result in unintended trades or missed opportunities

#### **SOFTWARE LIMITATIONS**
- **BETA SOFTWARE** - This is experimental software with potential bugs and errors
- **NO WARRANTIES** - Provided "AS IS" without any warranties of any kind
- **AI LIMITATIONS** - Claude AI and sentiment analysis may produce inaccurate results
- **DATA DEPENDENCY** - Software relies on third-party data that may be delayed, incorrect, or unavailable

#### **REGULATORY AND LEGAL COMPLIANCE**
- **YOUR RESPONSIBILITY** - You are solely responsible for compliance with all applicable laws and regulations
- **LICENSING REQUIREMENTS** - Algorithmic trading may require regulatory licenses in your jurisdiction
- **TAX OBLIGATIONS** - You are responsible for all tax implications of your trading activities
- **JURISDICTION RESTRICTIONS** - This software may not be legal in all jurisdictions

#### **MANDATORY REQUIREMENTS BEFORE USE**
1. **PAPER TRADING ONLY** - Test extensively with simulated trading before risking real money
2. **PROFESSIONAL CONSULTATION** - Consult with licensed financial advisors and legal counsel
3. **RISK ASSESSMENT** - Only trade with money you can afford to lose completely
4. **UNDERSTANDING** - Fully understand the software's limitations and your local regulations
5. **CONTINUOUS MONITORING** - Actively monitor the system during operation

#### **NO INVESTMENT ADVICE**
- **EDUCATIONAL ONLY** - This software is for educational and research purposes exclusively
- **NOT FINANCIAL ADVICE** - Nothing herein constitutes investment, financial, legal, or tax advice
- **NO RECOMMENDATIONS** - No buy, sell, or hold recommendations are provided
- **INDEPENDENT DECISIONS** - All trading decisions must be your own independent choices

### 📋 LIABILITY WAIVER

**I HEREBY WAIVE, RELEASE, AND DISCHARGE** the author(s) and contributors from any and all claims, demands, actions, causes of action, damages, losses, costs, and expenses of any nature whatsoever arising out of or in any way connected with my use of this software.

### ⚖️ LEGAL ENFORCEABILITY

This disclaimer shall be governed by applicable law. If any provision is deemed unenforceable, the remaining provisions shall remain in full force and effect.

**IF YOU DO NOT AGREE TO THESE TERMS, DO NOT USE THIS SOFTWARE.**

---

**REMEMBER: The most sophisticated trading system is worthless if it causes you to lose money you cannot afford to lose. Trade responsibly.**

---

**Built with ❤️ for smarter algorithmic trading**

*Powered by Claude AI & Google Agent2Agent Protocol*