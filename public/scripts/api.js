// API Client for ZergTrader
class ZergTraderAPI {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.token = null;
    }

    // Generic request method
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // GET request
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    // POST request
    async post(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'POST',
            body: data ? JSON.stringify(data) : null
        });
    }

    // PUT request
    async put(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : null
        });
    }

    // DELETE request
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // Health endpoints
    async getHealth() {
        return this.get('/health');
    }

    // Portfolio endpoints
    async getPortfolio() {
        return this.get('/portfolio');
    }

    async getPositions() {
        return this.get('/positions');
    }

    async getPerformance() {
        return this.get('/performance');
    }

    async rebalancePortfolio(strategy = null) {
        return this.post('/rebalance', { strategy });
    }

    // Risk management endpoints
    async getRiskMetrics() {
        return this.get('/risk/metrics');
    }

    async getRiskAlerts() {
        return this.get('/risk/alerts');
    }

    async resolveRiskAlert(alertId) {
        return this.post(`/risk/alerts/${alertId}/resolve`);
    }

    // Agent management endpoints
    async getAgents() {
        return this.get('/agents');
    }

    async startAgent(agentId) {
        return this.post(`/agents/${agentId}/start`);
    }

    async stopAgent(agentId) {
        return this.post(`/agents/${agentId}/stop`);
    }

    // Trading endpoints
    async getTrades(limit = null) {
        const endpoint = limit ? `/trades?limit=${limit}` : '/trades';
        return this.get(endpoint);
    }

    // System control endpoints
    async startSystem() {
        return this.post('/start');
    }

    async stopSystem() {
        return this.post('/stop');
    }

    // Backtesting endpoints
    async createBacktest(config) {
        return this.post('/backtests', config);
    }

    async getBacktestStatus(jobId) {
        return this.get(`/backtests/${jobId}`);
    }

    async getBacktestResult(jobId) {
        return this.get(`/backtests/${jobId}/result`);
    }

    async getAllBacktests(filters = {}) {
        const params = new URLSearchParams(filters);
        const endpoint = params.toString() ? `/backtests?${params}` : '/backtests';
        return this.get(endpoint);
    }

    async cancelBacktest(jobId) {
        return this.delete(`/backtests/${jobId}/cancel`);
    }

    async deleteBacktest(jobId) {
        return this.delete(`/backtests/${jobId}`);
    }

    async compareBacktests(jobIds) {
        return this.post('/backtests/compare', { jobIds });
    }

    async exportBacktestData(jobId, format = 'json') {
        const response = await fetch(`${this.baseURL}/backtests/${jobId}/export?format=${format}`);
        if (!response.ok) {
            throw new Error(`Export failed: ${response.statusText}`);
        }
        
        if (format === 'csv') {
            return await response.text();
        } else {
            return await response.json();
        }
    }
}

// Utility functions for API responses
const APIUtils = {
    // Format currency values
    formatCurrency(value, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(value);
    },

    // Format percentage values
    formatPercentage(value, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    },

    // Format numbers with commas
    formatNumber(value, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    },

    // Format dates
    formatDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(new Date(date));
    },

    // Format relative time
    formatRelativeTime(date) {
        const now = new Date();
        const target = new Date(date);
        const diffMs = now - target;
        
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return this.formatDate(date, { month: 'short', day: 'numeric' });
    },

    // Get color for percentage change
    getChangeColor(value) {
        if (value > 0) return 'positive';
        if (value < 0) return 'negative';
        return 'neutral';
    },

    // Get status color
    getStatusColor(status) {
        const statusColors = {
            'running': 'success',
            'stopped': 'error',
            'idle': 'warning',
            'error': 'error',
            'pending': 'info',
            'completed': 'success',
            'failed': 'error',
            'cancelled': 'warning'
        };
        return statusColors[status.toLowerCase()] || 'neutral';
    },

    // Handle API errors
    handleError(error, context = '') {
        console.error(`API Error${context ? ` (${context})` : ''}:`, error);
        
        // Show user-friendly error message
        let message = 'An unexpected error occurred';
        
        if (error.message) {
            if (error.message.includes('fetch')) {
                message = 'Unable to connect to the server. Please check your connection.';
            } else if (error.message.includes('401')) {
                message = 'Authentication required. Please log in.';
            } else if (error.message.includes('403')) {
                message = 'Access denied. You do not have permission for this action.';
            } else if (error.message.includes('404')) {
                message = 'Resource not found.';
            } else if (error.message.includes('500')) {
                message = 'Server error. Please try again later.';
            } else {
                message = error.message;
            }
        }
        
        return message;
    },

    // Retry failed requests
    async retry(fn, maxAttempts = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
    }
};

// Create global API instance
window.api = new ZergTraderAPI();
window.APIUtils = APIUtils;