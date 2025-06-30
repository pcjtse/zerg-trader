// Chart management for ZergTrader UI
class ZergTraderCharts {
    constructor() {
        this.charts = {};
        this.defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#e6edf3',
                        font: {
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto'
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8b949e' },
                    grid: { color: '#30363d' }
                },
                y: {
                    ticks: { color: '#8b949e' },
                    grid: { color: '#30363d' }
                }
            }
        };
    }

    // Initialize all charts
    async init() {
        await this.initPerformanceChart();
        await this.initAllocationChart();
        await this.initBacktestComparisonChart();
        await this.initRiskMetricsChart();
    }

    // Performance Chart (Line Chart)
    async initPerformanceChart() {
        const ctx = document.getElementById('performance-chart');
        if (!ctx) return;

        try {
            const performanceData = await this.getPerformanceData();
            
            this.charts.performanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: performanceData.labels,
                    datasets: [{
                        label: 'Portfolio Value',
                        data: performanceData.values,
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88, 166, 255, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        borderWidth: 2
                    }]
                },
                options: {
                    ...this.defaultOptions,
                    scales: {
                        ...this.defaultOptions.scales,
                        y: {
                            ...this.defaultOptions.scales.y,
                            ticks: {
                                ...this.defaultOptions.scales.y.ticks,
                                callback: function(value) {
                                    return '$' + value.toLocaleString();
                                }
                            }
                        }
                    },
                    plugins: {
                        ...this.defaultOptions.plugins,
                        tooltip: {
                            backgroundColor: 'rgba(33, 38, 45, 0.9)',
                            titleColor: '#e6edf3',
                            bodyColor: '#e6edf3',
                            borderColor: '#30363d',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    return 'Value: ' + APIUtils.formatCurrency(context.parsed.y);
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to initialize performance chart:', error);
        }
    }

    // Portfolio Allocation Chart (Doughnut Chart)
    async initAllocationChart() {
        const ctx = document.getElementById('allocation-chart');
        if (!ctx) return;

        try {
            const allocationData = await this.getAllocationData();
            
            this.charts.allocationChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: allocationData.labels,
                    datasets: [{
                        data: allocationData.values,
                        backgroundColor: [
                            '#58a6ff',
                            '#56d364',
                            '#f85149',
                            '#d29922',
                            '#8b5cf6',
                            '#06b6d4',
                            '#10b981',
                            '#f59e0b'
                        ],
                        borderColor: '#161b22',
                        borderWidth: 2
                    }]
                },
                options: {
                    ...this.defaultOptions,
                    plugins: {
                        ...this.defaultOptions.plugins,
                        tooltip: {
                            backgroundColor: 'rgba(33, 38, 45, 0.9)',
                            titleColor: '#e6edf3',
                            bodyColor: '#e6edf3',
                            borderColor: '#30363d',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.parsed / total) * 100).toFixed(1);
                                    return `${context.label}: ${percentage}% (${APIUtils.formatCurrency(context.parsed)})`;
                                }
                            }
                        },
                        legend: {
                            position: 'right',
                            labels: {
                                color: '#e6edf3',
                                padding: 20,
                                usePointStyle: true
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to initialize allocation chart:', error);
        }
    }

    // Backtest Comparison Chart (Multiple Line Chart)
    async initBacktestComparisonChart() {
        const ctx = document.getElementById('backtest-comparison-chart');
        if (!ctx) return;

        this.charts.backtestComparisonChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                ...this.defaultOptions,
                scales: {
                    ...this.defaultOptions.scales,
                    y: {
                        ...this.defaultOptions.scales.y,
                        ticks: {
                            ...this.defaultOptions.scales.y.ticks,
                            callback: function(value) {
                                return APIUtils.formatPercentage(value / 100);
                            }
                        }
                    }
                },
                plugins: {
                    ...this.defaultOptions.plugins,
                    tooltip: {
                        backgroundColor: 'rgba(33, 38, 45, 0.9)',
                        titleColor: '#e6edf3',
                        bodyColor: '#e6edf3',
                        borderColor: '#30363d',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${APIUtils.formatPercentage(context.parsed.y / 100)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Risk Metrics Chart (Radar Chart)
    async initRiskMetricsChart() {
        const ctx = document.getElementById('risk-metrics-chart');
        if (!ctx) return;

        try {
            const riskData = await this.getRiskMetricsData();
            
            this.charts.riskMetricsChart = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: riskData.labels,
                    datasets: [{
                        label: 'Current Portfolio',
                        data: riskData.values,
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88, 166, 255, 0.1)',
                        pointBackgroundColor: '#58a6ff',
                        pointBorderColor: '#58a6ff',
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#e6edf3'
                            }
                        }
                    },
                    scales: {
                        r: {
                            beginAtZero: true,
                            ticks: {
                                color: '#8b949e'
                            },
                            grid: {
                                color: '#30363d'
                            },
                            angleLines: {
                                color: '#30363d'
                            },
                            pointLabels: {
                                color: '#e6edf3'
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to initialize risk metrics chart:', error);
        }
    }

    // Update performance chart with new data point
    addPerformanceDataPoint(data) {
        const chart = this.charts.performanceChart;
        if (!chart) return;

        const timestamp = new Date(data.timestamp);
        const label = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(data.totalValue);

        // Keep only last 50 data points
        if (chart.data.labels.length > 50) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }

        chart.update('none');
    }

    // Update allocation chart with new positions
    async updateAllocationChart() {
        const chart = this.charts.allocationChart;
        if (!chart) return;

        try {
            const allocationData = await this.getAllocationData();
            chart.data.labels = allocationData.labels;
            chart.data.datasets[0].data = allocationData.values;
            chart.update();
        } catch (error) {
            console.error('Failed to update allocation chart:', error);
        }
    }

    // Add backtest to comparison chart
    addBacktestToComparison(backtest) {
        const chart = this.charts.backtestComparisonChart;
        if (!chart) return;

        const colors = ['#58a6ff', '#56d364', '#f85149', '#d29922', '#8b5cf6'];
        const colorIndex = chart.data.datasets.length % colors.length;

        const dataset = {
            label: backtest.name,
            data: backtest.performanceData,
            borderColor: colors[colorIndex],
            backgroundColor: colors[colorIndex] + '20',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            borderWidth: 2
        };

        if (chart.data.datasets.length === 0) {
            chart.data.labels = backtest.labels;
        }

        chart.data.datasets.push(dataset);
        chart.update();
    }

    // Remove backtest from comparison chart
    removeBacktestFromComparison(backtestName) {
        const chart = this.charts.backtestComparisonChart;
        if (!chart) return;

        const datasetIndex = chart.data.datasets.findIndex(ds => ds.label === backtestName);
        if (datasetIndex >= 0) {
            chart.data.datasets.splice(datasetIndex, 1);
            chart.update();
        }
    }

    // Get performance data from API
    async getPerformanceData() {
        try {
            const performance = await window.api.getPerformance();
            return {
                labels: performance.timestamps?.map(ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) || [],
                values: performance.values || []
            };
        } catch (error) {
            console.warn('Failed to fetch performance data, using mock data');
            return this.getMockPerformanceData();
        }
    }

    // Get allocation data from API
    async getAllocationData() {
        try {
            const positions = await window.api.getPositions();
            const portfolio = await window.api.getPortfolio();
            
            const labels = [];
            const values = [];
            
            positions.forEach(position => {
                const value = position.quantity * position.current_price;
                labels.push(position.symbol);
                values.push(value);
            });
            
            // Add cash as a position
            if (portfolio.cash > 0) {
                labels.push('Cash');
                values.push(portfolio.cash);
            }
            
            return { labels, values };
        } catch (error) {
            console.warn('Failed to fetch allocation data, using mock data');
            return this.getMockAllocationData();
        }
    }

    // Get risk metrics data from API
    async getRiskMetricsData() {
        try {
            const riskMetrics = await window.api.getRiskMetrics();
            return {
                labels: ['Sharpe Ratio', 'Sortino Ratio', 'Max Drawdown', 'VaR', 'Beta', 'Alpha'],
                values: [
                    Math.max(0, Math.min(riskMetrics.sharpe_ratio * 10, 100)),
                    Math.max(0, Math.min(riskMetrics.sortino_ratio * 10, 100)),
                    Math.max(0, Math.min((1 - riskMetrics.max_drawdown) * 100, 100)),
                    Math.max(0, Math.min((1 - riskMetrics.portfolio_var) * 100, 100)),
                    Math.max(0, Math.min(riskMetrics.beta * 50, 100)),
                    Math.max(0, Math.min((riskMetrics.alpha + 0.1) * 500, 100))
                ]
            };
        } catch (error) {
            console.warn('Failed to fetch risk metrics, using mock data');
            return this.getMockRiskMetricsData();
        }
    }

    // Mock data generators for development/fallback
    getMockPerformanceData() {
        const labels = [];
        const values = [];
        const baseValue = 100000;
        
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setHours(date.getHours() - (29 - i));
            labels.push(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            
            const randomChange = (Math.random() - 0.5) * 0.02;
            const value = i === 0 ? baseValue : values[i - 1] * (1 + randomChange);
            values.push(value);
        }
        
        return { labels, values };
    }

    getMockAllocationData() {
        return {
            labels: ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'Cash'],
            values: [25000, 20000, 18000, 15000, 22000]
        };
    }

    getMockRiskMetricsData() {
        return {
            labels: ['Sharpe Ratio', 'Sortino Ratio', 'Max Drawdown', 'VaR', 'Beta', 'Alpha'],
            values: [15, 18, 85, 75, 60, 25]
        };
    }

    // Destroy chart
    destroyChart(chartName) {
        if (this.charts[chartName]) {
            this.charts[chartName].destroy();
            delete this.charts[chartName];
        }
    }

    // Destroy all charts
    destroyAll() {
        Object.keys(this.charts).forEach(chartName => {
            this.destroyChart(chartName);
        });
    }

    // Resize all charts
    resizeAll() {
        Object.values(this.charts).forEach(chart => {
            chart.resize();
        });
    }

    // Update chart theme (for future dark/light mode toggle)
    updateTheme(theme = 'dark') {
        const colors = theme === 'dark' ? {
            text: '#e6edf3',
            textSecondary: '#8b949e',
            grid: '#30363d'
        } : {
            text: '#24292f',
            textSecondary: '#656d76',
            grid: '#d0d7de'
        };

        Object.values(this.charts).forEach(chart => {
            // Update colors in chart options
            if (chart.options.plugins?.legend?.labels) {
                chart.options.plugins.legend.labels.color = colors.text;
            }
            if (chart.options.scales) {
                Object.values(chart.options.scales).forEach(scale => {
                    if (scale.ticks) scale.ticks.color = colors.textSecondary;
                    if (scale.grid) scale.grid.color = colors.grid;
                });
            }
            chart.update();
        });
    }
}

// Initialize charts when DOM is loaded
let charts = null;

document.addEventListener('DOMContentLoaded', () => {
    charts = new ZergTraderCharts();
    
    // Make charts available globally
    window.charts = charts;
    
    // Initialize charts after a short delay to ensure DOM is ready
    setTimeout(() => {
        charts.init().catch(error => {
            console.error('Failed to initialize charts:', error);
        });
    }, 100);
});

// Handle window resize
window.addEventListener('resize', () => {
    if (charts) {
        setTimeout(() => charts.resizeAll(), 100);
    }
});