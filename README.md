# ZergTrader

A sophisticated multi-agent trading system that uses specialized AI agents for technical analysis, fundamental analysis, and decision fusion to make automated trading decisions with robust risk management.

## 🚀 Features

### Multi-Agent Architecture
- **Technical Analysis Agents**: Trend following, mean reversion, volume/momentum analysis
- **Fundamental Analysis Agents**: Valuation models, financial strength assessment, growth analysis
- **Decision Fusion Agent**: Combines signals using weighted fusion, voting, and ML ensemble methods
- **Risk Management Agent**: Real-time monitoring with automated position sizing and stop-loss execution
- **Portfolio Management**: Dynamic rebalancing and performance tracking

### Advanced Analytics
- **Technical Indicators**: SMA, EMA, RSI, MACD, Bollinger Bands, VWAP, Fibonacci retracements
- **Fundamental Analysis**: DCF valuation, P/E ratios, debt analysis, profitability metrics
- **Risk Metrics**: VaR, Sharpe ratio, Sortino ratio, maximum drawdown, beta/alpha calculation
- **News Sentiment**: Real-time sentiment analysis integration

### Risk Management
- **Position Sizing**: Kelly Criterion-inspired dynamic position sizing
- **Risk Constraints**: Multi-layered limits on position size, drawdown, and concentration
- **Automated Stops**: Real-time stop-loss execution with slippage protection
- **Alert System**: Automated risk alerts with severity-based actions

## 📋 Requirements

- Node.js 18+ 
- TypeScript 5+
- API keys for data sources (Alpha Vantage, News API)
- Optional: Broker API keys for live trading (Alpaca, Interactive Brokers)

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
# Data Sources
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
NEWS_API_KEY=your_news_api_key

# Trading (Optional - for live trading)
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# System Configuration
WATCHED_SYMBOLS=AAPL,MSFT,GOOGL,TSLA,AMZN
MAX_POSITION_SIZE=0.1        # 10% max position size
STOP_LOSS_PERCENTAGE=0.02    # 2% stop loss
AUTO_START=false             # Auto-start trading system
PORT=3000                    # Server port
LOG_LEVEL=info
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

### Agent Framework
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Technical      │    │  Fundamental    │    │  News/Sentiment │
│  Analysis       │    │  Analysis       │    │  Analysis       │
│  Agents         │    │  Agents         │    │  Agents         │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │     Decision Fusion         │
                    │        Agent               │
                    └─────────────┬───────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │     Risk Management         │
                    │        Agent               │
                    └─────────────┬───────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │    Portfolio Management     │
                    │         Agent              │
                    └─────────────┬───────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │      Execution Agent        │
                    └─────────────────────────────┘
```

### Data Flow
1. **Data Collection**: Market data, fundamental data, and news sentiment
2. **Agent Analysis**: Each agent processes relevant data and generates signals
3. **Signal Fusion**: Decision fusion agent combines signals using multiple methodologies
4. **Risk Evaluation**: Risk manager evaluates proposed trades against constraints
5. **Trade Execution**: Portfolio manager executes approved trades
6. **Performance Tracking**: Continuous monitoring and agent performance updates

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

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

### Adding New Agents

1. **Create Agent Class**
   ```typescript
   import { BaseAgent } from './BaseAgent';
   
   export class MyCustomAgent extends BaseAgent {
     protected async onStart(): Promise<void> {
       // Initialization logic
     }
     
     public async analyze(data: any): Promise<Signal[]> {
       // Analysis logic
       return signals;
     }
   }
   ```

2. **Register Agent**
   ```typescript
   const myAgent = new MyCustomAgent(config);
   agentManager.registerAgent(myAgent);
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

## 📈 Performance Optimization

### Agent Performance Tracking
- Individual agent accuracy monitoring
- Dynamic weight adjustment based on performance
- Historical performance analysis

### Data Efficiency
- Intelligent caching with TTL
- Multiple data source failover
- Batch processing for technical indicators

## 🚨 Troubleshooting

### Common Issues

1. **API Rate Limits**
   - Check your API key quotas
   - Adjust update intervals in configuration

2. **WebSocket Connection Issues**
   - Verify port availability
   - Check firewall settings

3. **Agent Not Starting**
   - Check agent configuration
   - Verify required parameters are set

### Logs
```bash
# View application logs
npm run dev

# Check for errors
grep "ERROR" logs/app.log
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## ⚠️ Disclaimer

This software is for educational and research purposes. Trading involves substantial risk of loss. Past performance does not guarantee future results. Use at your own risk and never trade with money you cannot afford to lose.

## 📞 Support

For questions, issues, or contributions:
- Open an issue on GitHub
- Check the documentation in `CLAUDE.md`
- Review the API documentation

---

**Built with ❤️ for algorithmic trading enthusiasts**