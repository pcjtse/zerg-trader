import { MonitoringService } from './MonitoringService';
import { Signal, Trade, Portfolio, Position } from '../types';

export class TradingMetrics {
  constructor(private monitoring: MonitoringService) {}

  recordSignalGenerated(signal: Signal): void {
    this.monitoring.incrementCounter('signals_generated_total', 1, {
      agent: signal.agent_id,
      symbol: signal.symbol,
      action: signal.action
    });

    this.monitoring.setGauge('signal_confidence', signal.confidence, {
      agent: signal.agent_id,
      symbol: signal.symbol,
      action: signal.action
    });

    this.monitoring.setGauge('signal_strength', signal.strength, {
      agent: signal.agent_id,
      symbol: signal.symbol,
      action: signal.action
    });
  }

  recordTradeExecuted(trade: Trade): void {
    this.monitoring.incrementCounter('trades_executed_total', 1, {
      symbol: trade.symbol,
      action: trade.action,
      status: trade.status
    });

    this.monitoring.setGauge('trade_quantity', trade.quantity, {
      symbol: trade.symbol,
      action: trade.action
    });

    this.monitoring.setGauge('trade_price', trade.price, {
      symbol: trade.symbol,
      action: trade.action
    });

    const tradeValue = trade.quantity * trade.price;
    this.monitoring.recordHistogram('trade_value_usd', tradeValue, {
      symbol: trade.symbol,
      action: trade.action
    });
  }

  recordPortfolioUpdate(portfolio: Portfolio): void {
    this.monitoring.setGauge('portfolio_total_value', portfolio.total_value);
    this.monitoring.setGauge('portfolio_cash', portfolio.cash);
    this.monitoring.setGauge('portfolio_daily_pnl', portfolio.daily_pnl);
    this.monitoring.setGauge('portfolio_total_pnl', portfolio.total_pnl);
    this.monitoring.setGauge('portfolio_positions_count', portfolio.positions.length);

    const investedValue = portfolio.total_value - portfolio.cash;
    this.monitoring.setGauge('portfolio_invested_value', investedValue);
    
    if (portfolio.total_value > 0) {
      const cashRatio = portfolio.cash / portfolio.total_value;
      this.monitoring.setGauge('portfolio_cash_ratio', cashRatio);
    }
  }

  recordPositionMetrics(positions: Position[]): void {
    let totalUnrealizedPnl = 0;
    let totalRealizedPnl = 0;
    let positivePositions = 0;
    let negativePositions = 0;

    positions.forEach(position => {
      totalUnrealizedPnl += position.unrealized_pnl;
      totalRealizedPnl += position.realized_pnl;

      if (position.unrealized_pnl > 0) {
        positivePositions++;
      } else if (position.unrealized_pnl < 0) {
        negativePositions++;
      }

      this.monitoring.setGauge('position_unrealized_pnl', position.unrealized_pnl, {
        symbol: position.symbol
      });

      this.monitoring.setGauge('position_quantity', position.quantity, {
        symbol: position.symbol
      });

      this.monitoring.setGauge('position_current_price', position.current_price, {
        symbol: position.symbol
      });

      const positionValue = Math.abs(position.quantity * position.current_price);
      this.monitoring.setGauge('position_value', positionValue, {
        symbol: position.symbol
      });
    });

    this.monitoring.setGauge('positions_total_unrealized_pnl', totalUnrealizedPnl);
    this.monitoring.setGauge('positions_total_realized_pnl', totalRealizedPnl);
    this.monitoring.setGauge('positions_profitable_count', positivePositions);
    this.monitoring.setGauge('positions_unprofitable_count', negativePositions);
  }

  recordAgentPerformance(agentId: string, analysisTimeMs: number, signalsGenerated: number): void {
    this.monitoring.recordHistogram('agent_analysis_duration_ms', analysisTimeMs, {
      agent: agentId
    });

    this.monitoring.incrementCounter('agent_analysis_total', 1, {
      agent: agentId
    });

    this.monitoring.setGauge('agent_signals_per_analysis', signalsGenerated, {
      agent: agentId
    });
  }

  recordMarketDataUpdate(symbol: string, processingTimeMs: number): void {
    this.monitoring.recordHistogram('market_data_processing_ms', processingTimeMs, {
      symbol
    });

    this.monitoring.incrementCounter('market_data_updates_total', 1, {
      symbol
    });
  }

  recordApiCall(endpoint: string, method: string, statusCode: number, durationMs: number): void {
    this.monitoring.recordHistogram('api_request_duration_ms', durationMs, {
      endpoint,
      method,
      status_code: statusCode.toString()
    });

    this.monitoring.incrementCounter('api_requests_total', 1, {
      endpoint,
      method,
      status_code: statusCode.toString()
    });
  }

  recordRiskEvent(eventType: string, severity: string, symbol?: string): void {
    this.monitoring.incrementCounter('risk_events_total', 1, {
      event_type: eventType,
      severity,
      symbol: symbol || 'portfolio'
    });
  }

  recordBacktestMetrics(backtestId: string, duration: number, totalTrades: number, finalReturn: number): void {
    this.monitoring.recordHistogram('backtest_duration_ms', duration, {
      backtest_id: backtestId
    });

    this.monitoring.setGauge('backtest_total_trades', totalTrades, {
      backtest_id: backtestId
    });

    this.monitoring.setGauge('backtest_final_return', finalReturn, {
      backtest_id: backtestId
    });

    this.monitoring.incrementCounter('backtests_completed_total', 1);
  }

  recordErrorEvent(component: string, errorType: string, message: string): void {
    this.monitoring.incrementCounter('errors_total', 1, {
      component,
      error_type: errorType
    });

    this.monitoring.createAlert({
      severity: 'error',
      component,
      message: `${errorType}: ${message}`
    });
  }

  getTradingMetricsSummary(): Record<string, any> {
    return {
      signals: {
        total: this.monitoring.getMetricSummary('signals_generated_total'),
        by_action: {
          buy: this.monitoring.getMetricSummary('signals_generated_total', { action: 'BUY' }),
          sell: this.monitoring.getMetricSummary('signals_generated_total', { action: 'SELL' }),
          hold: this.monitoring.getMetricSummary('signals_generated_total', { action: 'HOLD' })
        }
      },
      trades: {
        total: this.monitoring.getMetricSummary('trades_executed_total'),
        value: this.monitoring.getMetricSummary('trade_value_usd')
      },
      portfolio: {
        value: this.monitoring.getMetrics('portfolio_total_value').slice(0, 1)[0]?.value || 0,
        cash: this.monitoring.getMetrics('portfolio_cash').slice(0, 1)[0]?.value || 0,
        pnl: this.monitoring.getMetrics('portfolio_total_pnl').slice(0, 1)[0]?.value || 0,
        positions: this.monitoring.getMetrics('portfolio_positions_count').slice(0, 1)[0]?.value || 0
      },
      performance: {
        api_latency: this.monitoring.getMetricSummary('api_request_duration_ms'),
        agent_analysis: this.monitoring.getMetricSummary('agent_analysis_duration_ms'),
        errors: this.monitoring.getMetricSummary('errors_total')
      }
    };
  }
}