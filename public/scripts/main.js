// Main application entry point
class ZergTraderApp {
    constructor() {
        this.initialized = false;
        this.updateInterval = null;
        this.heartbeatInterval = null;
        
        this.init();
    }

    async init() {
        try {
            console.log('Initializing ZergTrader UI...');
            
            // Wait for all components to be ready
            await this.waitForComponents();
            
            // Setup periodic updates
            this.setupPeriodicUpdates();
            
            // Setup heartbeat
            this.setupHeartbeat();
            
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Setup error handlers
            this.setupErrorHandlers();
            
            this.initialized = true;
            console.log('ZergTrader UI initialized successfully');
            
            // Show welcome message
            if (window.UI) {
                window.UI.showToast('ZergTrader UI loaded successfully', 'success');
            }
            
        } catch (error) {
            console.error('Failed to initialize ZergTrader UI:', error);
            this.showErrorMessage('Failed to initialize application');
        }
    }

    async waitForComponents() {
        // Wait for essential components to be available
        const maxWait = 10000; // 10 seconds
        const checkInterval = 100; // 100ms
        let elapsed = 0;
        
        while (elapsed < maxWait) {
            if (window.api && window.UI && window.charts && window.websocket) {
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            elapsed += checkInterval;
        }
        
        if (!window.api || !window.UI || !window.charts || !window.websocket) {
            throw new Error('Essential components failed to load');
        }
    }

    setupPeriodicUpdates() {
        // Update data every 30 seconds
        this.updateInterval = setInterval(async () => {
            try {
                await this.periodicUpdate();
            } catch (error) {
                console.error('Periodic update failed:', error);
            }
        }, 30000);
    }

    setupHeartbeat() {
        // Send heartbeat every 5 seconds to check server connectivity
        this.heartbeatInterval = setInterval(async () => {
            try {
                await window.api.getHealth();
                this.updateConnectivityStatus(true);
            } catch (error) {
                console.warn('Heartbeat failed:', error);
                this.updateConnectivityStatus(false);
            }
        }, 5000);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + key combinations
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case '1':
                        e.preventDefault();
                        window.UI.navigateToPage('dashboard');
                        break;
                    case '2':
                        e.preventDefault();
                        window.UI.navigateToPage('portfolio');
                        break;
                    case '3':
                        e.preventDefault();
                        window.UI.navigateToPage('backtesting');
                        break;
                    case '4':
                        e.preventDefault();
                        window.UI.navigateToPage('agents');
                        break;
                    case '5':
                        e.preventDefault();
                        window.UI.navigateToPage('risk');
                        break;
                    case '6':
                        e.preventDefault();
                        window.UI.navigateToPage('trades');
                        break;
                    case 'r':
                        e.preventDefault();
                        this.refreshCurrentPage();
                        break;
                }
            }
            
            // Escape key
            if (e.key === 'Escape') {
                this.handleEscapeKey();
            }
        });
    }

    setupErrorHandlers() {
        // Global error handler
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.handleGlobalError(e.error);
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            this.handleGlobalError(e.reason);
        });

        // API error handler
        if (window.api) {
            window.api.onError = (error) => {
                this.handleAPIError(error);
            };
        }
    }

    async periodicUpdate() {
        if (!this.initialized) return;
        
        // Only update if on dashboard or current page needs live data
        const currentPage = window.UI?.currentPage;
        
        if (currentPage === 'dashboard') {
            // Update dashboard metrics
            try {
                const [portfolio, performance] = await Promise.all([
                    window.api.getPortfolio(),
                    window.api.getPerformance()
                ]);
                
                window.UI.updatePortfolioSummary(portfolio, performance);
            } catch (error) {
                console.warn('Failed to update dashboard metrics:', error);
            }
        }
        
        // Update system health
        try {
            const health = await window.api.getHealth();
            window.UI.updateSystemStatus(health);
        } catch (error) {
            console.warn('Failed to update system health:', error);
        }
    }

    updateConnectivityStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
            statusElement.innerHTML = `<i class="fas fa-circle"></i> ${connected ? 'Connected' : 'Disconnected'}`;
        }
    }

    async refreshCurrentPage() {
        const currentPage = window.UI?.currentPage;
        if (currentPage && window.UI) {
            window.UI.showLoading();
            try {
                await window.UI.loadPageData(currentPage);
                window.UI.showToast('Page refreshed', 'success');
            } catch (error) {
                window.UI.showToast('Failed to refresh page', 'error');
            } finally {
                window.UI.hideLoading();
            }
        }
    }

    handleEscapeKey() {
        // Close any open modals or overlays
        const backtestConfig = document.getElementById('backtest-config');
        if (backtestConfig && backtestConfig.style.display !== 'none') {
            window.UI.hideBacktestConfig();
        }
        
        // Hide loading overlay if it's stuck
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay && loadingOverlay.classList.contains('show')) {
            window.UI.hideLoading();
        }
    }

    handleGlobalError(error) {
        // Don't show too many error notifications
        if (this.lastErrorTime && Date.now() - this.lastErrorTime < 5000) {
            return;
        }
        
        this.lastErrorTime = Date.now();
        
        const message = error?.message || 'An unexpected error occurred';
        if (window.UI) {
            window.UI.showToast(message, 'error');
        } else {
            this.showErrorMessage(message);
        }
    }

    handleAPIError(error) {
        const message = APIUtils.handleError(error, 'API');
        if (window.UI) {
            window.UI.showToast(message, 'error');
        }
    }

    showErrorMessage(message) {
        // Fallback error display if UI is not available
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f85149;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        `;
        errorDiv.textContent = message;
        
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    // Public methods for external use
    async restart() {
        console.log('Restarting ZergTrader UI...');
        
        // Clear intervals
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        // Disconnect WebSocket
        if (window.websocket) {
            window.websocket.disconnect();
        }
        
        // Destroy charts
        if (window.charts) {
            window.charts.destroyAll();
        }
        
        this.initialized = false;
        
        // Wait a moment then reinitialize
        setTimeout(() => {
            this.init();
        }, 1000);
    }

    getStatus() {
        return {
            initialized: this.initialized,
            components: {
                api: !!window.api,
                ui: !!window.UI,
                charts: !!window.charts,
                websocket: !!window.websocket
            },
            intervals: {
                update: !!this.updateInterval,
                heartbeat: !!this.heartbeatInterval
            }
        };
    }

    // Development helpers
    enableDebugMode() {
        console.log('Debug mode enabled');
        window.ZergTraderDebug = {
            app: this,
            api: window.api,
            ui: window.UI,
            charts: window.charts,
            websocket: window.websocket,
            APIUtils: window.APIUtils
        };
        
        // Add debug styles
        const debugStyle = document.createElement('style');
        debugStyle.textContent = `
            .debug-overlay {
                position: fixed;
                top: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 1rem;
                border-radius: 8px;
                font-family: monospace;
                font-size: 12px;
                z-index: 9999;
                max-width: 300px;
            }
        `;
        document.head.appendChild(debugStyle);
        
        // Show debug info
        this.showDebugInfo();
    }

    showDebugInfo() {
        const debugOverlay = document.createElement('div');
        debugOverlay.className = 'debug-overlay';
        debugOverlay.innerHTML = `
            <strong>ZergTrader Debug</strong><br>
            Status: ${this.initialized ? 'Initialized' : 'Not Initialized'}<br>
            Current Page: ${window.UI?.currentPage || 'Unknown'}<br>
            WebSocket: ${window.websocket?.getConnectionState() || 'Unknown'}<br>
            Charts: ${Object.keys(window.charts?.charts || {}).length} active<br>
            <button onclick="this.parentNode.remove()" style="margin-top: 8px; padding: 4px 8px; border: none; background: #fff; color: #000; border-radius: 4px; cursor: pointer;">Close</button>
        `;
        
        document.body.appendChild(debugOverlay);
    }

    // Cleanup
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.initialized = false;
    }
}

// Application state management
const AppState = {
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    
    // Feature flags
    features: {
        realTimeUpdates: true,
        backtesting: true,
        advancedCharts: true,
        notifications: true
    },
    
    // User preferences (could be stored in localStorage)
    preferences: {
        theme: 'dark',
        autoRefresh: true,
        notifications: true,
        chartRefreshRate: 30000
    },
    
    // Application metrics
    metrics: {
        startTime: Date.now(),
        pageViews: {},
        errors: 0,
        apiCalls: 0
    },
    
    // Save preferences to localStorage
    savePreferences() {
        try {
            localStorage.setItem('zergtrader-preferences', JSON.stringify(this.preferences));
        } catch (error) {
            console.warn('Failed to save preferences:', error);
        }
    },
    
    // Load preferences from localStorage
    loadPreferences() {
        try {
            const saved = localStorage.getItem('zergtrader-preferences');
            if (saved) {
                this.preferences = { ...this.preferences, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('Failed to load preferences:', error);
        }
    },
    
    // Track page view
    trackPageView(page) {
        this.metrics.pageViews[page] = (this.metrics.pageViews[page] || 0) + 1;
    },
    
    // Get app info
    getInfo() {
        return {
            version: this.version,
            buildDate: this.buildDate,
            uptime: Date.now() - this.metrics.startTime,
            features: this.features,
            preferences: this.preferences,
            metrics: this.metrics
        };
    }
};

// Initialize application
let app = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Starting ZergTrader UI...');
    
    // Load preferences
    AppState.loadPreferences();
    
    // Create and start app
    app = new ZergTraderApp();
    
    // Make app available globally
    window.ZergTraderApp = app;
    window.AppState = AppState;
    
    // Development helper
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Development mode detected');
        window.enableDebug = () => app.enableDebugMode();
        console.log('Run enableDebug() to enable debug mode');
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (app) {
        app.destroy();
    }
    AppState.savePreferences();
});