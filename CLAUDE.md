# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZergTrader is a sophisticated multi-agent trading system that uses specialized AI agents for technical analysis, fundamental analysis, and decision fusion to make automated trading decisions with robust risk management.

## Development Setup

### Environment Setup
```bash
npm install
cp .env.example .env
# Configure API keys in .env file
```

### Common Commands
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm test` - Run test suite
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

### Required Environment Variables
- `ALPHA_VANTAGE_API_KEY` - For market data
- `NEWS_API_KEY` - For sentiment analysis
- `ALPACA_API_KEY` & `ALPACA_SECRET_KEY` - For trading execution
- `WATCHED_SYMBOLS` - Comma-separated list of symbols to track
- `MAX_POSITION_SIZE` - Maximum position size as percentage (default: 0.1)
- `STOP_LOSS_PERCENTAGE` - Stop loss threshold (default: 0.02)

## Architecture

### Multi-Agent System
The system uses a modular agent-based architecture:

1. **Base Agent Framework** (`src/agents/BaseAgent.ts`)
   - All agents inherit from BaseAgent
   - Provides message passing, health monitoring, and configuration management
   - Agent-to-Agent communication protocol

2. **Technical Analysis Agents**
   - `TrendFollowingAgent` - SMA, EMA, MACD trend analysis
   - `MeanReversionAgent` - RSI, Bollinger Bands, price deviation analysis

3. **Fundamental Analysis Agents**
   - `ValuationAgent` - PE ratio, DCF analysis, debt analysis, profitability metrics

4. **Decision Fusion Agent** (`src/agents/fusion/DecisionFusionAgent.ts`)
   - Combines signals from multiple agents using weighted fusion, voting, and ML-style ensemble methods
   - Tracks agent performance and adjusts weights dynamically
   - Meta-fusion of different fusion methodologies

5. **Risk Management** (`src/risk/RiskManager.ts`)
   - Position sizing using Kelly Criterion-inspired approach
   - Real-time risk monitoring with VaR, drawdown, and concentration limits
   - Automated stop-loss execution

6. **Portfolio Management** (`src/portfolio/PortfolioManager.ts`)
   - Trade execution with transaction cost modeling
   - Portfolio rebalancing with configurable strategies
   - Performance tracking and metrics calculation

7. **Data Management** (`src/data/DataManager.ts`)
   - Multi-source market data aggregation (Alpha Vantage, Yahoo Finance)
   - Technical indicator calculations (SMA, EMA, RSI, MACD, Bollinger Bands)
   - News sentiment analysis integration

### API Endpoints
- `GET /health` - System health and status
- `GET /portfolio` - Current portfolio state
- `GET /positions` - All positions
- `GET /performance` - Performance metrics
- `GET /risk/metrics` - Risk metrics and alerts
- `GET /agents` - Agent status and health
- `POST /start` - Start the trading system
- `POST /stop` - Stop the trading system
- `POST /rebalance` - Trigger portfolio rebalancing

### WebSocket Events
Real-time updates for:
- New trading signals
- Trade executions
- Portfolio updates
- Risk alerts
- Agent status changes

## Project Structure
```
src/
├── agents/           # Agent implementations
│   ├── BaseAgent.ts     # Base agent class
│   ├── AgentManager.ts  # Agent lifecycle management
│   ├── technical/       # Technical analysis agents
│   ├── fundamental/     # Fundamental analysis agents
│   └── fusion/          # Decision fusion agent
├── data/            # Data management
│   └── DataManager.ts   # Market data collection and processing
├── risk/            # Risk management
│   └── RiskManager.ts   # Risk monitoring and constraints
├── portfolio/       # Portfolio management
│   └── PortfolioManager.ts # Trade execution and portfolio tracking
├── types/           # TypeScript type definitions
│   └── index.ts         # Core data types
├── utils/           # Utility functions
└── index.ts         # Main application entry point
```

## Key Features

### Agent Communication
- Standardized Agent2Agent message protocol
- Event-driven architecture with message routing
- Real-time signal aggregation and fusion

### Risk Management
- Dynamic position sizing based on Kelly Criterion
- Multi-layered risk constraints (position size, drawdown, concentration)
- Real-time risk monitoring with automated alerts
- Stop-loss automation with slippage protection

### Signal Processing
- Multi-timeframe technical analysis
- Fundamental valuation models (DCF, ratio analysis)
- Ensemble decision fusion with performance-weighted voting
- Signal validation and filtering

### Data Integration
- Multiple data source failover (Alpha Vantage → Yahoo Finance)
- Real-time market data streaming
- News sentiment integration
- Technical indicator calculation engine

## Development Guidelines

### Adding New Agents
1. Extend `BaseAgent` class
2. Implement required abstract methods: `onStart()`, `onStop()`, `onMessage()`, `analyze()`
3. Register with `AgentManager`
4. Configure agent parameters and weight

### Signal Generation
- All signals must include confidence (0-1) and strength (0-1) scores
- Include detailed reasoning for transparency
- Add relevant metadata for debugging and analysis

### Risk Constraints
- All trades are evaluated through `RiskManager` before execution
- Risk alerts trigger automatic defensive actions
- Position sizing is dynamically calculated based on current portfolio state

### Performance Monitoring
- All agent performance is tracked and used for weight adjustment
- Portfolio metrics are continuously calculated
- Trade attribution links signals to outcomes for agent performance updates

## Testing

Run tests with appropriate market data mocking:
```bash
npm test
```

## Production Deployment

1. Configure environment variables for production APIs
2. Set up monitoring and alerting
3. Configure backup and recovery procedures
4. Implement proper logging and audit trails
5. Test with paper trading before live deployment