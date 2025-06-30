// WebSocket client for real-time updates
class ZergTraderWebSocket {
    constructor(url = null) {
        this.url = url || `ws://${window.location.host}`;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.listeners = new Map();
        this.isConnected = false;
        this.shouldReconnect = true;
        
        this.connect();
    }

    connect() {
        try {
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        this.ws.onopen = (event) => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.updateConnectionStatus(true);
            this.emit('connected', event);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.emit('disconnected', event);
            
            if (this.shouldReconnect && event.code !== 1000) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };
    }

    handleMessage(data) {
        const { type, ...payload } = data;
        
        switch (type) {
            case 'signal':
                this.emit('signal', payload);
                break;
            case 'tradeExecuted':
                this.emit('tradeExecuted', payload);
                break;
            case 'portfolioUpdate':
                this.emit('portfolioUpdate', payload);
                break;
            case 'riskAlert':
                this.emit('riskAlert', payload);
                break;
            case 'agentStatusUpdate':
                this.emit('agentStatusUpdate', payload);
                break;
            case 'backtestProgress':
                this.emit('backtestProgress', payload);
                break;
            case 'marketDataUpdate':
                this.emit('marketDataUpdate', payload);
                break;
            default:
                console.log('Unknown message type:', type, payload);
                this.emit('message', data);
        }
    }

    send(data) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected, message not sent:', data);
        }
    }

    subscribe(topics) {
        this.send({
            type: 'subscribe',
            topics: Array.isArray(topics) ? topics : [topics]
        });
    }

    unsubscribe(topics) {
        this.send({
            type: 'unsubscribe',
            topics: Array.isArray(topics) ? topics : [topics]
        });
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in WebSocket event handler for ${event}:`, error);
                }
            });
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Maximum reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            if (this.shouldReconnect) {
                this.connect();
            }
        }, delay);
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
            statusElement.innerHTML = `<i class="fas fa-circle"></i> ${connected ? 'Connected' : 'Disconnected'}`;
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close(1000, 'Manual disconnect');
        }
    }

    reconnect() {
        this.disconnect();
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        setTimeout(() => this.connect(), 100);
    }

    getConnectionState() {
        if (!this.ws) return 'DISCONNECTED';
        
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'CONNECTING';
            case WebSocket.OPEN:
                return 'CONNECTED';
            case WebSocket.CLOSING:
                return 'CLOSING';
            case WebSocket.CLOSED:
                return 'DISCONNECTED';
            default:
                return 'UNKNOWN';
        }
    }
}

// WebSocket event handlers for UI updates
const WebSocketHandlers = {
    setupHandlers(ws) {
        // Portfolio updates
        ws.on('portfolioUpdate', (data) => {
            this.updatePortfolioMetrics(data.data);
        });

        // Trade execution updates
        ws.on('tradeExecuted', (data) => {
            this.handleTradeExecuted(data.data);
            this.showNotification('Trade executed', `${data.data.action} ${data.data.quantity} ${data.data.symbol}`, 'success');
        });

        // Signal updates
        ws.on('signal', (data) => {
            this.handleNewSignal(data.data);
        });

        // Risk alerts
        ws.on('riskAlert', (data) => {
            this.handleRiskAlert(data.data);
            this.showNotification('Risk Alert', data.data.message, 'warning');
        });

        // Agent status updates
        ws.on('agentStatusUpdate', (data) => {
            this.updateAgentStatus(data.data);
        });

        // Backtest progress updates
        ws.on('backtestProgress', (data) => {
            this.updateBacktestProgress(data.data);
        });

        // Market data updates
        ws.on('marketDataUpdate', (data) => {
            this.handleMarketDataUpdate(data.data);
        });

        // Connection events
        ws.on('connected', () => {
            this.showNotification('Connected', 'WebSocket connection established', 'success');
        });

        ws.on('disconnected', () => {
            this.showNotification('Disconnected', 'Lost connection to server', 'error');
        });

        ws.on('maxReconnectAttemptsReached', () => {
            this.showNotification('Connection Failed', 'Unable to reconnect to server', 'error');
        });
    },

    updatePortfolioMetrics(data) {
        // Update portfolio summary on dashboard
        const totalValueEl = document.getElementById('total-value');
        const cashValueEl = document.getElementById('cash-value');
        const dailyPnlEl = document.getElementById('daily-pnl');
        const totalPnlEl = document.getElementById('total-pnl');

        if (totalValueEl) totalValueEl.textContent = APIUtils.formatCurrency(data.totalValue);
        if (cashValueEl) cashValueEl.textContent = APIUtils.formatCurrency(data.cash);
        if (dailyPnlEl) {
            dailyPnlEl.textContent = APIUtils.formatCurrency(data.dailyPnL);
            dailyPnlEl.className = `metric-value ${APIUtils.getChangeColor(data.dailyPnL)}`;
        }
        if (totalPnlEl) {
            totalPnlEl.textContent = APIUtils.formatCurrency(data.totalPnL);
            totalPnlEl.className = `metric-value ${APIUtils.getChangeColor(data.totalPnL)}`;
        }

        // Update charts if they exist
        if (window.charts && window.charts.performanceChart) {
            window.charts.addPerformanceDataPoint(data);
        }
    },

    handleTradeExecuted(trade) {
        // Add to recent trades table
        const tradesTable = document.getElementById('trades-table');
        if (tradesTable && tradesTable.getElementsByTagName('tbody')[0]) {
            const tbody = tradesTable.getElementsByTagName('tbody')[0];
            const row = this.createTradeRow(trade);
            tbody.insertBefore(row, tbody.firstChild);

            // Limit to 50 rows
            while (tbody.children.length > 50) {
                tbody.removeChild(tbody.lastChild);
            }
        }

        // Update portfolio positions if on portfolio page
        if (document.getElementById('portfolio-page').classList.contains('active')) {
            this.refreshPositions();
        }
    },

    handleNewSignal(signal) {
        // Add to recent signals list
        const signalsList = document.getElementById('signals-list');
        if (signalsList) {
            const signalElement = this.createSignalElement(signal);
            signalsList.insertBefore(signalElement, signalsList.firstChild);

            // Limit to 10 signals
            while (signalsList.children.length > 10) {
                signalsList.removeChild(signalsList.lastChild);
            }
        }
    },

    handleRiskAlert(alert) {
        // Add to risk alerts list
        const alertsList = document.getElementById('risk-alerts');
        if (alertsList) {
            const alertElement = this.createAlertElement(alert);
            alertsList.insertBefore(alertElement, alertsList.firstChild);
        }
    },

    updateAgentStatus(agentData) {
        // Update agent status in dashboard and agents page
        const agentItems = document.querySelectorAll(`[data-agent-id="${agentData.id}"]`);
        agentItems.forEach(item => {
            const statusIndicator = item.querySelector('.agent-status');
            if (statusIndicator) {
                statusIndicator.className = `agent-status ${agentData.status}`;
            }
        });
    },

    updateBacktestProgress(progressData) {
        // Update backtest progress bars
        const progressBars = document.querySelectorAll(`[data-job-id="${progressData.jobId}"] .job-progress-bar`);
        progressBars.forEach(bar => {
            bar.style.width = `${progressData.progress}%`;
        });
    },

    handleMarketDataUpdate(data) {
        // Update price displays and charts
        console.log('Market data update:', data);
        // Implementation depends on specific UI requirements
    },

    createTradeRow(trade) {
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
        return row;
    },

    createSignalElement(signal) {
        const element = document.createElement('div');
        element.className = 'signal-item';
        element.innerHTML = `
            <div class="signal-info">
                <div class="signal-symbol">${signal.symbol}</div>
                <div class="signal-action ${signal.action}">${signal.action}</div>
                <div class="signal-confidence">Confidence: ${(signal.confidence * 100).toFixed(1)}%</div>
            </div>
            <div class="signal-time">${APIUtils.formatRelativeTime(signal.timestamp)}</div>
        `;
        return element;
    },

    createAlertElement(alert) {
        const element = document.createElement('div');
        element.className = `alert-item ${alert.severity.toLowerCase()}`;
        element.innerHTML = `
            <div class="alert-header">
                <span class="alert-type">${alert.type}</span>
                <span class="alert-severity">${alert.severity}</span>
            </div>
            <div class="alert-message">${alert.message}</div>
        `;
        return element;
    },

    refreshPositions() {
        // Refresh positions table
        window.api.getPositions().then(positions => {
            window.UI.updatePositionsTable(positions);
        }).catch(error => {
            console.error('Failed to refresh positions:', error);
        });
    },

    showNotification(title, message, type = 'info') {
        if (window.UI && window.UI.showToast) {
            window.UI.showToast(message, type);
        }
    }
};

// Create global WebSocket instance
let websocket = null;

// Initialize WebSocket when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    websocket = new ZergTraderWebSocket();
    WebSocketHandlers.setupHandlers(websocket);
    
    // Make websocket available globally
    window.websocket = websocket;
});