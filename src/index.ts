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

// Import monitoring
import { monitoringService, TradingMetrics, HealthChecks } from './monitoring';

// Import types
import { AgentConfig, Portfolio, Signal } from './types';

// Import logger
import { Logger } from './utils/logger';

// Import TradingView services
import { TradingViewClient } from './services/TradingViewClient';
import { TradingViewDataService } from './services/TradingViewDataService';

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
  private tradingMetrics!: TradingMetrics;
  private healthChecks!: HealthChecks;
  private tradingViewClient?: TradingViewClient;
  private tradingViewDataService?: TradingViewDataService;
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
    Logger.info('Initializing ZergTrader components...');

    // Initialize data manager
    this.dataManager = new DataManager();

    // Initialize TradingView services if enabled
    if (process.env.TRADINGVIEW_ENABLE === 'true') {
      this.tradingViewClient = new TradingViewClient();
      this.tradingViewDataService = new TradingViewDataService();
    }

    // Initialize risk manager with default constraints
    const riskConstraints = {
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.1'), // 10%
      maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'), // 5%
      maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN || '0.20'), // 20%
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.02'), // 2%
      maxLeverage: 1.0, // No leverage
      maxConcentrationPerSector: parseFloat(process.env.MAX_CONCENTRATION_SECTOR || '0.30'), // 30%
      maxConcentrationPerSymbol: parseFloat(process.env.MAX_CONCENTRATION_SYMBOL || '0.15'), // 15%
      minCashReserve: parseFloat(process.env.MIN_CASH_RESERVE || '0.05') // 5%
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
      },
      brokerConfig: {
        alpacaApiKey: process.env.ALPACA_API_KEY,
        alpacaSecretKey: process.env.ALPACA_SECRET_KEY,
        alpacaBaseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
        enableLiveTrading: false // Always start with paper trading for safety
      }
    };

    this.portfolioManager = new PortfolioManager(portfolioConfig, this.riskManager);

    // Initialize agent manager with memory service
    this.agentManager = new AgentManager(process.env.A2A_REGISTRY_ENDPOINT);

    // Initialize backtest controller
    this.backtestController = new BacktestController();

    // Initialize monitoring
    this.tradingMetrics = new TradingMetrics(monitoringService);
    this.healthChecks = new HealthChecks(
      this.agentManager,
      this.dataManager,
      this.portfolioManager,
      this.riskManager
    );

    // Register health checks
    this.setupHealthChecks();

    // Setup monitoring event handlers
    this.setupMonitoringEvents();

    // Create and register agents
    this.createAgents();
  }

  private createAgents(): void {
    const watchedSymbols = (process.env.WATCHED_SYMBOLS || 'AAPL,MSFT,GOOGL,TSLA,AMZN').split(',');
    const sharedMemoryService = this.agentManager.getMemoryService();
    const enableClaude = process.env.ENABLE_CLAUDE_ANALYSIS !== 'false';
    const enableA2A = process.env.A2A_ENABLE_DISCOVERY === 'true';

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
    }, enableClaude, true, process.env.TRADINGVIEW_ENABLE === 'true');

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
    }, enableClaude);

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
    }, enableClaude);

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
    }, enableClaude);

    // Register agents
    this.agentManager.registerAgent(trendAgent);
    this.agentManager.registerAgent(meanReversionAgent);
    this.agentManager.registerAgent(valuationAgent);
    this.agentManager.registerAgent(fusionAgent);

    Logger.info(`Registered ${this.agentManager.getAllAgents().length} agents`);
  }

  private setupHealthChecks(): void {
    monitoringService.registerHealthCheck('agents', () => this.healthChecks.checkAgentManager());
    monitoringService.registerHealthCheck('data', () => this.healthChecks.checkDataManager());
    monitoringService.registerHealthCheck('portfolio', () => this.healthChecks.checkPortfolioManager());
    monitoringService.registerHealthCheck('risk', () => this.healthChecks.checkRiskManager());
    monitoringService.registerHealthCheck('system', () => this.healthChecks.checkSystemResources());
    monitoringService.registerHealthCheck('database', () => this.healthChecks.checkDatabase());
    monitoringService.registerHealthCheck('external-apis', () => this.healthChecks.checkExternalAPIs());
  }

  private setupMonitoringEvents(): void {
    monitoringService.on('alertCreated', (alert) => {
      console.log(`Alert created [${alert.severity}]: ${alert.message}`);
      
      this.broadcastToClients({
        type: 'alert',
        data: alert
      });
    });

    monitoringService.on('alertResolved', (alert) => {
      console.log(`Alert resolved: ${alert.id}`);
      
      this.broadcastToClients({
        type: 'alertResolved',
        data: alert
      });
    });

    monitoringService.on('metricRecorded', (metric) => {
      if (metric.name.includes('error') || metric.name.includes('alert')) {
        this.broadcastToClients({
          type: 'metric',
          data: metric
        });
      }
    });
  }

  private setupRoutes(): void {
    this.app.use(express.json());
    this.app.use(express.static('public'));

    // Add monitoring middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.tradingMetrics.recordApiCall(
          req.path,
          req.method,
          res.statusCode,
          duration
        );
      });
      
      next();
    });

    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const systemHealth = await monitoringService.getSystemHealth();
        res.json({
          ...systemHealth,
          running: this.isRunning
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Monitoring endpoints
    this.app.get('/metrics', (req, res) => {
      const name = req.query.name as string;
      const labels = req.query.labels ? JSON.parse(req.query.labels as string) : undefined;
      const metrics = monitoringService.getMetrics(name, labels);
      res.json(metrics);
    });

    this.app.get('/metrics/summary', (req, res) => {
      const summary = this.tradingMetrics.getTradingMetricsSummary();
      res.json(summary);
    });

    this.app.get('/metrics/export', (req, res) => {
      const exportData = monitoringService.getMetricsForExport();
      res.json(exportData);
    });

    this.app.get('/alerts', (req, res) => {
      const resolved = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined;
      const alerts = monitoringService.getAlerts(resolved);
      res.json(alerts);
    });

    this.app.post('/alerts/:id/resolve', (req, res) => {
      const success = monitoringService.resolveAlert(req.params.id);
      res.json({ success });
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

    // Memory system endpoints
    this.app.get('/memory/stats', async (req, res) => {
      try {
        const memoryService = this.agentManager.getMemoryService();
        const stats = await memoryService.getMemoryStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Memory service error' });
      }
    });

    this.app.get('/agents/:id/memory/stats', async (req, res) => {
      try {
        const memoryService = this.agentManager.getMemoryService();
        const memories = await memoryService.retrieveMemories({ 
          agentId: req.params.id,
          limit: 1000 
        });
        res.json({ 
          agentId: req.params.id,
          totalMemories: memories.length,
          avgImportance: memories.reduce((sum, m) => sum + m.importance, 0) / memories.length || 0
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Memory service error' });
      }
    });

    this.app.delete('/agents/:id/memory', async (req, res) => {
      try {
        const memoryService = this.agentManager.getMemoryService();
        await memoryService.clearMemories(req.params.id);
        res.json({ success: true, message: `Cleared memories for agent ${req.params.id}` });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Memory service error' });
      }
    });

    this.app.get('/agents/:id/memory/context', async (req, res) => {
      try {
        const memoryService = this.agentManager.getMemoryService();
        const context = await memoryService.getRelevantContext(req.params.id, {
          symbol: req.query.symbol as string,
          analysisType: req.query.analysisType as string,
          maxMemories: parseInt(req.query.limit as string) || 10
        });
        res.json(context);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Memory service error' });
      }
    });

    this.app.delete('/memory/cleanup', async (req, res) => {
      try {
        const memoryService = this.agentManager.getMemoryService();
        // Trigger manual cleanup - this would need to be implemented in MemoryService
        res.json({ success: true, message: 'Memory cleanup triggered' });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Memory service error' });
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

    // TradingView endpoints (if enabled)
    if (this.tradingViewDataService) {
      this.app.get('/tradingview/status', (req, res) => {
        res.json({ 
          enabled: true,
          connected: this.tradingViewClient?.isConnected() || false,
          timestamp: new Date().toISOString()
        });
      });

      this.app.get('/tradingview/symbols/:symbol/info', async (req, res) => {
        try {
          const info = await this.tradingViewClient!.getSymbolInfo(req.params.symbol);
          res.json(info);
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : 'TradingView error' });
        }
      });

      this.app.get('/tradingview/symbols/:symbol/quote', async (req, res) => {
        try {
          const quote = await this.tradingViewDataService!.getRealtimeQuote(req.params.symbol);
          res.json(quote);
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : 'TradingView error' });
        }
      });

      this.app.get('/tradingview/symbols/:symbol/history', async (req, res) => {
        try {
          const { from, to, resolution = '1D' } = req.query;
          const history = await this.tradingViewDataService!.getHistoricalData(
            req.params.symbol,
            resolution as any,
            from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            to ? new Date(to as string) : new Date()
          );
          res.json(history);
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : 'TradingView error' });
        }
      });

      this.app.get('/tradingview/symbols/:symbol/indicators', async (req, res) => {
        try {
          const indicatorNames = (req.query.indicators as string)?.split(',') || ['RSI', 'MACD', 'SMA'];
          const allIndicators = [];
          for (const indicator of indicatorNames) {
            try {
              const indData = await this.tradingViewDataService!.getTechnicalIndicators(
                req.params.symbol,
                indicator as any,
                '1D',
                14,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                new Date()
              );
              allIndicators.push(...indData);
            } catch (error) {
              console.warn(`Failed to get ${indicator} for ${req.params.symbol}:`, error);
            }
          }
          const indicators = { indicators: allIndicators };
          res.json(indicators);
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : 'TradingView error' });
        }
      });

      this.app.get('/tradingview/symbols/:symbol/analysis', async (req, res) => {
        try {
          const analysis = await this.tradingViewClient!.getTechnicalAnalysis(req.params.symbol);
          res.json(analysis);
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : 'TradingView error' });
        }
      });

      this.app.post('/tradingview/screener', async (req, res) => {
        try {
          const results = await this.tradingViewClient!.screenStocks(req.body);
          res.json(results);
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : 'TradingView error' });
        }
      });
    }
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
      
      // Record signal metrics
      this.tradingMetrics.recordSignalGenerated(signal);
      
      // Process signal through portfolio manager
      const result = this.portfolioManager.processSignal(signal);
      
      if (result.approved && result.trade) {
        // Execute the trade
        const executionResult = this.portfolioManager.executeTrade(result.trade);
        console.log(`Trade execution: ${executionResult.success ? 'SUCCESS' : 'FAILED'} - ${executionResult.error || 'Trade executed'}`);
        
        if (!executionResult.success && executionResult.error) {
          this.tradingMetrics.recordErrorEvent('portfolio', 'trade_execution_failed', executionResult.error);
        }
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
      
      // Record trade metrics
      this.tradingMetrics.recordTradeExecuted(trade);
      
      this.broadcastToClients({
        type: 'tradeExecuted',
        data: trade
      });
    });

    this.portfolioManager.on('portfolioUpdated', (portfolio) => {
      // Record portfolio metrics
      this.tradingMetrics.recordPortfolioUpdate(portfolio);
      this.tradingMetrics.recordPositionMetrics(portfolio.positions);
      
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
      
      // Record risk event
      this.tradingMetrics.recordRiskEvent('alert', alert.severity);
      
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
            let marketData = await this.dataManager.getMarketData(symbol, '1d', 100);
            let fundamentalData = await this.dataManager.getFundamentalData(symbol);
            let indicators = this.dataManager.calculateTechnicalIndicators(marketData, ['sma', 'ema', 'rsi', 'macd']);

            // Enhance with TradingView data if available
            if (this.tradingViewDataService && this.tradingViewClient) {
              try {
                const tvResponse = await this.tradingViewClient.getHistoricalData({
                  symbol,
                  from: Math.floor((Date.now() - 100 * 24 * 60 * 60 * 1000) / 1000),
                  to: Math.floor(Date.now() / 1000),
                  resolution: '1D',
                  firstDataRequest: true
                });
                const tvData = await this.tradingViewClient.convertToMarketData(tvResponse, symbol);
                if (tvData && tvData.length > 0) {
                  marketData = tvData;
                }

                const tvIndicators = [];
                if (this.tradingViewDataService) {
                  for (const indicatorName of ['RSI', 'MACD', 'SMA', 'EMA']) {
                    try {
                      const indData = await this.tradingViewDataService.getTechnicalIndicators(
                        symbol,
                        indicatorName as any,
                        '1D',
                        14,
                        new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
                        new Date()
                      );
                      tvIndicators.push(...indData);
                    } catch (error) {
                      Logger.warn(`Failed to get ${indicatorName} for ${symbol}:`, error);
                    }
                  }
                }
                
                // Merge TradingView indicators with calculated ones
                indicators = [...indicators, ...tvIndicators];
              } catch (error) {
                Logger.warn(`TradingView data fetch failed for ${symbol}:`, error);
              }
            }

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