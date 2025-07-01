import { BacktestController, BacktestRequest, BacktestJob } from '../../src/backtesting/BacktestController';
import { BacktestEngine } from '../../src/backtesting/BacktestEngine';
import { DataProviderFactory } from '../../src/backtesting/HistoricalDataProvider';
import { Request, Response } from 'express';

// Mock dependencies
jest.mock('../../src/backtesting/BacktestEngine');
jest.mock('../../src/backtesting/HistoricalDataProvider');

describe('BacktestController', () => {
  let controller: BacktestController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockBacktestRequest: BacktestRequest;

  beforeEach(() => {
    controller = new BacktestController();
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };

    mockBacktestRequest = {
      name: 'Test Backtest',
      description: 'A test backtest',
      config: {
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        symbols: ['AAPL', 'MSFT'],
        initialCapital: 100000,
        commission: 0.001,
        slippage: 0.0001,
        dataSource: 'historical' as const
      },
      agentConfigs: [{
        id: 'test-agent',
        name: 'Test Agent',
        type: 'TECHNICAL',
        enabled: true,
        parameters: {},
        weight: 1.0
      }],
      riskConfig: {
        maxPositionSize: 0.1,
        stopLoss: 0.05
      },
      dataProvider: {
        type: 'mock',
        config: {}
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBacktest', () => {
    beforeEach(() => {
      mockRequest = {
        body: mockBacktestRequest
      };
    });

    it('should create a backtest successfully', async () => {
      const mockDataProvider = {
        fetchMultipleSymbols: jest.fn().mockResolvedValue(new Map())
      };
      
      const mockEngine = {
        on: jest.fn(),
        loadHistoricalData: jest.fn().mockResolvedValue(undefined),
        runBacktest: jest.fn().mockResolvedValue({
          id: 'test-result',
          total_return: 0.15,
          sharpe_ratio: 1.2
        })
      };

      (DataProviderFactory.create as jest.Mock).mockReturnValue(mockDataProvider);
      (BacktestEngine as unknown as jest.Mock).mockImplementation(() => mockEngine);

      await controller.createBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: expect.any(String),
          status: expect.stringMatching(/^(PENDING|RUNNING)$/),
          message: 'Backtest job created and queued'
        })
      );
    });

    it('should reject backtest with invalid name', async () => {
      mockRequest.body.name = '';

      await controller.createBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Backtest name is required'
        })
      );
    });

    it('should reject backtest with missing config', async () => {
      delete mockRequest.body.config;

      await controller.createBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Backtest config is required'
        })
      );
    });

    it('should reject backtest with invalid date range', async () => {
      mockRequest.body.config.startDate = new Date('2023-12-31');
      mockRequest.body.config.endDate = new Date('2023-01-01');

      await controller.createBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Start date must be before end date'
        })
      );
    });

    it('should reject backtest with no symbols', async () => {
      mockRequest.body.config.symbols = [];

      await controller.createBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'At least one symbol is required'
        })
      );
    });

    it('should reject backtest with invalid initial capital', async () => {
      mockRequest.body.config.initialCapital = -1000;

      await controller.createBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Initial capital must be positive'
        })
      );
    });

    it('should reject backtest when maximum concurrent jobs reached', async () => {
      // Create multiple jobs to reach the limit
      const maxConcurrent = (controller as any).maxConcurrentJobs;
      
      // Set up running jobs
      for (let i = 0; i < maxConcurrent; i++) {
        const job: BacktestJob = {
          id: `job-${i}`,
          name: `Job ${i}`,
          status: 'RUNNING',
          progress: 50,
          config: mockBacktestRequest
        };
        (controller as any).activeJobs.set(job.id, job);
      }

      await controller.createBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Maximum concurrent backtests reached. Please try again later.',
          maxConcurrent,
          currentRunning: maxConcurrent
        })
      );
    });
  });

  describe('getBacktestStatus', () => {
    it('should return backtest status successfully', async () => {
      const jobId = 'test-job-id';
      const job: BacktestJob = {
        id: jobId,
        name: 'Test Job',
        status: 'RUNNING',
        progress: 75,
        startTime: new Date(),
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set(jobId, job);

      mockRequest = {
        params: { jobId }
      };

      await controller.getBacktestStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: jobId,
          name: 'Test Job',
          status: 'RUNNING',
          progress: 75,
          startTime: job.startTime
        })
      );
    });

    it('should return 404 for non-existent job', async () => {
      mockRequest = {
        params: { jobId: 'non-existent' }
      };

      await controller.getBacktestStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Backtest job not found'
        })
      );
    });
  });

  describe('getBacktestResult', () => {
    it('should return backtest result for completed job', async () => {
      const jobId = 'completed-job';
      const mockResult = {
        id: 'result-id',
        start_date: new Date('2023-01-01'),
        end_date: new Date('2023-12-31'),
        initial_capital: 100000,
        final_capital: 115000,
        total_return: 0.15,
        max_drawdown: 0.08,
        sharpe_ratio: 1.2,
        total_trades: 50,
        winning_trades: 30,
        win_rate: 0.6,
        trades: []
      };

      const job: BacktestJob = {
        id: jobId,
        name: 'Completed Job',
        status: 'COMPLETED',
        progress: 100,
        result: mockResult,
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set(jobId, job);

      mockRequest = {
        params: { jobId }
      };

      await controller.getBacktestResult(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 400 for incomplete backtest', async () => {
      const jobId = 'running-job';
      const job: BacktestJob = {
        id: jobId,
        name: 'Running Job',
        status: 'RUNNING',
        progress: 50,
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set(jobId, job);

      mockRequest = {
        params: { jobId }
      };

      await controller.getBacktestResult(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Backtest not completed yet',
          status: 'RUNNING',
          progress: 50
        })
      );
    });
  });

  describe('getAllBacktests', () => {
    beforeEach(() => {
      // Set up multiple jobs with different statuses
      const jobs: BacktestJob[] = [
        {
          id: 'job-1',
          name: 'Job 1',
          status: 'COMPLETED',
          progress: 100,
          startTime: new Date('2023-01-01'),
          config: mockBacktestRequest
        },
        {
          id: 'job-2',
          name: 'Job 2',
          status: 'RUNNING',
          progress: 75,
          startTime: new Date('2023-01-02'),
          config: mockBacktestRequest
        },
        {
          id: 'job-3',
          name: 'Job 3',
          status: 'FAILED',
          progress: 25,
          startTime: new Date('2023-01-03'),
          error: 'Test error',
          config: mockBacktestRequest
        }
      ];

      jobs.forEach(job => {
        (controller as any).activeJobs.set(job.id, job);
      });
    });

    it('should return all backtests', async () => {
      mockRequest = {
        query: {}
      };

      await controller.getAllBacktests(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jobs: expect.arrayContaining([
            expect.objectContaining({ id: 'job-1', status: 'COMPLETED' }),
            expect.objectContaining({ id: 'job-2', status: 'RUNNING' }),
            expect.objectContaining({ id: 'job-3', status: 'FAILED' })
          ]),
          total: 3,
          running: 1,
          completed: 1,
          failed: 1
        })
      );
    });

    it('should filter backtests by status', async () => {
      mockRequest = {
        query: { status: 'completed' }
      };

      await controller.getAllBacktests(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jobs: [expect.objectContaining({ id: 'job-1', status: 'COMPLETED' })],
          total: 1
        })
      );
    });

    it('should apply limit to results', async () => {
      mockRequest = {
        query: { limit: '2' }
      };

      await controller.getAllBacktests(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 2
        })
      );
    });
  });

  describe('cancelBacktest', () => {
    it('should cancel running backtest successfully', async () => {
      const jobId = 'running-job';
      const job: BacktestJob = {
        id: jobId,
        name: 'Running Job',
        status: 'RUNNING',
        progress: 50,
        config: mockBacktestRequest
      };

      const mockEngine = {
        stop: jest.fn()
      };

      (controller as any).activeJobs.set(jobId, job);
      (controller as any).runningEngines.set(jobId, mockEngine);

      mockRequest = {
        params: { jobId }
      };

      await controller.cancelBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockEngine.stop).toHaveBeenCalled();
      expect(job.status).toBe('CANCELLED');
      expect(job.endTime).toBeInstanceOf(Date);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Backtest cancelled successfully',
          jobId,
          status: 'CANCELLED'
        })
      );
    });

    it('should not cancel completed backtest', async () => {
      const jobId = 'completed-job';
      const job: BacktestJob = {
        id: jobId,
        name: 'Completed Job',
        status: 'COMPLETED',
        progress: 100,
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set(jobId, job);

      mockRequest = {
        params: { jobId }
      };

      await controller.cancelBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Cannot cancel backtest',
          status: 'COMPLETED'
        })
      );
    });
  });

  describe('deleteBacktest', () => {
    it('should delete completed backtest successfully', async () => {
      const jobId = 'completed-job';
      const job: BacktestJob = {
        id: jobId,
        name: 'Completed Job',
        status: 'COMPLETED',
        progress: 100,
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set(jobId, job);

      mockRequest = {
        params: { jobId }
      };

      await controller.deleteBacktest(mockRequest as Request, mockResponse as Response);

      expect((controller as any).activeJobs.has(jobId)).toBe(false);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Backtest deleted successfully',
          jobId
        })
      );
    });

    it('should not delete running backtest', async () => {
      const jobId = 'running-job';
      const job: BacktestJob = {
        id: jobId,
        name: 'Running Job',
        status: 'RUNNING',
        progress: 50,
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set(jobId, job);

      mockRequest = {
        params: { jobId }
      };

      await controller.deleteBacktest(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Cannot delete running backtest. Cancel it first.',
          status: 'RUNNING'
        })
      );
    });
  });

  describe('compareBacktests', () => {
    beforeEach(() => {
      const results = [
        {
          id: 'result-1',
          start_date: new Date('2023-01-01'),
          end_date: new Date('2023-12-31'),
          initial_capital: 100000,
          final_capital: 115000,
          total_return: 0.15,
          max_drawdown: 0.08,
          sharpe_ratio: 1.2,
          total_trades: 50,
          winning_trades: 30,
          win_rate: 0.6,
          trades: []
        },
        {
          id: 'result-2',
          start_date: new Date('2023-01-01'),
          end_date: new Date('2023-12-31'),
          initial_capital: 100000,
          final_capital: 110000,
          total_return: 0.10,
          max_drawdown: 0.05,
          sharpe_ratio: 1.0,
          total_trades: 40,
          winning_trades: 26,
          win_rate: 0.65,
          trades: []
        }
      ];

      const jobs: BacktestJob[] = [
        {
          id: 'job-1',
          name: 'Backtest 1',
          status: 'COMPLETED',
          progress: 100,
          result: results[0],
          config: mockBacktestRequest
        },
        {
          id: 'job-2',
          name: 'Backtest 2',
          status: 'COMPLETED',
          progress: 100,
          result: results[1],
          config: mockBacktestRequest
        }
      ];

      jobs.forEach(job => {
        (controller as any).activeJobs.set(job.id, job);
      });
    });

    it('should compare backtests successfully', async () => {
      mockRequest = {
        body: { jobIds: ['job-1', 'job-2'] }
      };

      await controller.compareBacktests(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            backtests: expect.arrayContaining([
              expect.objectContaining({ name: 'Backtest 1', total_return: 0.15 }),
              expect.objectContaining({ name: 'Backtest 2', total_return: 0.10 })
            ])
          }),
          rankings: expect.objectContaining({
            byReturn: expect.any(Array),
            bySharpe: expect.any(Array),
            byDrawdown: expect.any(Array),
            byWinRate: expect.any(Array)
          }),
          statistics: expect.objectContaining({
            avgReturn: expect.any(Number),
            avgSharpe: expect.any(Number)
          })
        })
      );
    });

    it('should reject comparison with insufficient job IDs', async () => {
      mockRequest = {
        body: { jobIds: ['job-1'] }
      };

      await controller.compareBacktests(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'At least 2 job IDs required for comparison'
        })
      );
    });

    it('should reject comparison with non-completed jobs', async () => {
      const runningJob: BacktestJob = {
        id: 'job-3',
        name: 'Running Job',
        status: 'RUNNING',
        progress: 50,
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set('job-3', runningJob);

      mockRequest = {
        body: { jobIds: ['job-1', 'job-3'] }
      };

      await controller.compareBacktests(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Backtest job-3 is not completed',
          status: 'RUNNING'
        })
      );
    });
  });

  describe('exportBacktestData', () => {
    beforeEach(() => {
      const job: BacktestJob = {
        id: 'export-job',
        name: 'Export Job',
        status: 'COMPLETED',
        progress: 100,
        result: {
          id: 'result-id',
          start_date: new Date('2023-01-01'),
          end_date: new Date('2023-12-31'),
          initial_capital: 100000,
          final_capital: 115000,
          total_return: 0.15,
          max_drawdown: 0.08,
          sharpe_ratio: 1.2,
          total_trades: 50,
          winning_trades: 30,
          win_rate: 0.6,
          trades: []
        },
        config: mockBacktestRequest
      };

      (controller as any).activeJobs.set('export-job', job);
    });

    it('should export backtest data as JSON', async () => {
      mockRequest = {
        params: { jobId: 'export-job' },
        query: { format: 'json' }
      };

      await controller.exportBacktestData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="backtest_export-job.json"'
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'result-id',
          total_return: 0.15,
          sharpe_ratio: 1.2
        })
      );
    });

    it('should export backtest data as CSV', async () => {
      mockRequest = {
        params: { jobId: 'export-job' },
        query: { format: 'csv' }
      };

      await controller.exportBacktestData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="backtest_export-job.csv"'
      );
      expect(mockResponse.send).toHaveBeenCalledWith(expect.stringContaining('timestamp,total_value'));
    });

    it('should return 404 for non-existent job', async () => {
      mockRequest = {
        params: { jobId: 'non-existent' },
        query: {}
      };

      await controller.exportBacktestData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Backtest job not found'
        })
      );
    });
  });

  describe('Validation', () => {
    it('should validate backtest request correctly', () => {
      expect(() => {
        (controller as any).validateBacktestRequest(mockBacktestRequest);
      }).not.toThrow();
    });

    it('should reject request with missing dates', () => {
      const invalidRequest = { ...mockBacktestRequest };
      invalidRequest.config = { ...invalidRequest.config } as any;
      delete (invalidRequest.config as any).startDate;

      expect(() => {
        (controller as any).validateBacktestRequest(invalidRequest);
      }).toThrow('Start and end dates are required');
    });

    it('should reject request with no agent configs', () => {
      const invalidRequest = { ...mockBacktestRequest };
      invalidRequest.agentConfigs = [];

      expect(() => {
        (controller as any).validateBacktestRequest(invalidRequest);
      }).toThrow('At least one agent configuration is required');
    });

    it('should reject request with missing data provider', () => {
      const invalidRequest = { ...mockBacktestRequest };
      invalidRequest.dataProvider = { ...invalidRequest.dataProvider } as any;
      delete (invalidRequest.dataProvider as any).type;

      expect(() => {
        (controller as any).validateBacktestRequest(invalidRequest);
      }).toThrow('Data provider configuration is required');
    });
  });
});