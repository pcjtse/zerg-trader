// UI Management for ZergTrader
class ZergTraderUI {
    constructor() {
        this.currentPage = 'dashboard';
        this.systemRunning = false;
        this.toastContainer = null;
        this.loadingOverlay = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupElements();
        this.loadInitialData();
    }

    setupElements() {
        this.toastContainer = document.getElementById('toast-container');
        this.loadingOverlay = document.getElementById('loading-overlay');
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateToPage(page);
            });
        });

        // System toggle
        const systemToggle = document.getElementById('system-toggle');
        systemToggle?.addEventListener('click', () => {
            this.toggleSystem();
        });

        // Dashboard refresh
        const refreshDashboard = document.getElementById('refresh-dashboard');
        refreshDashboard?.addEventListener('click', () => {
            this.refreshDashboard();
        });

        // Portfolio rebalance
        const rebalancePortfolio = document.getElementById('rebalance-portfolio');
        rebalancePortfolio?.addEventListener('click', () => {
            this.rebalancePortfolio();
        });

        // Backtest controls
        const newBacktest = document.getElementById('new-backtest');
        newBacktest?.addEventListener('click', () => {
            this.showBacktestConfig();
        });

        const cancelBacktest = document.getElementById('cancel-backtest');
        cancelBacktest?.addEventListener('click', () => {
            this.hideBacktestConfig();
        });

        const backtestForm = document.getElementById('backtest-form');
        backtestForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitBacktest();
        });

        // Chart timeframe selector
        const chartTimeframe = document.getElementById('chart-timeframe');
        chartTimeframe?.addEventListener('change', (e) => {
            this.updateChartTimeframe(e.target.value);
        });

        // Trade search and filter
        const tradeSearch = document.getElementById('trade-search');
        tradeSearch?.addEventListener('input', (e) => {
            this.filterTrades(e.target.value);
        });

        const tradeFilter = document.getElementById('trade-filter');
        tradeFilter?.addEventListener('change', (e) => {
            this.filterTrades(document.getElementById('trade-search').value, e.target.value);
        });
    }

    // Navigation
    navigateToPage(pageName) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // Show selected page
        const targetPage = document.getElementById(`${pageName}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${pageName}"]`)?.classList.add('active');

        this.currentPage = pageName;

        // Load page-specific data
        this.loadPageData(pageName);
    }

    // Load initial data
    async loadInitialData() {
        this.showLoading();
        
        try {
            await Promise.all([
                this.loadDashboardData(),
                this.loadSystemStatus()
            ]);
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showToast('Failed to load initial data', 'error');
        } finally {
            this.hideLoading();
        }
    }

    // Load page-specific data
    async loadPageData(pageName) {
        try {
            switch (pageName) {
                case 'dashboard':
                    await this.loadDashboardData();
                    break;
                case 'portfolio':
                    await this.loadPortfolioData();
                    break;
                case 'backtesting':
                    await this.loadBacktestingData();
                    break;
                case 'agents':
                    await this.loadAgentsData();
                    break;
                case 'risk':
                    await this.loadRiskData();
                    break;
                case 'trades':
                    await this.loadTradesData();
                    break;
            }
        } catch (error) {
            console.error(`Failed to load ${pageName} data:`, error);
            this.showToast(`Failed to load ${pageName} data`, 'error');
        }
    }

    // Dashboard data loading
    async loadDashboardData() {
        try {
            const [portfolio, performance, agents, riskMetrics] = await Promise.all([
                window.api.getPortfolio(),
                window.api.getPerformance(),
                window.api.getAgents(),
                window.api.getRiskMetrics()
            ]);

            this.updatePortfolioSummary(portfolio, performance);
            this.updateAgentsList(agents);
            this.updateRiskMetrics(riskMetrics);
            
            // Load recent signals and trades
            const trades = await window.api.getTrades(10);
            this.updateRecentSignals([]); // Placeholder for signals
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    }

    // Portfolio data loading
    async loadPortfolioData() {
        try {
            const [positions, portfolio] = await Promise.all([
                window.api.getPositions(),
                window.api.getPortfolio()
            ]);

            this.updatePositionsTable(positions);
            
            // Update allocation chart
            if (window.charts?.updateAllocationChart) {
                await window.charts.updateAllocationChart();
            }
        } catch (error) {
            console.error('Failed to load portfolio data:', error);
        }
    }

    // Backtesting data loading
    async loadBacktestingData() {
        try {
            const backtests = await window.api.getAllBacktests({ limit: 20 });
            this.updateBacktestJobs(backtests.jobs || []);
        } catch (error) {
            console.error('Failed to load backtesting data:', error);
        }
    }

    // Agents data loading
    async loadAgentsData() {
        try {
            const agents = await window.api.getAgents();
            this.updateAgentsContainer(agents);
        } catch (error) {
            console.error('Failed to load agents data:', error);
        }
    }

    // Risk data loading
    async loadRiskData() {
        try {
            const [riskMetrics, riskAlerts] = await Promise.all([
                window.api.getRiskMetrics(),
                window.api.getRiskAlerts()
            ]);

            this.updateRiskAlerts(riskAlerts);
            
            // Update risk charts
            if (window.charts?.riskMetricsChart) {
                // Chart will be updated automatically
            }
        } catch (error) {
            console.error('Failed to load risk data:', error);
        }
    }

    // Trades data loading
    async loadTradesData() {
        try {
            const trades = await window.api.getTrades(100);
            this.updateTradesTable(trades);
        } catch (error) {
            console.error('Failed to load trades data:', error);
        }
    }

    // System status loading
    async loadSystemStatus() {
        try {
            const health = await window.api.getHealth();
            this.updateSystemStatus(health);
        } catch (error) {
            console.error('Failed to load system status:', error);
        }
    }

    // Update UI components
    updatePortfolioSummary(portfolio, performance) {
        // Update metric values
        document.getElementById('total-value').textContent = APIUtils.formatCurrency(portfolio.total_value);
        document.getElementById('cash-value').textContent = APIUtils.formatCurrency(portfolio.cash);
        document.getElementById('daily-pnl').textContent = APIUtils.formatCurrency(portfolio.daily_pnl);
        document.getElementById('total-pnl').textContent = APIUtils.formatCurrency(portfolio.total_pnl);

        // Update change indicators
        const dailyPnlChange = document.getElementById('daily-pnl-change');
        if (dailyPnlChange) {
            const changePercent = (portfolio.daily_pnl / (portfolio.total_value - portfolio.daily_pnl)) * 100;
            dailyPnlChange.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
            dailyPnlChange.className = `metric-change ${APIUtils.getChangeColor(changePercent)}`;
        }

        const totalPnlChange = document.getElementById('total-pnl-change');
        if (totalPnlChange) {
            const changePercent = (portfolio.total_pnl / 100000) * 100; // Assuming 100k initial
            totalPnlChange.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
            totalPnlChange.className = `metric-change ${APIUtils.getChangeColor(changePercent)}`;
        }
    }

    updateAgentsList(agents) {
        const agentsList = document.getElementById('agent-list');
        if (!agentsList) return;

        agentsList.innerHTML = '';
        
        agents.forEach(agent => {
            const agentElement = document.createElement('div');
            agentElement.className = 'agent-item';
            agentElement.dataset.agentId = agent.id;
            
            agentElement.innerHTML = `
                <div class="agent-info">
                    <div class="agent-status ${agent.enabled ? 'running' : 'stopped'}"></div>
                    <div>
                        <div class="agent-name">${agent.name}</div>
                        <div class="agent-type">${agent.type}</div>
                    </div>
                </div>
                <div class="agent-controls">
                    <button class="btn btn-sm ${agent.enabled ? 'btn-danger' : 'btn-primary'}" 
                            onclick="UI.toggleAgent('${agent.id}', ${agent.enabled})">
                        ${agent.enabled ? 'Stop' : 'Start'}
                    </button>
                </div>
            `;
            
            agentsList.appendChild(agentElement);
        });
    }

    updateRiskMetrics(riskMetrics) {
        document.getElementById('sharpe-ratio').textContent = riskMetrics.sharpe_ratio?.toFixed(2) || '0.00';
        document.getElementById('max-drawdown').textContent = APIUtils.formatPercentage(riskMetrics.max_drawdown || 0);
        document.getElementById('portfolio-var').textContent = APIUtils.formatPercentage(riskMetrics.portfolio_var || 0);
        document.getElementById('portfolio-beta').textContent = riskMetrics.beta?.toFixed(2) || '0.00';
    }

    updatePositionsTable(positions) {
        const table = document.getElementById('positions-table');
        if (!table) return;

        const tbody = table.getElementsByTagName('tbody')[0];
        tbody.innerHTML = '';

        positions.forEach(position => {
            const row = document.createElement('tr');
            const marketValue = position.quantity * position.current_price;
            const unrealizedPnL = position.unrealized_pnl;
            const weight = (marketValue / 100000) * 100; // Assuming portfolio value

            row.innerHTML = `
                <td>${position.symbol}</td>
                <td>${APIUtils.formatNumber(position.quantity, 0)}</td>
                <td>${APIUtils.formatCurrency(position.entry_price)}</td>
                <td>${APIUtils.formatCurrency(position.current_price)}</td>
                <td>${APIUtils.formatCurrency(marketValue)}</td>
                <td class="${APIUtils.getChangeColor(unrealizedPnL)}">${APIUtils.formatCurrency(unrealizedPnL)}</td>
                <td>${weight.toFixed(1)}%</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    updateTradesTable(trades) {
        const table = document.getElementById('trades-table');
        if (!table) return;

        const tbody = table.getElementsByTagName('tbody')[0];
        tbody.innerHTML = '';

        trades.forEach(trade => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${APIUtils.formatDate(trade.timestamp)}</td>
                <td>${trade.symbol}</td>
                <td class="signal-action ${trade.action}">${trade.action}</td>
                <td>${APIUtils.formatNumber(trade.quantity, 0)}</td>
                <td>${APIUtils.formatCurrency(trade.price)}</td>
                <td>${APIUtils.formatCurrency(trade.quantity * trade.price)}</td>
                <td><span class="status ${trade.status.toLowerCase()}">${trade.status}</span></td>
                <td>${trade.agent_signals.join(', ')}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateSystemStatus(health) {
        this.systemRunning = health.status === 'running';
        
        // Update system toggle button
        const systemToggle = document.getElementById('system-toggle');
        if (systemToggle) {
            systemToggle.innerHTML = `<i class="fas fa-power-off"></i> ${this.systemRunning ? 'Stop' : 'Start'} System`;
            systemToggle.className = `btn ${this.systemRunning ? 'btn-danger' : 'btn-primary'}`;
        }

        // Update system status indicators
        document.getElementById('system-status').textContent = health.status;
        document.getElementById('system-status').className = `status ${health.status}`;
        
        if (health.agents) {
            document.getElementById('active-agents').textContent = `${health.agents.runningAgents}/${health.agents.totalAgents}`;
        }
    }

    updateBacktestJobs(jobs) {
        const container = document.getElementById('backtest-jobs');
        if (!container) return;

        container.innerHTML = '';

        jobs.forEach(job => {
            const jobElement = document.createElement('div');
            jobElement.className = 'backtest-job';
            jobElement.dataset.jobId = job.id;
            
            jobElement.innerHTML = `
                <div class="job-info">
                    <div class="job-name">${job.name}</div>
                    <div class="job-status">${job.status} - ${job.progress}%</div>
                </div>
                <div class="job-progress">
                    <div class="job-progress-bar" style="width: ${job.progress}%"></div>
                </div>
                <div class="job-actions">
                    ${job.status === 'RUNNING' ? `
                        <button class="btn btn-sm btn-danger" onclick="UI.cancelBacktest('${job.id}')">
                            <i class="fas fa-stop"></i>
                        </button>
                    ` : ''}
                    ${job.status === 'COMPLETED' ? `
                        <button class="btn btn-sm btn-primary" onclick="UI.viewBacktestResult('${job.id}')">
                            <i class="fas fa-chart-line"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="UI.deleteBacktest('${job.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(jobElement);
        });
    }

    updateAgentsContainer(agents) {
        const container = document.getElementById('agents-container');
        if (!container) return;

        container.innerHTML = '';

        agents.forEach(agent => {
            const agentCard = document.createElement('div');
            agentCard.className = 'agent-card';
            agentCard.dataset.agentId = agent.id;
            
            agentCard.innerHTML = `
                <div class="agent-card-header">
                    <div>
                        <div class="agent-name">${agent.name}</div>
                        <div class="agent-type">${agent.type}</div>
                    </div>
                    <div class="agent-status ${agent.enabled ? 'running' : 'stopped'}"></div>
                </div>
                <div class="agent-card-body">
                    <div class="agent-metrics">
                        <div class="agent-metric">
                            <div class="agent-metric-label">Weight</div>
                            <div class="agent-metric-value">${(agent.weight * 100).toFixed(1)}%</div>
                        </div>
                        <div class="agent-metric">
                            <div class="agent-metric-label">Health</div>
                            <div class="agent-metric-value">${agent.health || 'Good'}</div>
                        </div>
                    </div>
                    <div class="agent-controls">
                        <button class="btn ${agent.enabled ? 'btn-danger' : 'btn-primary'}" 
                                onclick="UI.toggleAgent('${agent.id}', ${agent.enabled})">
                            ${agent.enabled ? 'Stop' : 'Start'}
                        </button>
                    </div>
                </div>
            `;
            
            container.appendChild(agentCard);
        });
    }

    updateRiskAlerts(alerts) {
        const container = document.getElementById('risk-alerts');
        if (!container) return;

        container.innerHTML = '';

        if (alerts.length === 0) {
            container.innerHTML = '<div class="no-alerts">No active risk alerts</div>';
            return;
        }

        alerts.forEach(alert => {
            const alertElement = document.createElement('div');
            alertElement.className = `alert-item ${alert.severity.toLowerCase()}`;
            
            alertElement.innerHTML = `
                <div class="alert-header">
                    <span class="alert-type">${alert.type}</span>
                    <span class="alert-severity">${alert.severity}</span>
                </div>
                <div class="alert-message">${alert.message}</div>
                <button class="btn btn-sm btn-secondary" onclick="UI.resolveRiskAlert('${alert.id}')">
                    Resolve
                </button>
            `;
            
            container.appendChild(alertElement);
        });
    }

    // System actions
    async toggleSystem() {
        this.showLoading();
        
        try {
            if (this.systemRunning) {
                await window.api.stopSystem();
                this.showToast('System stopped', 'info');
            } else {
                await window.api.startSystem();
                this.showToast('System started', 'success');
            }
            
            await this.loadSystemStatus();
        } catch (error) {
            const message = APIUtils.handleError(error, 'System toggle');
            this.showToast(message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async refreshDashboard() {
        this.showLoading();
        
        try {
            await this.loadDashboardData();
            this.showToast('Dashboard refreshed', 'success');
        } catch (error) {
            const message = APIUtils.handleError(error, 'Dashboard refresh');
            this.showToast(message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async rebalancePortfolio() {
        this.showLoading();
        
        try {
            const result = await window.api.rebalancePortfolio();
            if (result.success) {
                this.showToast(`Portfolio rebalanced: ${result.trades?.length || 0} trades executed`, 'success');
                await this.loadPortfolioData();
            } else {
                this.showToast(result.error || 'Rebalancing failed', 'error');
            }
        } catch (error) {
            const message = APIUtils.handleError(error, 'Portfolio rebalance');
            this.showToast(message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    // Agent actions
    async toggleAgent(agentId, currentlyEnabled) {
        try {
            if (currentlyEnabled) {
                await window.api.stopAgent(agentId);
                this.showToast('Agent stopped', 'info');
            } else {
                await window.api.startAgent(agentId);
                this.showToast('Agent started', 'success');
            }
            
            // Refresh agents data
            if (this.currentPage === 'agents') {
                await this.loadAgentsData();
            } else {
                await this.loadDashboardData();
            }
        } catch (error) {
            const message = APIUtils.handleError(error, 'Agent toggle');
            this.showToast(message, 'error');
        }
    }

    // Backtest actions
    showBacktestConfig() {
        document.getElementById('backtest-config').style.display = 'block';
        
        // Set default dates
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        
        document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
        document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
    }

    hideBacktestConfig() {
        document.getElementById('backtest-config').style.display = 'none';
    }

    async submitBacktest() {
        const form = document.getElementById('backtest-form');
        const formData = new FormData(form);
        
        const config = {
            name: formData.get('backtest-name') || document.getElementById('backtest-name').value,
            config: {
                startDate: new Date(document.getElementById('start-date').value),
                endDate: new Date(document.getElementById('end-date').value),
                initialCapital: parseFloat(document.getElementById('initial-capital').value),
                symbols: document.getElementById('symbols').value.split(',').map(s => s.trim()),
                commission: 1.0,
                slippage: 0.001,
                dataSource: 'mock'
            },
            agentConfigs: [], // Would be populated from agent settings
            riskConfig: {},
            dataProvider: {
                type: document.getElementById('data-provider').value
            }
        };

        try {
            const result = await window.api.createBacktest(config);
            this.showToast('Backtest started', 'success');
            this.hideBacktestConfig();
            await this.loadBacktestingData();
        } catch (error) {
            const message = APIUtils.handleError(error, 'Backtest creation');
            this.showToast(message, 'error');
        }
    }

    async cancelBacktest(jobId) {
        try {
            await window.api.cancelBacktest(jobId);
            this.showToast('Backtest cancelled', 'info');
            await this.loadBacktestingData();
        } catch (error) {
            const message = APIUtils.handleError(error, 'Backtest cancellation');
            this.showToast(message, 'error');
        }
    }

    async deleteBacktest(jobId) {
        if (!confirm('Are you sure you want to delete this backtest?')) return;
        
        try {
            await window.api.deleteBacktest(jobId);
            this.showToast('Backtest deleted', 'info');
            await this.loadBacktestingData();
        } catch (error) {
            const message = APIUtils.handleError(error, 'Backtest deletion');
            this.showToast(message, 'error');
        }
    }

    async viewBacktestResult(jobId) {
        try {
            const result = await window.api.getBacktestResult(jobId);
            console.log('Backtest result:', result);
            // TODO: Show result in modal or detailed view
            this.showToast('Backtest result loaded', 'info');
        } catch (error) {
            const message = APIUtils.handleError(error, 'Backtest result');
            this.showToast(message, 'error');
        }
    }

    // Risk actions
    async resolveRiskAlert(alertId) {
        try {
            await window.api.resolveRiskAlert(alertId);
            this.showToast('Risk alert resolved', 'success');
            await this.loadRiskData();
        } catch (error) {
            const message = APIUtils.handleError(error, 'Risk alert resolution');
            this.showToast(message, 'error');
        }
    }

    // Utility functions
    showLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('show');
        }
    }

    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('show');
        }
    }

    showToast(message, type = 'info', duration = 5000) {
        if (!this.toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.toastContainer.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    updateChartTimeframe(timeframe) {
        // TODO: Update chart data based on timeframe
        console.log('Updating chart timeframe to:', timeframe);
    }

    filterTrades(searchTerm, actionFilter = '') {
        const table = document.getElementById('trades-table');
        if (!table) return;

        const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
        
        Array.from(rows).forEach(row => {
            const symbol = row.cells[1].textContent.toLowerCase();
            const action = row.cells[2].textContent;
            
            const matchesSearch = !searchTerm || symbol.includes(searchTerm.toLowerCase());
            const matchesFilter = !actionFilter || action === actionFilter;
            
            row.style.display = matchesSearch && matchesFilter ? '' : 'none';
        });
    }

    updateRecentSignals(signals) {
        const signalsList = document.getElementById('signals-list');
        if (!signalsList) return;

        signalsList.innerHTML = '';

        if (signals.length === 0) {
            signalsList.innerHTML = '<div class="no-signals">No recent signals</div>';
            return;
        }

        signals.forEach(signal => {
            const signalElement = document.createElement('div');
            signalElement.className = 'signal-item';
            signalElement.innerHTML = `
                <div class="signal-info">
                    <div class="signal-symbol">${signal.symbol}</div>
                    <div class="signal-action ${signal.action}">${signal.action}</div>
                    <div class="signal-confidence">Confidence: ${(signal.confidence * 100).toFixed(1)}%</div>
                </div>
                <div class="signal-time">${APIUtils.formatRelativeTime(signal.timestamp)}</div>
            `;
            signalsList.appendChild(signalElement);
        });
    }
}

// Initialize UI when DOM is loaded
let UI = null;

document.addEventListener('DOMContentLoaded', () => {
    UI = new ZergTraderUI();
    
    // Make UI available globally
    window.UI = UI;
});