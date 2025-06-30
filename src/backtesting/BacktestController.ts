import { Request, Response } from 'express';
import { BacktestEngine, BacktestConfig } from './BacktestEngine';
import { DataProviderFactory, DataRequest } from './HistoricalDataProvider';
import { BacktestPortfolioTracker } from './BacktestPortfolioTracker';
import { AgentConfig, BacktestResult } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface BacktestRequest {
  name: string;
  description?: string;
  config: BacktestConfig;
  agentConfigs: AgentConfig[];
  riskConfig: any;
  dataProvider: {
    type: 'alphavantage' | 'mock' | 'csv';
    config?: any;
  };
}

export interface BacktestJob {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  result?: BacktestResult;
  error?: string;
  config: BacktestRequest;
}

export class BacktestController {
  private activeJobs: Map<string, BacktestJob> = new Map();
  private runningEngines: Map<string, BacktestEngine> = new Map();
  private maxConcurrentJobs = 3;

  public async createBacktest(req: Request, res: Response): Promise<void> {
    try {
      const request: BacktestRequest = req.body;
      
      // Validate request
      this.validateBacktestRequest(request);
      
      // Check if we can start the job now
      const runningJobs = Array.from(this.activeJobs.values()).filter(j => j.status === 'RUNNING');
      if (runningJobs.length >= this.maxConcurrentJobs) {
        res.status(429).json({
          error: 'Maximum concurrent backtests reached. Please try again later.',
          maxConcurrent: this.maxConcurrentJobs,
          currentRunning: runningJobs.length
        });
        return;
      }
      
      // Create job
      const job: BacktestJob = {
        id: uuidv4(),
        name: request.name,
        status: 'PENDING',
        progress: 0,
        config: request
      };
      
      this.activeJobs.set(job.id, job);
      
      // Start backtest asynchronously
      this.runBacktestJob(job.id).catch(error => {
        console.error(`Backtest job ${job.id} failed:`, error);
        const failedJob = this.activeJobs.get(job.id);
        if (failedJob) {
          failedJob.status = 'FAILED';
          failedJob.error = error.message;
          failedJob.endTime = new Date();
        }
      });
      
      res.status(201).json({
        jobId: job.id,
        status: job.status,
        message: 'Backtest job created and queued'
      });
      
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid backtest request'
      });
    }
  }

  public async getBacktestStatus(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const job = this.activeJobs.get(jobId);
    
    if (!job) {
      res.status(404).json({ error: 'Backtest job not found' });
      return;
    }
    
    res.json({
      id: job.id,
      name: job.name,
      status: job.status,
      progress: job.progress,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error
    });
  }

  public async getBacktestResult(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const job = this.activeJobs.get(jobId);
    
    if (!job) {
      res.status(404).json({ error: 'Backtest job not found' });
      return;
    }
    
    if (job.status !== 'COMPLETED') {
      res.status(400).json({ 
        error: 'Backtest not completed yet',
        status: job.status,
        progress: job.progress
      });
      return;
    }
    
    res.json(job.result);
  }

  public async getAllBacktests(req: Request, res: Response): Promise<void> {
    const { status, limit = '50' } = req.query;
    
    let jobs = Array.from(this.activeJobs.values());
    
    // Filter by status if provided
    if (status && typeof status === 'string') {
      jobs = jobs.filter(job => job.status === status.toUpperCase());
    }
    
    // Apply limit
    const limitNum = parseInt(limit as string, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      jobs = jobs.slice(-limitNum);
    }
    
    // Sort by start time (most recent first)
    jobs.sort((a, b) => {
      const aTime = a.startTime || new Date(0);
      const bTime = b.startTime || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });
    
    res.json({
      jobs: jobs.map(job => ({
        id: job.id,
        name: job.name,
        status: job.status,
        progress: job.progress,
        startTime: job.startTime,
        endTime: job.endTime,
        error: job.error
      })),
      total: jobs.length,
      running: jobs.filter(j => j.status === 'RUNNING').length,
      completed: jobs.filter(j => j.status === 'COMPLETED').length,
      failed: jobs.filter(j => j.status === 'FAILED').length
    });
  }

  public async cancelBacktest(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const job = this.activeJobs.get(jobId);
    
    if (!job) {
      res.status(404).json({ error: 'Backtest job not found' });
      return;
    }
    
    if (job.status !== 'RUNNING' && job.status !== 'PENDING') {
      res.status(400).json({ 
        error: 'Cannot cancel backtest',
        status: job.status
      });
      return;
    }
    
    // Cancel the running engine
    const engine = this.runningEngines.get(jobId);
    if (engine) {
      engine.stop();
      this.runningEngines.delete(jobId);
    }
    
    // Update job status
    job.status = 'CANCELLED';
    job.endTime = new Date();
    
    res.json({
      message: 'Backtest cancelled successfully',
      jobId,
      status: job.status
    });
  }

  public async deleteBacktest(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const job = this.activeJobs.get(jobId);
    
    if (!job) {
      res.status(404).json({ error: 'Backtest job not found' });
      return;
    }
    
    // Cannot delete running jobs
    if (job.status === 'RUNNING') {
      res.status(400).json({ 
        error: 'Cannot delete running backtest. Cancel it first.',
        status: job.status
      });
      return;
    }
    
    this.activeJobs.delete(jobId);
    
    res.json({
      message: 'Backtest deleted successfully',
      jobId
    });
  }

  public async compareBacktests(req: Request, res: Response): Promise<void> {
    const { jobIds } = req.body;
    
    if (!Array.isArray(jobIds) || jobIds.length < 2) {
      res.status(400).json({ error: 'At least 2 job IDs required for comparison' });
      return;
    }
    
    const results: BacktestResult[] = [];
    const names: string[] = [];
    
    for (const jobId of jobIds) {
      const job = this.activeJobs.get(jobId);
      if (!job) {
        res.status(404).json({ error: `Backtest job ${jobId} not found` });
        return;
      }
      
      if (job.status !== 'COMPLETED' || !job.result) {
        res.status(400).json({ 
          error: `Backtest ${jobId} is not completed`,
          status: job.status
        });
        return;
      }
      
      results.push(job.result);
      names.push(job.name);
    }
    
    // Generate comparison
    const comparison = this.generateComparison(results, names);
    
    res.json(comparison);
  }

  public async exportBacktestData(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const { format = 'json' } = req.query;
    
    const job = this.activeJobs.get(jobId);
    
    if (!job) {
      res.status(404).json({ error: 'Backtest job not found' });
      return;
    }
    
    if (job.status !== 'COMPLETED' || !job.result) {
      res.status(400).json({ 
        error: 'Backtest not completed yet',
        status: job.status
      });
      return;
    }
    
    if (format === 'csv') {
      // For CSV export, we'd need to get the portfolio tracker data
      // This is a simplified implementation
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="backtest_${jobId}.csv"`);
      res.send('timestamp,total_value,daily_return,cumulative_return\n'); // Simplified
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="backtest_${jobId}.json"`);
      res.json(job.result);
    }
  }

  private async runBacktestJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;
    
    try {
      job.status = 'RUNNING';
      job.startTime = new Date();
      job.progress = 0;
      
      // Create data provider
      const dataProvider = DataProviderFactory.create(
        job.config.dataProvider.type,
        job.config.dataProvider.config
      );
      
      // Create backtest engine
      const engine = new BacktestEngine(
        job.config.config,
        job.config.agentConfigs,
        job.config.riskConfig
      );
      
      this.runningEngines.set(jobId, engine);
      
      // Set up progress tracking
      engine.on('backtestProgress', (data: { progress: number }) => {
        const currentJob = this.activeJobs.get(jobId);
        if (currentJob) {
          currentJob.progress = Math.round(data.progress * 100);
        }
      });
      
      // Load historical data
      const dataRequests: DataRequest[] = job.config.config.symbols.map(symbol => ({
        symbol,
        startDate: job.config.config.startDate,
        endDate: job.config.config.endDate,
        interval: '1d' // Default to daily data
      }));
      
      const historicalData = await dataProvider.fetchMultipleSymbols(dataRequests);
      await engine.loadHistoricalData(historicalData);
      
      // Run backtest
      const result = await engine.runBacktest();
      
      // Update job
      job.status = 'COMPLETED';
      job.progress = 100;
      job.endTime = new Date();
      job.result = result;
      
      this.runningEngines.delete(jobId);
      
    } catch (error) {
      job.status = 'FAILED';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.endTime = new Date();
      this.runningEngines.delete(jobId);
      throw error;
    }
  }

  private validateBacktestRequest(request: BacktestRequest): void {
    if (!request.name || request.name.trim().length === 0) {
      throw new Error('Backtest name is required');
    }
    
    if (!request.config) {
      throw new Error('Backtest config is required');
    }
    
    const { config } = request;
    
    if (!config.startDate || !config.endDate) {
      throw new Error('Start and end dates are required');
    }
    
    if (config.startDate >= config.endDate) {
      throw new Error('Start date must be before end date');
    }
    
    if (!config.symbols || config.symbols.length === 0) {
      throw new Error('At least one symbol is required');
    }
    
    if (!config.initialCapital || config.initialCapital <= 0) {
      throw new Error('Initial capital must be positive');
    }
    
    if (!request.agentConfigs || request.agentConfigs.length === 0) {
      throw new Error('At least one agent configuration is required');
    }
    
    if (!request.dataProvider || !request.dataProvider.type) {
      throw new Error('Data provider configuration is required');
    }
  }

  private generateComparison(results: BacktestResult[], names: string[]): any {
    const comparison = {
      summary: {
        backtests: names.map((name, i) => ({
          name,
          id: results[i].id,
          period: `${results[i].start_date.toISOString().split('T')[0]} to ${results[i].end_date.toISOString().split('T')[0]}`,
          initial_capital: results[i].initial_capital,
          final_capital: results[i].final_capital,
          total_return: results[i].total_return,
          max_drawdown: results[i].max_drawdown,
          sharpe_ratio: results[i].sharpe_ratio,
          total_trades: results[i].total_trades,
          win_rate: results[i].win_rate
        }))
      },
      rankings: {
        byReturn: [...results].sort((a, b) => b.total_return - a.total_return).map(r => r.id),
        bySharpe: [...results].sort((a, b) => b.sharpe_ratio - a.sharpe_ratio).map(r => r.id),
        byDrawdown: [...results].sort((a, b) => a.max_drawdown - b.max_drawdown).map(r => r.id),
        byWinRate: [...results].sort((a, b) => b.win_rate - a.win_rate).map(r => r.id)
      },
      statistics: {
        avgReturn: results.reduce((sum, r) => sum + r.total_return, 0) / results.length,
        avgSharpe: results.reduce((sum, r) => sum + r.sharpe_ratio, 0) / results.length,
        avgDrawdown: results.reduce((sum, r) => sum + r.max_drawdown, 0) / results.length,
        avgWinRate: results.reduce((sum, r) => sum + r.win_rate, 0) / results.length,
        bestPerformer: {
          byReturn: results.reduce((best, current) => current.total_return > best.total_return ? current : best),
          bySharpe: results.reduce((best, current) => current.sharpe_ratio > best.sharpe_ratio ? current : best)
        }
      }
    };
    
    return comparison;
  }
}