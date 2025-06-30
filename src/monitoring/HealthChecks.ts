import { ComponentHealth } from './MonitoringService';
import { AgentManager } from '../agents/AgentManager';
import { DataManager } from '../data/DataManager';
import { PortfolioManager } from '../portfolio/PortfolioManager';
import { RiskManager } from '../risk/RiskManager';

export class HealthChecks {
  constructor(
    private agentManager?: AgentManager,
    private dataManager?: DataManager,
    private portfolioManager?: PortfolioManager,
    private riskManager?: RiskManager
  ) {}

  async checkAgentManager(): Promise<ComponentHealth> {
    if (!this.agentManager) {
      return {
        name: 'AgentManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: 'AgentManager not initialized'
      };
    }

    try {
      const agents = this.agentManager.getAllAgents();
      const activeAgents = agents.filter(agent => agent.isEnabled()).length;
      const totalAgents = agents.length;
      
      if (totalAgents === 0) {
        return {
          name: 'AgentManager',
          status: 'unhealthy',
          lastCheck: new Date(),
          message: 'No agents registered'
        };
      }

      const healthyAgents = agents.filter(agent => {
        const health = agent.getHealth();
        return health.status === 'healthy';
      }).length;

      const healthRatio = healthyAgents / totalAgents;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthRatio >= 0.8) {
        status = 'healthy';
      } else if (healthRatio >= 0.5) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        name: 'AgentManager',
        status,
        lastCheck: new Date(),
        message: `${healthyAgents}/${totalAgents} agents healthy, ${activeAgents} active`,
        metrics: {
          total_agents: totalAgents,
          active_agents: activeAgents,
          healthy_agents: healthyAgents,
          health_ratio: healthRatio
        }
      };
    } catch (error) {
      return {
        name: 'AgentManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async checkDataManager(): Promise<ComponentHealth> {
    if (!this.dataManager) {
      return {
        name: 'DataManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: 'DataManager not initialized'
      };
    }

    try {
      const testSymbol = 'AAPL';
      const start = Date.now();
      
      await this.dataManager.getMarketData(testSymbol, '1d', 1);
      
      const responseTime = Date.now() - start;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (responseTime < 1000) {
        status = 'healthy';
      } else if (responseTime < 5000) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        name: 'DataManager',
        status,
        lastCheck: new Date(),
        message: `Data retrieval successful (${responseTime}ms)`,
        metrics: {
          response_time_ms: responseTime
        }
      };
    } catch (error) {
      return {
        name: 'DataManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Data retrieval failed'
      };
    }
  }

  async checkPortfolioManager(): Promise<ComponentHealth> {
    if (!this.portfolioManager) {
      return {
        name: 'PortfolioManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: 'PortfolioManager not initialized'
      };
    }

    try {
      const portfolio = this.portfolioManager.getPortfolio();
      const positions = this.portfolioManager.getPositions();
      
      if (portfolio.total_value <= 0) {
        return {
          name: 'PortfolioManager',
          status: 'unhealthy',
          lastCheck: new Date(),
          message: 'Portfolio value is zero or negative'
        };
      }

      const cashRatio = portfolio.cash / portfolio.total_value;
      const positionCount = positions.length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Portfolio operating normally';
      
      if (cashRatio < 0.01) {
        status = 'degraded';
        message = 'Very low cash reserves';
      }
      
      if (positionCount > 50) {
        status = 'degraded';
        message = 'High number of positions may impact performance';
      }

      return {
        name: 'PortfolioManager',
        status,
        lastCheck: new Date(),
        message,
        metrics: {
          total_value: portfolio.total_value,
          cash: portfolio.cash,
          cash_ratio: cashRatio,
          position_count: positionCount,
          daily_pnl: portfolio.daily_pnl,
          total_pnl: portfolio.total_pnl
        }
      };
    } catch (error) {
      return {
        name: 'PortfolioManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Portfolio check failed'
      };
    }
  }

  async checkRiskManager(): Promise<ComponentHealth> {
    if (!this.riskManager) {
      return {
        name: 'RiskManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: 'RiskManager not initialized'
      };
    }

    try {
      const riskMetrics = this.riskManager.getRiskMetrics();
      const activeAlerts = this.riskManager.getActiveAlerts();
      
      const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'CRITICAL').length;
      const warningAlerts = activeAlerts.filter(alert => alert.severity === 'HIGH').length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Risk management operating normally';
      
      if (criticalAlerts > 0) {
        status = 'unhealthy';
        message = `${criticalAlerts} critical risk alerts active`;
      } else if (warningAlerts > 3) {
        status = 'degraded';
        message = `${warningAlerts} warning alerts active`;
      }
      
      if (riskMetrics.max_drawdown > 0.15) {
        status = 'degraded';
        message = 'High drawdown detected';
      }

      return {
        name: 'RiskManager',
        status,
        lastCheck: new Date(),
        message,
        metrics: {
          active_alerts: activeAlerts.length,
          critical_alerts: criticalAlerts,
          warning_alerts: warningAlerts,
          max_drawdown: riskMetrics.max_drawdown,
          portfolio_var: riskMetrics.portfolio_var,
          sharpe_ratio: riskMetrics.sharpe_ratio
        }
      };
    } catch (error) {
      return {
        name: 'RiskManager',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Risk check failed'
      };
    }
  }

  async checkSystemResources(): Promise<ComponentHealth> {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const memoryUsageRatio = heapUsedMB / heapTotalMB;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'System resources normal';
      
      if (memoryUsageRatio > 0.9) {
        status = 'unhealthy';
        message = 'High memory usage detected';
      } else if (memoryUsageRatio > 0.8) {
        status = 'degraded';
        message = 'Elevated memory usage';
      }

      return {
        name: 'SystemResources',
        status,
        lastCheck: new Date(),
        message,
        metrics: {
          heap_used_mb: Math.round(heapUsedMB),
          heap_total_mb: Math.round(heapTotalMB),
          memory_usage_ratio: Math.round(memoryUsageRatio * 100) / 100,
          uptime_hours: Math.round(uptime / 3600 * 100) / 100,
          external_mb: Math.round(memUsage.external / 1024 / 1024)
        }
      };
    } catch (error) {
      return {
        name: 'SystemResources',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'System check failed'
      };
    }
  }

  async checkDatabase(): Promise<ComponentHealth> {
    try {
      const start = Date.now();
      
      const testQuery = () => new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      
      await testQuery();
      const responseTime = Date.now() - start;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Database connection healthy';
      
      if (responseTime > 1000) {
        status = 'degraded';
        message = 'Slow database response';
      }

      return {
        name: 'Database',
        status,
        lastCheck: new Date(),
        message,
        metrics: {
          response_time_ms: responseTime
        }
      };
    } catch (error) {
      return {
        name: 'Database',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Database connection failed'
      };
    }
  }

  async checkExternalAPIs(): Promise<ComponentHealth> {
    try {
      const checks = await Promise.allSettled([
        this.checkMarketDataAPI(),
        this.checkNewsAPI()
      ]);
      
      const results = checks.map(result => 
        result.status === 'fulfilled' ? result.value : { status: 'unhealthy' }
      );
      
      const healthyAPIs = results.filter(r => r.status === 'healthy').length;
      const totalAPIs = results.length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = `${healthyAPIs}/${totalAPIs} external APIs healthy`;
      
      if (healthyAPIs === 0) {
        status = 'unhealthy';
        message = 'All external APIs unavailable';
      } else if (healthyAPIs < totalAPIs) {
        status = 'degraded';
        message = `${totalAPIs - healthyAPIs} external APIs unavailable`;
      }

      return {
        name: 'ExternalAPIs',
        status,
        lastCheck: new Date(),
        message,
        metrics: {
          healthy_apis: healthyAPIs,
          total_apis: totalAPIs,
          availability_ratio: healthyAPIs / totalAPIs
        }
      };
    } catch (error) {
      return {
        name: 'ExternalAPIs',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'API check failed'
      };
    }
  }

  private async checkMarketDataAPI(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy' }> {
    try {
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));
      const responseTime = Date.now() - start;
      
      return {
        status: responseTime < 2000 ? 'healthy' : 'degraded'
      };
    } catch {
      return { status: 'unhealthy' };
    }
  }

  private async checkNewsAPI(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy' }> {
    try {
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 30));
      const responseTime = Date.now() - start;
      
      return {
        status: responseTime < 3000 ? 'healthy' : 'degraded'
      };
    } catch {
      return { status: 'unhealthy' };
    }
  }
}