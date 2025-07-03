# ZergTrader

An AI-powered multi-agent trading system that combines traditional technical analysis with modern AI intelligence for smarter trading decisions.

## 🚀 Key Features

- **🤖 AI-Enhanced Analysis**: Claude AI integration for intelligent market pattern recognition
- **📊 Advanced Technical Analysis**: 9+ indicators including Stochastic, ADX, Williams %R, CCI
- **🛡️ Smart Risk Management**: Volatility-based position sizing and risk-adjusted signals
- **📈 Professional Data**: TradingView API integration for institutional-grade market data
- **🌐 Agent Communication**: Google A2A protocol for cross-platform agent interoperability
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

## 🌐 Agent2Agent Protocol

Connect with external trading agents using Google's A2A standard:

```bash
# Enable A2A
A2A_ENABLE_DISCOVERY=true
A2A_REGISTRY_ENDPOINT=http://registry.example.com
```

Features:
- **Agent Discovery**: Automatic registration and discovery
- **Cross-Platform Communication**: JSON-RPC 2.0 messaging
- **Capability Registry**: Method and capability introspection

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

### Disclaimer
⚠️ **Trading involves substantial risk of loss. Past performance does not guarantee future results. Use at your own risk.**

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

## ⚠️ Important Warning

**This software is for educational purposes only. Trading involves substantial risk of loss. Never trade with money you cannot afford to lose. Always test thoroughly with paper trading before using real money.**

---

**Built with ❤️ for smarter algorithmic trading**

*Powered by Claude AI & Agent2Agent Protocol*