import express from 'express';
import { createServer } from 'http';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import * as cron from 'node-cron';

// Import core components
import { AgentManager } from './agents/AgentManager';
import { DataManager } from './data/DataManager';
import { PortfolioManager } from './portfolio/PortfolioManager';
import { RiskManager } from './risk/RiskManager';
import { BacktestController } from './backtesting/BacktestController';

// Import agents
import { TrendFollowingAgent } from './agents/technical/TrendFollowingAgent';
import { MeanReversionAgent } from './agents/technical/MeanReversionAgent';
import { ValuationAgent } from './agents/fundamental/ValuationAgent';
import { DecisionFusionAgent } from './agents/fusion/DecisionFusionAgent';

// Import types
import { AgentConfig, Portfolio, Signal } from './types';

// Load environment variables
dotenv.config();

class ZergTrader {
  private app: express.Application;
  private server: any;
  private wss: WebSocket.Server;
  private agentManager!: AgentManager;
  private dataManager!: DataManager;
  private portfolioManager!: PortfolioManager;
  private riskManager!: RiskManager;
  private backtestController!: BacktestController;
  private isRunning: boolean = false;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    
    this.initializeComponents();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  private initializeComponents(): void {
    console.log('Initializing ZergTrader components...');

    // Initialize data manager
    this.dataManager = new DataManager();

    // Initialize risk manager with default constraints
    const riskConstraints = {
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.1'), // 10%
      maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'), // 5%
      maxDrawdown: 0.20, // 20%
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.02'), // 2%
      maxLeverage: 1.0, // No leverage
      maxConcentrationPerSector: 0.30, // 30%
      maxConcentrationPerSymbol: 0.15, // 15%
      minCashReserve: 0.05 // 5%
    };

    const initialPortfolio: Portfolio = {
      id: 'main-portfolio',
      cash: 100000, // $100k starting capital
      positions: [],
      total_value: 100000,
      daily_pnl: 0,
      total_pnl: 0,
      timestamp: new Date()
    };

    this.riskManager = new RiskManager(riskConstraints, initialPortfolio);

    // Initialize portfolio manager
    const portfolioConfig = {
      initialCash: 100000,
      rebalanceFrequency: 'DAILY' as const,
      maxPositions: 20,
      minTradeSize: 100,
      transactionCosts: {
        commission: 1.0, // $1 per trade
        spreadCost: 0.001, // 0.1%
        slippage: 0.0005 // 0.05%
      }
    };

    this.portfolioManager = new PortfolioManager(portfolioConfig, this.riskManager);

    // Initialize agent manager
    this.agentManager = new AgentManager();

    // Initialize backtest controller
    this.backtestController = new BacktestController();

    // Create and register agents
    this.createAgents();
  }

  private createAgents(): void {
    const watchedSymbols = (process.env.WATCHED_SYMBOLS || 'AAPL,MSFT,GOOGL,TSLA,AMZN').split(',');

    // Technical Analysis Agents
    const trendAgent = new TrendFollowingAgent({
      id: 'trend-following-agent',
      name: 'Trend Following Agent',
      type: 'TECHNICAL',
      enabled: true,
      parameters: {
        symbols: watchedSymbols,
        smaShortPeriod: 20,
        smaLongPeriod: 200,
        emaPeriods: [12, 26],
        macdParams: { fast: 12, slow: 26, signal: 9 }
      },
      weight: 0.3
    });

    const meanReversionAgent = new MeanReversionAgent({
      id: 'mean-reversion-agent',
      name: 'Mean Reversion Agent',
      type: 'TECHNICAL',
      enabled: true,
      parameters: {
        symbols: watchedSymbols,
        rsiOversold: 30,
        rsiOverbought: 70,
        rsiExtremeOversold: 20,
        rsiExtremeOverbought: 80,
        deviationThreshold: 2,
        volumeThreshold: 2
      },
      weight: 0.25
    });

    // Fundamental Analysis Agent
    const valuationAgent = new ValuationAgent({
      id: 'valuation-agent',
      name: 'Valuation Agent',
      type: 'FUNDAMENTAL',
      enabled: true,
      parameters: {
        symbols: watchedSymbols,
        peThreshold: 25,
        debtToEquityThreshold: 1.5,
        roeThreshold: 0.15,
        roaThreshold: 0.10
      },
      weight: 0.2
    });

    // Decision Fusion Agent
    const fusionAgent = new DecisionFusionAgent({
      id: 'decision-fusion-agent',
      name: 'Decision Fusion Agent',
      type: 'FUSION',
      enabled: true,
      parameters: {
        fusionThreshold: 0.4,
        mlThreshold: 0.3,
        metaThreshold: 0.5,
        defaultAgentWeight: 0.5
      },
      weight: 1.0
    });

    // Register agents
    this.agentManager.registerAgent(trendAgent);
    this.agentManager.registerAgent(meanReversionAgent);
    this.agentManager.registerAgent(valuationAgent);
    this.agentManager.registerAgent(fusionAgent);

    console.log(`Registered ${this.agentManager.getAllAgents().length} agents`);
  }

  private setupRoutes(): void {
    this.app.use(express.json());
    this.app.use(express.static('public'));

    // Health check
    this.app.get('/health', (req, res) => {
      const health = {
        status: this.isRunning ? 'running' : 'stopped',
        timestamp: new Date().toISOString(),
        agents: this.agentManager.getSystemHealth(),
        portfolio: {
          totalValue: this.portfolioManager.getPortfolio().total_value,
          positions: this.portfolioManager.getPositions().length,
          cash: this.portfolioManager.getPortfolio().cash
        },
        riskMetrics: this.riskManager.getRiskMetrics()
      };
      res.json(health);
    });

    // Portfolio endpoints
    this.app.get('/portfolio', (req, res) => {
      res.json(this.portfolioManager.getPortfolio());
    });

    this.app.get('/positions', (req, res) => {
      res.json(this.portfolioManager.getPositions());
    });

    this.app.get('/performance', (req, res) => {
      res.json(this.portfolioManager.getPerformanceMetrics());
    });

    // Risk management endpoints
    this.app.get('/risk/metrics', (req, res) => {
      res.json(this.riskManager.getRiskMetrics());
    });

    this.app.get('/risk/alerts', (req, res) => {
      res.json(this.riskManager.getActiveAlerts());
    });

    this.app.post('/risk/alerts/:id/resolve', (req, res) => {
      this.riskManager.resolveAlert(req.params.id);
      res.json({ success: true });
    });

    // Agent management endpoints
    this.app.get('/agents', (req, res) => {
      const agents = this.agentManager.getAllAgents().map(agent => ({
        id: agent.getId(),
        name: agent.getName(),
        type: agent.getType(),
        enabled: agent.isEnabled(),
        weight: agent.getWeight(),
        health: agent.getHealth()
      }));
      res.json(agents);
    });

    this.app.post('/agents/:id/start', async (req, res) => {
      try {
        await this.agentManager.startAgent(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.app.post('/agents/:id/stop', async (req, res) => {
      try {
        await this.agentManager.stopAgent(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Trading endpoints
    this.app.get('/trades', (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      res.json(this.portfolioManager.getTradeHistory(limit));
    });

    this.app.post('/rebalance', async (req, res) => {
      const strategy = req.body.strategy;
      const result = this.portfolioManager.rebalancePortfolio(strategy);
      res.json(result);
    });

    // System control
    this.app.post('/start', async (req, res) => {
      try {
        await this.start();
        res.json({ success: true, message: 'System started' });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start' });
      }
    });

    this.app.post('/stop', async (req, res) => {
      try {
        await this.stop();
        res.json({ success: true, message: 'System stopped' });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop' });
      }
    });

    // Backtesting endpoints
    this.app.post('/backtests', this.backtestController.createBacktest.bind(this.backtestController));
    this.app.get('/backtests/:jobId', this.backtestController.getBacktestStatus.bind(this.backtestController));
    this.app.get('/backtests/:jobId/result', this.backtestController.getBacktestResult.bind(this.backtestController));
    this.app.get('/backtests', this.backtestController.getAllBacktests.bind(this.backtestController));
    this.app.delete('/backtests/:jobId/cancel', this.backtestController.cancelBacktest.bind(this.backtestController));
    this.app.delete('/backtests/:jobId', this.backtestController.deleteBacktest.bind(this.backtestController));
    this.app.post('/backtests/compare', this.backtestController.compareBacktests.bind(this.backtestController));
    this.app.get('/backtests/:jobId/export', this.backtestController.exportBacktestData.bind(this.backtestController));
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      console.log('WebSocket client connected');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });

      // Send initial data
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString()
      }));
    });
  }

  private handleWebSocketMessage(ws: WebSocket, data: any): void {
    switch (data.type) {
      case 'subscribe':
        // Handle subscription requests
        break;
      case 'unsubscribe':
        // Handle unsubscription requests
        break;
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
  }

  private setupEventHandlers(): void {
    // Agent manager events
    this.agentManager.on('signal', (signal: Signal) => {
      console.log(`Received signal: ${signal.action} ${signal.symbol} (confidence: ${signal.confidence})`);
      
      // Process signal through portfolio manager
      const result = this.portfolioManager.processSignal(signal);
      
      if (result.approved && result.trade) {
        // Execute the trade
        const executionResult = this.portfolioManager.executeTrade(result.trade);
        console.log(`Trade execution: ${executionResult.success ? 'SUCCESS' : 'FAILED'} - ${executionResult.error || 'Trade executed'}`);
      } else {
        console.log(`Signal rejected: ${result.reason}`);
      }

      // Broadcast to WebSocket clients
      this.broadcastToClients({
        type: 'signal',
        data: signal,
        result: result
      });
    });

    this.agentManager.on('log', (logEntry) => {
      console.log(`[${logEntry.agent}] ${logEntry.level.toUpperCase()}: ${logEntry.message}`);
    });

    // Portfolio manager events
    this.portfolioManager.on('tradeExecuted', (trade) => {
      console.log(`Trade executed: ${trade.action} ${trade.quantity} ${trade.symbol} at $${trade.price}`);
      
      this.broadcastToClients({
        type: 'tradeExecuted',
        data: trade
      });
    });

    this.portfolioManager.on('portfolioUpdated', (portfolio) => {
      this.broadcastToClients({
        type: 'portfolioUpdate',
        data: {
          totalValue: portfolio.total_value,
          cash: portfolio.cash,
          dailyPnL: portfolio.daily_pnl,
          totalPnL: portfolio.total_pnl,
          timestamp: portfolio.timestamp
        }
      });
    });

    // Risk manager events
    this.riskManager.on('riskAlert', (alert) => {
      console.log(`RISK ALERT [${alert.severity}]: ${alert.message}`);
      
      this.broadcastToClients({
        type: 'riskAlert',
        data: alert
      });
    });

    // Data manager events
    this.dataManager.on('marketDataUpdated', (data) => {
      // Update portfolio with new prices
      const prices = new Map<string, number>();
      if (Array.isArray(data.data) && data.data.length > 0) {
        prices.set(data.symbol, data.data[data.data.length - 1].close);
        this.portfolioManager.updateMarketPrices(prices);
      }
    });
  }

  private broadcastToClients(message: any): void {
    const messageStr = JSON.stringify({
      ...message,
      timestamp: new Date().toISOString()
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  private setupCronJobs(): void {
    // Market data updates - every minute during market hours
    cron.schedule('* 9-16 * * 1-5', async () => {
      if (this.isRunning) {
        const symbols = (process.env.WATCHED_SYMBOLS || 'AAPL,MSFT,GOOGL,TSLA,AMZN').split(',');
        for (const symbol of symbols) {
          try {
            const marketData = await this.dataManager.getMarketData(symbol, '1d', 100);
            const fundamentalData = await this.dataManager.getFundamentalData(symbol);
            const indicators = this.dataManager.calculateTechnicalIndicators(marketData, ['sma', 'ema', 'rsi', 'macd']);

            // Send data to technical agents
            const technicalAgents = this.agentManager.getAgentsByType('TECHNICAL');
            for (const agent of technicalAgents) {
              agent.analyze({ symbol, marketData, indicators });
            }

            // Send data to fundamental agents
            if (fundamentalData) {
              const fundamentalAgents = this.agentManager.getAgentsByType('FUNDAMENTAL');
              for (const agent of fundamentalAgents) {
                agent.analyze({ symbol, fundamentalData, marketData });
              }
            }
          } catch (error) {
            console.error(`Error updating data for ${symbol}:`, error);
          }
        }
      }
    }, {
      timezone: 'America/New_York'
    });

    // Portfolio rebalancing - daily at market close
    cron.schedule('0 16 * * 1-5', async () => {
      if (this.isRunning) {
        console.log('Performing daily rebalancing...');
        const result = this.portfolioManager.rebalancePortfolio();
        console.log(`Rebalancing result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.error || `${result.trades?.length || 0} trades executed`}`);
      }
    }, {
      timezone: 'America/New_York'
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('ZergTrader is already running');
    }

    console.log('Starting ZergTrader...');

    // Start all agents
    await this.agentManager.startAll();

    // Setup cron jobs
    this.setupCronJobs();

    // Start real-time data updates
    const symbols = (process.env.WATCHED_SYMBOLS || 'AAPL,MSFT,GOOGL,TSLA,AMZN').split(',');
    this.dataManager.startRealTimeUpdates(symbols, 60000); // Every minute

    this.isRunning = true;
    console.log('ZergTrader started successfully');
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping ZergTrader...');

    // Stop all agents
    await this.agentManager.stopAll();

    // Stop real-time data updates
    this.dataManager.stopRealTimeUpdates();

    this.isRunning = false;
    console.log('ZergTrader stopped');
  }

  public listen(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`ZergTrader server listening on port ${port}`);
    });
  }
}

// Main execution
async function main() {
  const zergTrader = new ZergTrader();
  
  // Start the server
  const port = parseInt(process.env.PORT || '3000');
  zergTrader.listen(port);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await zergTrader.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await zergTrader.stop();
    process.exit(0);
  });

  // Auto-start if enabled
  if (process.env.AUTO_START === 'true') {
    try {
      await zergTrader.start();
      console.log('ZergTrader auto-started');
    } catch (error) {
      console.error('Failed to auto-start ZergTrader:', error);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default ZergTrader;