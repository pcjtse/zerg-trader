import EventEmitter from 'events';
import { performance } from 'perf_hooks';

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: Date;
  components: ComponentHealth[];
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  message?: string;
  metrics?: Record<string, number>;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export class MonitoringService extends EventEmitter {
  private metrics: Map<string, Metric[]> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private healthChecks: Map<string, () => Promise<ComponentHealth>> = new Map();
  private startTime: Date = new Date();
  private metricsRetentionHours: number = 24;
  private maxMetricsPerKey: number = 1000;

  constructor() {
    super();
    this.setupPeriodicTasks();
  }

  recordMetric(metric: Metric): void {
    const key = this.getMetricKey(metric.name, metric.labels);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const metricArray = this.metrics.get(key)!;
    metricArray.push(metric);
    
    if (metricArray.length > this.maxMetricsPerKey) {
      metricArray.shift();
    }
    
    this.emit('metricRecorded', metric);
  }

  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.recordMetric({
      name,
      value,
      timestamp: new Date(),
      labels,
      type: 'counter'
    });
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric({
      name,
      value,
      timestamp: new Date(),
      labels,
      type: 'gauge'
    });
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric({
      name,
      value,
      timestamp: new Date(),
      labels,
      type: 'histogram'
    });
  }

  async measureExecutionTime<T>(
    operation: string,
    fn: () => Promise<T>,
    labels?: Record<string, string>
  ): Promise<T> {
    const start = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordHistogram(`execution_time_ms`, duration, {
        operation,
        status: 'success',
        ...labels
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.recordHistogram(`execution_time_ms`, duration, {
        operation,
        status: 'error',
        ...labels
      });
      
      throw error;
    }
  }

  getMetrics(name?: string, labels?: Record<string, string>): Metric[] {
    if (name) {
      const key = this.getMetricKey(name, labels);
      return this.metrics.get(key) || [];
    }
    
    const allMetrics: Metric[] = [];
    for (const metricArray of this.metrics.values()) {
      allMetrics.push(...metricArray);
    }
    
    return allMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getMetricSummary(name: string, labels?: Record<string, string>): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    latest: number;
  } | null {
    const metrics = this.getMetrics(name, labels);
    
    if (metrics.length === 0) {
      return null;
    }
    
    const values = metrics.map(m => m.value);
    
    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: values[0]
    };
  }

  createAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): string {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullAlert: Alert = {
      ...alert,
      id,
      timestamp: new Date(),
      resolved: false
    };
    
    this.alerts.set(id, fullAlert);
    this.emit('alertCreated', fullAlert);
    
    return id;
  }

  resolveAlert(id: string): boolean {
    const alert = this.alerts.get(id);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  getAlerts(resolved?: boolean): Alert[] {
    const alerts = Array.from(this.alerts.values());
    
    if (resolved !== undefined) {
      return alerts.filter(alert => alert.resolved === resolved);
    }
    
    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  registerHealthCheck(name: string, checkFn: () => Promise<ComponentHealth>): void {
    this.healthChecks.set(name, checkFn);
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const components: ComponentHealth[] = [];
    
    for (const [name, checkFn] of this.healthChecks) {
      try {
        const health = await checkFn();
        components.push(health);
      } catch (error) {
        components.push({
          name,
          status: 'unhealthy',
          lastCheck: new Date(),
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const overallStatus = this.determineOverallStatus(components);
    const uptime = Date.now() - this.startTime.getTime();
    
    return {
      status: overallStatus,
      uptime,
      timestamp: new Date(),
      components
    };
  }

  private determineOverallStatus(components: ComponentHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
    if (components.length === 0) return 'healthy';
    
    const unhealthyCount = components.filter(c => c.status === 'unhealthy').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;
    
    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    
    return 'healthy';
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    
    const sortedLabels = Object.keys(labels)
      .sort()
      .map(key => `${key}=${labels[key]}`)
      .join(',');
    
    return `${name}{${sortedLabels}}`;
  }

  private setupPeriodicTasks(): void {
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 60000);

    setInterval(() => {
      this.recordSystemMetrics();
    }, 30000);
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - this.metricsRetentionHours * 60 * 60 * 1000);
    
    for (const [key, metricArray] of this.metrics.entries()) {
      const filteredMetrics = metricArray.filter(metric => metric.timestamp > cutoffTime);
      
      if (filteredMetrics.length === 0) {
        this.metrics.delete(key);
      } else {
        this.metrics.set(key, filteredMetrics);
      }
    }
  }

  private recordSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.setGauge('system_memory_used_bytes', memUsage.heapUsed);
    this.setGauge('system_memory_total_bytes', memUsage.heapTotal);
    this.setGauge('system_memory_external_bytes', memUsage.external);
    this.setGauge('system_uptime_seconds', process.uptime());
    
    if (process.cpuUsage) {
      const cpuUsage = process.cpuUsage();
      this.setGauge('system_cpu_user_microseconds', cpuUsage.user);
      this.setGauge('system_cpu_system_microseconds', cpuUsage.system);
    }
  }

  getMetricsForExport(): Record<string, any> {
    const exportData: Record<string, any> = {};
    
    for (const [key, metricArray] of this.metrics.entries()) {
      if (metricArray.length > 0) {
        const latest = metricArray[metricArray.length - 1];
        exportData[key] = {
          value: latest.value,
          timestamp: latest.timestamp,
          type: latest.type,
          labels: latest.labels
        };
      }
    }
    
    return exportData;
  }
}

export const monitoringService = new MonitoringService();