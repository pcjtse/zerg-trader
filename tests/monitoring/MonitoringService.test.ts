import { MonitoringService, Metric, Alert, ComponentHealth, SystemHealth } from '../../src/monitoring/MonitoringService';

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;

  beforeEach(() => {
    monitoringService = new MonitoringService();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Metric Recording', () => {
    it('should record metrics correctly', () => {
      const metric: Metric = {
        name: 'test_metric',
        value: 100,
        timestamp: new Date(),
        type: 'gauge'
      };

      const eventListener = jest.fn();
      monitoringService.on('metricRecorded', eventListener);

      monitoringService.recordMetric(metric);

      expect(eventListener).toHaveBeenCalledWith(metric);
    });

    it('should store metrics with correct keys', () => {
      const metric: Metric = {
        name: 'cpu_usage',
        value: 75.5,
        timestamp: new Date(),
        labels: { host: 'server1', region: 'us-east-1' },
        type: 'gauge'
      };

      monitoringService.recordMetric(metric);
      const retrievedMetrics = monitoringService.getMetrics('cpu_usage', { host: 'server1', region: 'us-east-1' });

      expect(retrievedMetrics).toHaveLength(1);
      expect(retrievedMetrics[0]).toEqual(metric);
    });

    it('should maintain metric history with size limit', () => {
      const maxMetricsPerKey = (monitoringService as any).maxMetricsPerKey;
      
      for (let i = 0; i < maxMetricsPerKey + 10; i++) {
        monitoringService.recordMetric({
          name: 'test_counter',
          value: i,
          timestamp: new Date(),
          type: 'counter'
        });
      }

      const metrics = monitoringService.getMetrics('test_counter');
      expect(metrics).toHaveLength(maxMetricsPerKey);
      expect(metrics[0].value).toBe(10); // First metric should be removed
    });

    it('should increment counter correctly', () => {
      monitoringService.incrementCounter('api_requests');
      monitoringService.incrementCounter('api_requests', 5);
      monitoringService.incrementCounter('api_requests', 3, { endpoint: '/users' });

      const allMetrics = monitoringService.getMetrics('api_requests');
      const labeledMetrics = monitoringService.getMetrics('api_requests', { endpoint: '/users' });

      expect(allMetrics).toHaveLength(2);
      expect(labeledMetrics).toHaveLength(1);
      expect(allMetrics[1].value).toBe(5);
      expect(labeledMetrics[0].value).toBe(3);
    });

    it('should set gauge values correctly', () => {
      monitoringService.setGauge('memory_usage', 1024);
      monitoringService.setGauge('memory_usage', 2048, { process: 'worker' });

      const unlabeledMetrics = monitoringService.getMetrics('memory_usage');
      const labeledMetrics = monitoringService.getMetrics('memory_usage', { process: 'worker' });

      expect(unlabeledMetrics).toHaveLength(1);
      expect(labeledMetrics).toHaveLength(1);
      expect(unlabeledMetrics[0].value).toBe(1024);
      expect(labeledMetrics[0].value).toBe(2048);
    });

    it('should record histogram values correctly', () => {
      monitoringService.recordHistogram('response_time', 250.5);
      monitoringService.recordHistogram('response_time', 150.2, { method: 'GET' });

      const unlabeledMetrics = monitoringService.getMetrics('response_time');
      const labeledMetrics = monitoringService.getMetrics('response_time', { method: 'GET' });

      expect(unlabeledMetrics).toHaveLength(1);
      expect(labeledMetrics).toHaveLength(1);
      expect(unlabeledMetrics[0].type).toBe('histogram');
      expect(labeledMetrics[0].type).toBe('histogram');
    });
  });

  describe('Execution Time Measurement', () => {
    it('should measure successful operation execution time', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await monitoringService.measureExecutionTime('test_operation', operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
      
      const metrics = monitoringService.getMetrics('execution_time_ms', {
        operation: 'test_operation',
        status: 'success'
      });
      expect(metrics).toHaveLength(1);
      expect(metrics[0].labels?.operation).toBe('test_operation');
      expect(metrics[0].labels?.status).toBe('success');
    });

    it('should measure failed operation execution time', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(
        monitoringService.measureExecutionTime('test_operation', operation)
      ).rejects.toThrow('Test error');
      
      const metrics = monitoringService.getMetrics('execution_time_ms', {
        operation: 'test_operation',
        status: 'error'
      });
      expect(metrics).toHaveLength(1);
      expect(metrics[0].labels?.operation).toBe('test_operation');
      expect(metrics[0].labels?.status).toBe('error');
    });

    it('should include custom labels in execution time metrics', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      await monitoringService.measureExecutionTime(
        'db_query',
        operation,
        { table: 'users', query_type: 'SELECT' }
      );
      
      const metrics = monitoringService.getMetrics('execution_time_ms', {
        operation: 'db_query',
        status: 'success',
        table: 'users',
        query_type: 'SELECT'
      });
      expect(metrics).toHaveLength(1);
      expect(metrics[0].labels?.table).toBe('users');
      expect(metrics[0].labels?.query_type).toBe('SELECT');
    });
  });

  describe('Metric Retrieval and Summary', () => {
    beforeEach(() => {
      // Add sample metrics
      for (let i = 0; i < 5; i++) {
        monitoringService.recordMetric({
          name: 'sample_metric',
          value: i * 10,
          timestamp: new Date(Date.now() - i * 1000),
          type: 'gauge'
        });
      }
    });

    it('should retrieve all metrics when no filter provided', () => {
      const allMetrics = monitoringService.getMetrics();
      expect(allMetrics.length).toBeGreaterThanOrEqual(5);
    });

    it('should retrieve metrics by name', () => {
      const metrics = monitoringService.getMetrics('sample_metric');
      expect(metrics).toHaveLength(5);
    });

    it('should return metrics sorted by timestamp (newest first)', () => {
      const metrics = monitoringService.getMetrics('sample_metric');
      for (let i = 1; i < metrics.length; i++) {
        expect(metrics[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          metrics[i].timestamp.getTime()
        );
      }
    });

    it('should calculate metric summary correctly', () => {
      const summary = monitoringService.getMetricSummary('sample_metric');
      
      expect(summary).not.toBeNull();
      expect(summary!.count).toBe(5);
      expect(summary!.sum).toBe(100); // 0 + 10 + 20 + 30 + 40
      expect(summary!.avg).toBe(20);
      expect(summary!.min).toBe(0);
      expect(summary!.max).toBe(40);
      expect(summary!.latest).toBe(0); // Most recent (newest timestamp)
    });

    it('should return null summary for non-existent metric', () => {
      const summary = monitoringService.getMetricSummary('non_existent_metric');
      expect(summary).toBeNull();
    });
  });

  describe('Alert Management', () => {
    it('should create alerts correctly', () => {
      const eventListener = jest.fn();
      monitoringService.on('alertCreated', eventListener);

      const alertId = monitoringService.createAlert({
        severity: 'error',
        component: 'trading_engine',
        message: 'High error rate detected'
      });

      expect(alertId).toBeDefined();
      expect(typeof alertId).toBe('string');
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: alertId,
          severity: 'error',
          component: 'trading_engine',
          message: 'High error rate detected',
          resolved: false
        })
      );
    });

    it('should resolve alerts correctly', () => {
      const eventListener = jest.fn();
      monitoringService.on('alertResolved', eventListener);

      const alertId = monitoringService.createAlert({
        severity: 'warning',
        component: 'data_feed',
        message: 'Connection timeout'
      });

      const resolved = monitoringService.resolveAlert(alertId);
      expect(resolved).toBe(true);

      const alert = monitoringService.getAlerts().find(a => a.id === alertId);
      expect(alert?.resolved).toBe(true);
      expect(alert?.resolvedAt).toBeInstanceOf(Date);
      expect(eventListener).toHaveBeenCalled();
    });

    it('should not resolve non-existent alert', () => {
      const resolved = monitoringService.resolveAlert('non-existent-id');
      expect(resolved).toBe(false);
    });

    it('should not resolve already resolved alert', () => {
      const alertId = monitoringService.createAlert({
        severity: 'info',
        component: 'test',
        message: 'Test alert'
      });

      monitoringService.resolveAlert(alertId);
      const secondResolve = monitoringService.resolveAlert(alertId);
      expect(secondResolve).toBe(false);
    });

    it('should filter alerts by resolved status', () => {
      const alert1Id = monitoringService.createAlert({
        severity: 'error',
        component: 'component1',
        message: 'Error 1'
      });

      const alert2Id = monitoringService.createAlert({
        severity: 'warning',
        component: 'component2',
        message: 'Warning 1'
      });

      monitoringService.resolveAlert(alert1Id);

      const unresolvedAlerts = monitoringService.getAlerts(false);
      const resolvedAlerts = monitoringService.getAlerts(true);

      expect(unresolvedAlerts).toHaveLength(1);
      expect(resolvedAlerts).toHaveLength(1);
      expect(unresolvedAlerts[0].id).toBe(alert2Id);
      expect(resolvedAlerts[0].id).toBe(alert1Id);
    });

    it('should return all alerts when no filter provided', () => {
      monitoringService.createAlert({
        severity: 'error',
        component: 'test1',
        message: 'Test 1'
      });

      monitoringService.createAlert({
        severity: 'warning',
        component: 'test2',
        message: 'Test 2'
      });

      const allAlerts = monitoringService.getAlerts();
      expect(allAlerts).toHaveLength(2);
    });
  });

  describe('Health Checks', () => {
    it('should register health check functions', () => {
      const healthCheckFn = jest.fn().mockResolvedValue({
        name: 'database',
        status: 'healthy' as const,
        lastCheck: new Date()
      });

      monitoringService.registerHealthCheck('database', healthCheckFn);
      expect(healthCheckFn).not.toHaveBeenCalled(); // Only registered, not called yet
    });

    it('should get system health with all healthy components', async () => {
      const dbHealthCheck = jest.fn().mockResolvedValue({
        name: 'database',
        status: 'healthy' as const,
        lastCheck: new Date()
      });

      const apiHealthCheck = jest.fn().mockResolvedValue({
        name: 'api',
        status: 'healthy' as const,
        lastCheck: new Date()
      });

      monitoringService.registerHealthCheck('database', dbHealthCheck);
      monitoringService.registerHealthCheck('api', apiHealthCheck);

      // Advance time to ensure uptime > 0
      jest.advanceTimersByTime(1000);

      const systemHealth = await monitoringService.getSystemHealth();

      expect(systemHealth.status).toBe('healthy');
      expect(systemHealth.components).toHaveLength(2);
      expect(systemHealth.uptime).toBeGreaterThanOrEqual(0);
      expect(systemHealth.timestamp).toBeInstanceOf(Date);
      expect(dbHealthCheck).toHaveBeenCalled();
      expect(apiHealthCheck).toHaveBeenCalled();
    });

    it('should determine degraded status with mixed health', async () => {
      const healthyCheck = jest.fn().mockResolvedValue({
        name: 'healthy_service',
        status: 'healthy' as const,
        lastCheck: new Date()
      });

      const degradedCheck = jest.fn().mockResolvedValue({
        name: 'degraded_service',
        status: 'degraded' as const,
        lastCheck: new Date(),
        message: 'Slow response times'
      });

      monitoringService.registerHealthCheck('healthy', healthyCheck);
      monitoringService.registerHealthCheck('degraded', degradedCheck);

      const systemHealth = await monitoringService.getSystemHealth();
      expect(systemHealth.status).toBe('degraded');
    });

    it('should determine unhealthy status with failing components', async () => {
      const healthyCheck = jest.fn().mockResolvedValue({
        name: 'healthy_service',
        status: 'healthy' as const,
        lastCheck: new Date()
      });

      const unhealthyCheck = jest.fn().mockResolvedValue({
        name: 'unhealthy_service',
        status: 'unhealthy' as const,
        lastCheck: new Date(),
        message: 'Service unavailable'
      });

      monitoringService.registerHealthCheck('healthy', healthyCheck);
      monitoringService.registerHealthCheck('unhealthy', unhealthyCheck);

      const systemHealth = await monitoringService.getSystemHealth();
      expect(systemHealth.status).toBe('unhealthy');
    });

    it('should handle health check errors gracefully', async () => {
      const failingCheck = jest.fn().mockRejectedValue(new Error('Connection failed'));

      monitoringService.registerHealthCheck('failing_service', failingCheck);

      const systemHealth = await monitoringService.getSystemHealth();
      
      expect(systemHealth.status).toBe('unhealthy');
      expect(systemHealth.components).toHaveLength(1);
      expect(systemHealth.components[0].status).toBe('unhealthy');
      expect(systemHealth.components[0].message).toBe('Connection failed');
    });

    it('should return healthy status with no health checks', async () => {
      const systemHealth = await monitoringService.getSystemHealth();
      expect(systemHealth.status).toBe('healthy');
      expect(systemHealth.components).toHaveLength(0);
    });
  });

  describe('Metric Key Generation', () => {
    it('should generate correct keys for metrics without labels', () => {
      monitoringService.recordMetric({
        name: 'simple_metric',
        value: 100,
        timestamp: new Date(),
        type: 'counter'
      });

      const metrics = monitoringService.getMetrics('simple_metric');
      expect(metrics).toHaveLength(1);
    });

    it('should generate correct keys for metrics with labels', () => {
      monitoringService.recordMetric({
        name: 'labeled_metric',
        value: 100,
        timestamp: new Date(),
        labels: { service: 'api', version: '1.0' },
        type: 'counter'
      });

      const metrics = monitoringService.getMetrics('labeled_metric', { service: 'api', version: '1.0' });
      expect(metrics).toHaveLength(1);
    });

    it('should differentiate metrics with different label combinations', () => {
      monitoringService.recordMetric({
        name: 'requests',
        value: 100,
        timestamp: new Date(),
        labels: { method: 'GET', status: '200' },
        type: 'counter'
      });

      monitoringService.recordMetric({
        name: 'requests',
        value: 50,
        timestamp: new Date(),
        labels: { method: 'POST', status: '200' },
        type: 'counter'
      });

      const getMetrics = monitoringService.getMetrics('requests', { method: 'GET', status: '200' });
      const postMetrics = monitoringService.getMetrics('requests', { method: 'POST', status: '200' });

      expect(getMetrics).toHaveLength(1);
      expect(postMetrics).toHaveLength(1);
      expect(getMetrics[0].value).toBe(100);
      expect(postMetrics[0].value).toBe(50);
    });
  });

  describe('Metrics Export', () => {
    beforeEach(() => {
      monitoringService.recordMetric({
        name: 'export_test',
        value: 123.45,
        timestamp: new Date('2024-01-01T12:00:00Z'),
        labels: { env: 'test' },
        type: 'gauge'
      });

      monitoringService.recordMetric({
        name: 'export_counter',
        value: 456,
        timestamp: new Date('2024-01-01T12:01:00Z'),
        type: 'counter'
      });
    });

    it('should export metrics in correct format', () => {
      const exportData = monitoringService.getMetricsForExport();
      
      expect(exportData).toHaveProperty('export_test{env=test}');
      expect(exportData).toHaveProperty('export_counter');
      
      expect(exportData['export_test{env=test}'].value).toBe(123.45);
      expect(exportData['export_test{env=test}'].type).toBe('gauge');
      expect(exportData['export_test{env=test}'].labels).toEqual({ env: 'test' });
      
      expect(exportData['export_counter'].value).toBe(456);
      expect(exportData['export_counter'].type).toBe('counter');
    });

    it('should export only latest values for each metric key', () => {
      // Add multiple values for same metric
      monitoringService.recordMetric({
        name: 'changing_gauge',
        value: 100,
        timestamp: new Date('2024-01-01T12:00:00Z'),
        type: 'gauge'
      });

      monitoringService.recordMetric({
        name: 'changing_gauge',
        value: 200,
        timestamp: new Date('2024-01-01T12:01:00Z'),
        type: 'gauge'
      });

      const exportData = monitoringService.getMetricsForExport();
      expect(exportData['changing_gauge'].value).toBe(200);
    });
  });

  describe('Periodic Tasks', () => {
    it('should run periodic metric cleanup', () => {
      // Create a new monitoring service to test periodic tasks
      const testService = new MonitoringService();
      const cleanupSpy = jest.spyOn(testService as any, 'cleanupOldMetrics');
      
      // Fast forward 1 minute
      jest.advanceTimersByTime(60000);
      
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should run periodic system metrics recording', () => {
      // Create a new monitoring service to test periodic tasks
      const testService = new MonitoringService();
      const systemMetricsSpy = jest.spyOn(testService as any, 'recordSystemMetrics');
      
      // Fast forward 30 seconds
      jest.advanceTimersByTime(30000);
      
      expect(systemMetricsSpy).toHaveBeenCalled();
    });

    it('should record system metrics', () => {
      (monitoringService as any).recordSystemMetrics();
      
      const memoryMetrics = monitoringService.getMetrics('system_memory_used_bytes');
      const uptimeMetrics = monitoringService.getMetrics('system_uptime_seconds');
      
      expect(memoryMetrics.length).toBeGreaterThan(0);
      expect(uptimeMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('Metric Cleanup', () => {
    it('should remove old metrics beyond retention period', () => {
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const recentTimestamp = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      
      monitoringService.recordMetric({
        name: 'old_metric',
        value: 100,
        timestamp: oldTimestamp,
        type: 'counter'
      });

      monitoringService.recordMetric({
        name: 'old_metric',
        value: 200,
        timestamp: recentTimestamp,
        type: 'counter'
      });

      (monitoringService as any).cleanupOldMetrics();

      const metrics = monitoringService.getMetrics('old_metric');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(200);
    });

    it('should remove metric keys with no remaining data', () => {
      const veryOldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000);
      
      monitoringService.recordMetric({
        name: 'temp_metric',
        value: 100,
        timestamp: veryOldTimestamp,
        type: 'counter'
      });

      (monitoringService as any).cleanupOldMetrics();

      const metrics = monitoringService.getMetrics('temp_metric');
      expect(metrics).toHaveLength(0);
    });
  });
});