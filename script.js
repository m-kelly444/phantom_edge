window.addEventListener('error', function(event) {
    logErrorToVercel('Runtime Error', event.message, event.filename, event.lineno, event.colno, event.error);
});

window.addEventListener('unhandledrejection', function(event) {
    logErrorToVercel('Unhandled Promise Rejection', event.reason);
});

function logErrorToVercel(type, message, source, lineno, colno, errorObj) {
    fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type,
            message,
            source,
            lineno,
            colno,
            stack: errorObj?.stack || null,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        })
    });
}

const config = {
    priceMovementMin: 8.0,
    priceMovementMax: 13.0,
    volumeMultiplier: 2.0,    
    updateInterval: 500,      
    alertThreshold: 85,       
    apiKey: localStorage.getItem('apiKey') || '',
    connectionType: localStorage.getItem('connectionType') || 'websocket',
    
    defaultStocks: [
        {symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology'},
        {symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology'},
        {symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'Automotive'},
        {symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology'},
        {symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical'},
        {symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology'},
        {symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology'},
        {symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication Services'},
        {symbol: 'PLTR', name: 'Palantir Technologies', sector: 'Technology'},
        {symbol: 'SOFI', name: 'SoFi Technologies', sector: 'Financial Services'}
    ]
};

let globalState = {
    stockData: {},               
    selectedStock: null,         
    alerts: [],                  
    watchlist: [],                
    alertCount: 0,                
    connectionStatus: 'disconnected',
    soundEnabled: localStorage.getItem('soundEnabled') !== 'false', 
    chartInstance: null,          
    dataFeed: null,              
    lastUpdate: null,            
    isInitialized: false          
};

const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    alertLevelIndicator: document.getElementById('alertLevelIndicator'),
    soundToggle: document.getElementById('soundToggle'),
    alertCounter: document.getElementById('alertCounter'),
    watchlist: document.getElementById('watchlist'),
    stockChart: document.getElementById('stockChart'),
    chartPlaceholder: document.getElementById('chartPlaceholder'),
    stockDetailHeader: document.getElementById('stockDetailHeader'),
    stockSymbolTitle: document.getElementById('stockSymbolTitle'),
    stockNameTitle: document.getElementById('stockNameTitle'),
    stockMetricsLarge: document.getElementById('stockMetricsLarge'),
    currentPrice: document.getElementById('currentPrice'),
    dayChange: document.getElementById('dayChange'),
    volumeRatio: document.getElementById('volumeRatio'),
    breakoutProbability: document.getElementById('breakoutProbability'),
    chartScanner: document.getElementById('chartScanner'),
    chartCrosshair: document.getElementById('chartCrosshair'),
    targetZoneOverlay: document.getElementById('targetZoneOverlay'),
    targetZoneLabel: document.getElementById('targetZoneLabel'),
    alertsList: document.getElementById('alertsList'),
    allAlertsList: document.getElementById('allAlertsList'),
    alertPopup: document.getElementById('alertPopup'),
    breakoutAnalysis: document.getElementById('breakoutAnalysis'),
    breakoutStatus: document.getElementById('breakoutStatus'),
    priceIncreaseValue: document.getElementById('priceIncreaseValue'),
    priceIncreaseIcon: document.getElementById('priceIncreaseIcon'),
    volumeIncreaseValue: document.getElementById('volumeIncreaseValue'),
    volumeIncreaseIcon: document.getElementById('volumeIncreaseIcon'),
    targetRangeValue: document.getElementById('targetRangeValue'),
    targetRangeIcon: document.getElementById('targetRangeIcon'),
    criticalZone: document.getElementById('criticalZone'),
    zoneStatus: document.getElementById('zoneStatus'),
    settingsModal: document.getElementById('settingsModal'),
    addStockModal: document.getElementById('addStockModal'),
    alertsModal: document.getElementById('alertsModal'),
    settingsForm: document.getElementById('settingsForm'),
    addStockForm: document.getElementById('addStockForm'),
    stockSearch: document.getElementById('stockSearch'),
    filterButton: document.getElementById('filterButton'),
    filterMenu: document.getElementById('filterMenu'),
    watchlistLoading: document.getElementById('watchlistLoading'),
    alertSound: document.getElementById('alertSound'),
    tickerTape: document.getElementById('tickerTape')
};

document.addEventListener('DOMContentLoaded', function() {
    // Load watchlist from localStorage or use defaults
    loadWatchlist();
    
    // Initialize UI
    initUI();
    
    // Show settings modal if API key is not set
    if (!config.apiKey) {
        elements.settingsModal.style.display = 'flex';
        // Add error message
        document.getElementById('settingsMessage').innerHTML = 
            '<div class="form-message error"><i class="fas fa-exclamation-circle"></i>API key required for real-time market data</div>';
    } else {
        // Initialize system with saved settings
        initSystem();
    }
    
    // Set up event listeners
    setupEventListeners();
});

// Initialize UI components
function initUI() {
    // Set sound toggle state
    updateSoundToggle();
    
    // Initialize Chart.js
    initChart();
    
    // Create ticker tape content
    initTickerTape();
}

// Load watchlist from localStorage or use defaults
function loadWatchlist() {
    try {
        const savedWatchlist = localStorage.getItem('watchlist');
        if (savedWatchlist) {
            globalState.watchlist = JSON.parse(savedWatchlist);
        } else {
            // Use default stocks if no saved watchlist
            globalState.watchlist = config.defaultStocks;
            saveWatchlist();
        }
    } catch (error) {
        console.error('Error loading watchlist:', error);
        globalState.watchlist = config.defaultStocks;
        saveWatchlist();
    }
}

// Save watchlist to localStorage
function saveWatchlist() {
    localStorage.setItem('watchlist', JSON.stringify(globalState.watchlist));
}

// Initialize system with current settings
function initSystem() {
    updateConnectionStatus('connecting');
    elements.watchlistLoading.style.display = 'flex';
    
    // Simulate initialization delay
    setTimeout(() => {
        // Connect to data source based on connection type
        if (config.connectionType === 'websocket') {
            initWebSocket();
        } else {
            initPollingConnection();
        }
        
        // Load initial data for all stocks in watchlist
        loadInitialData().then(() => {
            // Hide loading overlay
            elements.watchlistLoading.style.display = 'none';
            
            // Select first stock if none selected
            if (!globalState.selectedStock && globalState.watchlist.length > 0) {
                selectStock(globalState.watchlist[0].symbol);
            }
            
            // Set system as initialized
            globalState.isInitialized = true;
            
            // Update alert level to "System Armed"
            updateAlertLevel('normal');
        });
    }, 3000); // Simulated 3-second initialization for dramatic effect
}

// Initialize Chart.js
function initChart() {
    const ctx = elements.stockChart.getContext('2d');
    
    // Set Chart.js global defaults
    Chart.defaults.color = 'rgba(224, 224, 255, 0.7)';
    Chart.defaults.borderColor = 'rgba(0, 243, 255, 0.1)';
    
    // Create chart instance
    globalState.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Price',
                data: [],
                borderColor: '#00f3ff',
                backgroundColor: 'rgba(0, 243, 255, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#00f3ff',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(7, 7, 33, 0.9)',
                    borderColor: '#00f3ff',
                    borderWidth: 1,
                    titleColor: '#00f3ff',
                    bodyColor: '#e0e0ff',
                    usePointStyle: true,
                    callbacks: {
                        label: function(context) {
                            return `Price: $${context.raw.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(0, 243, 255, 0.1)',
                        borderColor: 'rgba(0, 243, 255, 0.2)'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0, 243, 255, 0.1)',
                        borderColor: 'rgba(0, 243, 255, 0.2)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// Initialize ticker tape
function initTickerTape() {
    const tickers = [
        { symbol: 'AAPL', price: '208.76', change: '+2.3%', isUp: true },
        { symbol: 'NVDA', price: '121.42', change: '+4.7%', isUp: true },
        { symbol: 'TSLA', price: '248.33', change: '-1.2%', isUp: false },
        { symbol: 'AMD', price: '158.72', change: '+5.3%', isUp: true },
        { symbol: 'AMZN', price: '183.92', change: '+1.7%', isUp: true },
        { symbol: 'META', price: '516.75', change: '+2.8%', isUp: true },
        { symbol: 'MSFT', price: '440.26', change: '+0.9%', isUp: true },
        { symbol: 'GOOGL', price: '172.39', change: '-0.4%', isUp: false },
        { symbol: 'SPY', price: '538.47', change: '+0.7%', isUp: true },
        { symbol: 'QQQ', price: '465.31', change: '+1.2%', isUp: true }
    ];
    
    let tickerHTML = '';
    
    // Create ticker items
    tickers.forEach(ticker => {
        tickerHTML += `
            <div class="ticker-item">
                <div class="ticker-symbol">${ticker.symbol}</div>
                <div class="ticker-price">$${ticker.price}</div>
                <div class="ticker-value ${ticker.isUp ? 'up' : 'down'}">${ticker.change}</div>
            </div>
        `;
    });
    
    // Add duplicate items to create infinite scroll
    elements.tickerTape.innerHTML = tickerHTML + tickerHTML;
}

// Set up event listeners
function setupEventListeners() {
    // Button event listeners
    document.getElementById('settingsBtn').addEventListener('click', () => openModal('settingsModal'));
    document.getElementById('addStockBtn').addEventListener('click', () => openModal('addStockModal'));
    document.getElementById('alertsBtn').addEventListener('click', () => {
        openModal('alertsModal');
        // Reset alert counter when alerts viewed
        resetAlertCounter();
    });
    
    // Modal close buttons
    document.getElementById('closeSettingsBtn').addEventListener('click', () => closeModal('settingsModal'));
    document.getElementById('closeAddStockBtn').addEventListener('click', () => closeModal('addStockModal'));
    document.getElementById('closeAlertsBtn').addEventListener('click', () => closeModal('alertsModal'));
    
    // Alert popup buttons
    document.getElementById('closeAlertPopup').addEventListener('click', hideAlertPopup);
    document.getElementById('viewAlertDetails').addEventListener('click', viewAlertDetails);
    document.getElementById('dismissAlert').addEventListener('click', hideAlertPopup);
    
    // Form submissions
    elements.settingsForm.addEventListener('submit', handleSettingsSubmit);
    elements.addStockForm.addEventListener('submit', handleAddStockSubmit);
    
    // Toggle visibility of API key
    document.getElementById('toggleApiVisibility').addEventListener('click', toggleApiKeyVisibility);
    
    // Sound toggle
    elements.soundToggle.addEventListener('click', toggleSound);
    
    // Stock search filter
    elements.stockSearch.addEventListener('input', filterWatchlist);
    
    // Filter dropdown
    elements.filterButton.addEventListener('click', toggleFilterMenu);
    
    // Filter options
    document.querySelectorAll('.filter-option').forEach(option => {
        option.addEventListener('click', (e) => {
            // Remove active class from all options
            document.querySelectorAll('.filter-option').forEach(opt => {
                opt.classList.remove('active');
            });
            
            // Add active class to clicked option
            e.currentTarget.classList.add('active');
            
            // Apply filter
            applyFilter(e.currentTarget.dataset.filter);
            
            // Hide filter menu
            elements.filterMenu.classList.remove('show');
        });
    });
    
    // Filter tags
    document.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            // Toggle active class
            document.querySelectorAll('.filter-tag').forEach(t => {
                t.classList.remove('active');
            });
            e.currentTarget.classList.add('active');
            
            // Apply corresponding filter
            const filterType = e.currentTarget.textContent.toLowerCase();
            filterWatchlistByTag(filterType);
        });
    });
    
    // Time buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all buttons
            document.querySelectorAll('.time-btn').forEach(b => {
                b.classList.remove('active');
            });
            
            // Add active class to clicked button
            e.currentTarget.classList.add('active');
            
            // Change chart timeframe
            changeChartTimeframe(e.currentTarget.dataset.timeframe);
        });
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            closeModal('settingsModal');
        } else if (e.target === elements.addStockModal) {
            closeModal('addStockModal');
        } else if (e.target === elements.alertsModal) {
            closeModal('alertsModal');
        }
    });
}

// ===== Data Connection Methods =====

// Initialize WebSocket connection
function initWebSocket() {
    console.log('Initializing WebSocket connection...');
    
    // Simulate WebSocket connection with setInterval
    // In a real app, this would connect to a real market data WebSocket
    globalState.dataFeed = setInterval(() => {
        updateAllStocksData();
    }, config.updateInterval);
    
    // Update connection status after a delay
    setTimeout(() => {
        updateConnectionStatus('connected');
    }, 1500);
}

// Initialize polling connection
function initPollingConnection() {
    console.log('Initializing polling connection...');
    
    // Set up polling interval
    globalState.dataFeed = setInterval(() => {
        updateAllStocksData();
    }, config.updateInterval);
    
    // Update connection status after a delay
    setTimeout(() => {
        updateConnectionStatus('connected');
    }, 1500);
}

// Load initial data for all stocks in watchlist
async function loadInitialData() {
    console.log('Loading initial data for all stocks...');
    
    // Create promises for all stocks
    const promises = globalState.watchlist.map(stock => {
        return fetchStockData(stock.symbol).then(data => {
            // Store data in global state
            globalState.stockData[stock.symbol] = data;
        });
    });
    
    // Wait for all promises to resolve
    return Promise.all(promises).then(() => {
        // Render watchlist with initial data
        renderWatchlist();
        console.log('Initial data loaded successfully');
    });
}

// Update data for all stocks
function updateAllStocksData() {
    // Update timestamps
    globalState.lastUpdate = new Date();
    
    // Update each stock in watchlist
    globalState.watchlist.forEach(stock => {
        updateStockData(stock.symbol);
    });
}

// Update data for a single stock
function updateStockData(symbol) {
    // Fetch new data
    fetchStockData(symbol).then(data => {
        // Check if data was returned
        if (!data) return;
        
        // Update data in global state
        globalState.stockData[symbol] = data;
        
        // Update UI if this is the selected stock
        if (globalState.selectedStock === symbol) {
            updateStockDetails(symbol);
        }
        
        // Update stock in watchlist
        updateStockInWatchlist(symbol);
        
        // Check for breakout
        checkForBreakout(symbol);
    });
}

// Fetch stock data from API (simulated)
async function fetchStockData(symbol) {
    // This is a simulation that would be replaced with real API calls
    return new Promise(resolve => {
        // Generate random data that stays consistent for each symbol
        const symbolHash = hashCode(symbol);
        const now = new Date();
        const seed = symbolHash + now.getMinutes() + now.getSeconds();
        const random = seededRandom(seed);
        
        // Create base price from symbol hash (consistent for each symbol)
        const basePrice = 50 + (symbolHash % 200);
        
        // Calculate daily open price (consistent until the minute changes)
        const openPrice = basePrice * (1 + (seededRandom(symbolHash + now.getDate()) * 0.1 - 0.05));
        
        // Calculate current percentage change (varies by second)
        let percentChange = (random * 24 - 8); // Range from -8% to +16%
        
        // For selected symbols, force them into the 8-13% range (breakout zone)
        if (['NVDA', 'SOFI', 'PLTR'].includes(symbol)) {
            percentChange = 8 + (random * 5); // Range from 8% to 13%
        }
        
        // Calculate current price
        const currentPrice = openPrice * (1 + (percentChange / 100));
        
        // Generate volume data
        const averageVolume = 1000000 + (symbolHash % 9000000);
        const volumeMultiplier = 1 + (random * 4); // 1x to 5x average volume
        const currentVolume = averageVolume * volumeMultiplier;
        
        // Generate historical price data (for chart)
        const timeLabels = [];
        const priceHistory = [];
        let simulatedPrice = openPrice;
        
        // Generate data points for the last 60 minutes
        for (let i = 0; i < 60; i++) {
            const time = new Date();
            time.setMinutes(time.getMinutes() - (60 - i));
            
            // Calculate price for this point with some randomness but trending toward the current price
            const ratio = i / 60; // 0 to 1 representing progress toward current price
            const randomFactor = seededRandom(symbolHash + i) * 0.02 - 0.01; // -1% to +1%
            const targetPrice = openPrice * (1 + (percentChange * ratio / 100));
            simulatedPrice = targetPrice * (1 + randomFactor);
            
            timeLabels.push(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            priceHistory.push(simulatedPrice);
        }
        
        // Add current price as the last point
        timeLabels.push('Now');
        priceHistory.push(currentPrice);
        
        // Calculate breakout probability based on price and volume
        let breakoutProbability = 0;
        
        if (percentChange >= config.priceMovementMin && percentChange <= config.priceMovementMax) {
            // High probability if in target range
            breakoutProbability = 70 + (random * 25);
        } else if (percentChange > config.priceMovementMax) {
            // Moderate probability if above target range (potentially already broken out)
            breakoutProbability = 30 + (random * 40);
        } else if (percentChange > 0) {
            // Low probability if positive but below target range
            breakoutProbability = 10 + (random * 40);
        } else {
            // Very low probability if negative
            breakoutProbability = random * 15;
        }
        
        // Adjust probability based on volume
        if (volumeMultiplier >= config.volumeMultiplier) {
            breakoutProbability += 15;
        }
        
        // Cap probability at 99%
        breakoutProbability = Math.min(breakoutProbability, 99);
        
        // Create final data object
        const data = {
            symbol,
            companyName: findStockName(symbol),
            currentPrice: currentPrice.toFixed(2),
            openPrice: openPrice.toFixed(2),
            percentChange: percentChange.toFixed(2),
            averageVolume,
            currentVolume,
            volumeMultiplier: volumeMultiplier.toFixed(1),
            priceHistory,
            timeLabels,
            lastUpdated: new Date(),
            breakoutProbability: breakoutProbability.toFixed(1),
            inBreakoutZone: percentChange >= config.priceMovementMin && percentChange <= config.priceMovementMax,
            highVolume: volumeMultiplier >= config.volumeMultiplier
        };
        
        // Simulate network delay
        setTimeout(() => {
            resolve(data);
        }, 100);
    });
}

// ===== UI Update Methods =====

// Render watchlist with current data
function renderWatchlist() {
    // Clear watchlist
    elements.watchlist.innerHTML = '';
    
    // Create stock cards for each stock in watchlist
    globalState.watchlist.forEach(stock => {
        const stockData = globalState.stockData[stock.symbol];
        if (!stockData) return; // Skip if no data available
        
        createStockCard(stock.symbol, stockData);
    });
}

// Create a stock card for the watchlist
function createStockCard(symbol, data) {
    // Create stock card element
    const stockCard = document.createElement('div');
    stockCard.className = 'stock-card';
    stockCard.setAttribute('data-symbol', symbol);
    
    // Add classes based on stock status
    if (globalState.selectedStock === symbol) {
        stockCard.classList.add('selected');
    }
    
    if (data.inBreakoutZone) {
        stockCard.classList.add('breakout-zone');
    }
    
    const percentChange = parseFloat(data.percentChange);
    const volumeMultiplier = parseFloat(data.volumeMultiplier);
    
    // Set volume indicator width based on volume multiplier
    const volumeIndicatorWidth = Math.min(volumeMultiplier / 5 * 100, 100); // Cap at 100%
    
    // Create HTML content
    stockCard.innerHTML = `
        <div class="stock-info">
            <div class="stock-symbol-row">
                <div class="stock-symbol">${symbol}</div>
                ${data.inBreakoutZone ? '<div class="stock-tag breakout">BREAKOUT ZONE</div>' : ''}
                ${!data.inBreakoutZone && data.highVolume ? '<div class="stock-tag">HIGH VOL</div>' : ''}
            </div>
            <div class="stock-name">${data.companyName}</div>
        </div>
        <div class="stock-metrics">
            <div class="stock-price">$${parseFloat(data.currentPrice).toFixed(2)}</div>
            <div class="stock-change ${percentChange >= 0 ? 'positive' : 'negative'}">
                ${percentChange >= 0 ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>'}
                ${Math.abs(percentChange)}%
            </div>
            <div class="stock-volume">Vol: ${volumeMultiplier}x avg</div>
        </div>
        <div class="volume-indicator" style="width: ${volumeIndicatorWidth}%"></div>
        ${data.inBreakoutZone ? '<div class="target-zone-indicator"></div>' : ''}
    `;
    
    // Add click event listener
    stockCard.addEventListener('click', () => {
        selectStock(symbol);
    });
    
    // Add to watchlist
    elements.watchlist.appendChild(stockCard);
}

// Update a single stock in the watchlist
function updateStockInWatchlist(symbol) {
    // Find existing card
    const stockCard = elements.watchlist.querySelector(`.stock-card[data-symbol="${symbol}"]`);
    if (!stockCard) return; // Skip if card doesn't exist
    
    // Get updated data
    const data = globalState.stockData[symbol];
    if (!data) return; // Skip if no data available
    
    // Remove existing classes
    stockCard.classList.remove('breakout-zone');
    
    // Add classes based on stock status
    if (data.inBreakoutZone) {
        stockCard.classList.add('breakout-zone');
    }
    
    const percentChange = parseFloat(data.percentChange);
    const volumeMultiplier = parseFloat(data.volumeMultiplier);
    
    // Set volume indicator width based on volume multiplier
    const volumeIndicatorWidth = Math.min(volumeMultiplier / 5 * 100, 100); // Cap at 100%
    
    // Update HTML content
    stockCard.innerHTML = `
        <div class="stock-info">
            <div class="stock-symbol-row">
                <div class="stock-symbol">${symbol}</div>
                ${data.inBreakoutZone ? '<div class="stock-tag breakout">BREAKOUT ZONE</div>' : ''}
                ${!data.inBreakoutZone && data.highVolume ? '<div class="stock-tag">HIGH VOL</div>' : ''}
            </div>
            <div class="stock-name">${data.companyName}</div>
        </div>
        <div class="stock-metrics">
            <div class="stock-price">$${parseFloat(data.currentPrice).toFixed(2)}</div>
            <div class="stock-change ${percentChange >= 0 ? 'positive' : 'negative'}">
                ${percentChange >= 0 ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>'}
                ${Math.abs(percentChange)}%
            </div>
            <div class="stock-volume">Vol: ${volumeMultiplier}x avg</div>
        </div>
        <div class="volume-indicator" style="width: ${volumeIndicatorWidth}%"></div>
        ${data.inBreakoutZone ? '<div class="target-zone-indicator"></div>' : ''}
    `;
}

// Select a stock and show its details
function selectStock(symbol) {
    // Set as selected stock
    globalState.selectedStock = symbol;
    
    // Update selected class in watchlist
    document.querySelectorAll('.stock-card').forEach(card => {
        if (card.getAttribute('data-symbol') === symbol) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
    
    // Update stock details
    updateStockDetails(symbol);
}

// Update stock details panel
function updateStockDetails(symbol) {
    // Get stock data
    const data = globalState.stockData[symbol];
    if (!data) return; // Skip if no data available
    
    // Update title and header
    elements.stockSymbolTitle.innerHTML = `<i class="fas fa-chart-line"></i> ${symbol}`;
    elements.stockNameTitle.textContent = data.companyName;
    elements.stockMetricsLarge.style.display = 'flex';
    
    // Update metrics
    elements.currentPrice.textContent = `$${parseFloat(data.currentPrice).toFixed(2)}`;
    
    const percentChange = parseFloat(data.percentChange);
    elements.dayChange.textContent = `${percentChange >= 0 ? '+' : ''}${percentChange}%`;
    elements.dayChange.className = `metric-value ${percentChange >= 0 ? 'positive' : 'negative'}`;
    
    elements.volumeRatio.textContent = `${data.volumeMultiplier}x`;
    
    elements.breakoutProbability.textContent = `${data.breakoutProbability}%`;
    
    // Show chart
    elements.chartPlaceholder.style.display = 'none';
    elements.stockChart.style.display = 'block';
    
    // Update chart with data
    updateChart(data);
    
    // Show chart scanner
    elements.chartScanner.style.display = 'block';
    
    // Update breakout analysis
    updateBreakoutAnalysis(data);
    
    // If in breakout zone, highlight with overlay
    if (data.inBreakoutZone) {
        elements.targetZoneOverlay.style.display = 'block';
        elements.targetZoneLabel.style.display = 'block';
    } else {
        elements.targetZoneOverlay.style.display = 'none';
        elements.targetZoneLabel.style.display = 'none';
    }
}

// Update chart with stock data
function updateChart(data) {
    // Update chart data
    globalState.chartInstance.data.labels = data.timeLabels;
    globalState.chartInstance.data.datasets[0].data = data.priceHistory;
    globalState.chartInstance.data.datasets[0].label = `${data.symbol} Price`;
    
    // Update chart options
    // For stocks in breakout zone, highlight the zone on chart
    if (data.inBreakoutZone) {
        const openPrice = parseFloat(data.openPrice);
        const minBreakoutPrice = openPrice * (1 + config.priceMovementMin / 100);
        const maxBreakoutPrice = openPrice * (1 + config.priceMovementMax / 100);
        
        // Add breakout zone as horizontal line annotations
        globalState.chartInstance.options.plugins.annotation = {
            annotations: {
                breakoutMin: {
                    type: 'line',
                    yMin: minBreakoutPrice,
                    yMax: minBreakoutPrice,
                    borderColor: 'rgba(0, 255, 157, 0.5)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    label: {
                        content: `8% (${minBreakoutPrice.toFixed(2)})`,
                        enabled: true,
                        position: 'left'
                    }
                },
                breakoutMax: {
                    type: 'line',
                    yMin: maxBreakoutPrice,
                    yMax: maxBreakoutPrice,
                    borderColor: 'rgba(0, 255, 157, 0.5)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    label: {
                        content: `13% (${maxBreakoutPrice.toFixed(2)})`,
                        enabled: true,
                        position: 'left'
                    }
                }
            }
        };
    } else {
        // Remove annotations if not in breakout zone
        globalState.chartInstance.options.plugins.annotation = {
            annotations: {}
        };
    }
    
    // Update chart
    globalState.chartInstance.update();
}

// Update breakout analysis panel
function updateBreakoutAnalysis(data) {
    // Show breakout analysis panel
    elements.breakoutAnalysis.style.display = 'block';
    
    // Parse values
    const percentChange = parseFloat(data.percentChange);
    const volumeMultiplier = parseFloat(data.volumeMultiplier);
    
    // Update price increase criteria
    elements.priceIncreaseValue.textContent = `${percentChange >= 0 ? '+' : ''}${percentChange}%`;
    
    if (percentChange >= 0) {
        elements.priceIncreaseIcon.className = 'criteria-icon pass';
        elements.priceIncreaseIcon.innerHTML = '<i class="fas fa-check"></i>';
    } else {
        elements.priceIncreaseIcon.className = 'criteria-icon fail';
        elements.priceIncreaseIcon.innerHTML = '<i class="fas fa-times"></i>';
    }
    
    // Update volume increase criteria
    elements.volumeIncreaseValue.textContent = `${volumeMultiplier}x avg`;
    
    if (volumeMultiplier >= config.volumeMultiplier) {
        elements.volumeIncreaseIcon.className = 'criteria-icon pass';
        elements.volumeIncreaseIcon.innerHTML = '<i class="fas fa-check"></i>';
    } else {
        elements.volumeIncreaseIcon.className = 'criteria-icon warning';
        elements.volumeIncreaseIcon.innerHTML = '<i class="fas fa-exclamation"></i>';
    }
    
    // Update target range criteria
    elements.targetRangeValue.textContent = `${config.priceMovementMin}% - ${config.priceMovementMax}%`;
    
    if (percentChange >= config.priceMovementMin && percentChange <= config.priceMovementMax) {
        elements.targetRangeIcon.className = 'criteria-icon pass';
        elements.targetRangeIcon.innerHTML = '<i class="fas fa-check"></i>';
    } else if (percentChange > config.priceMovementMax) {
        elements.targetRangeIcon.className = 'criteria-icon warning';
        elements.targetRangeIcon.innerHTML = '<i class="fas fa-exclamation"></i>';
    } else {
        elements.targetRangeIcon.className = 'criteria-icon fail';
        elements.targetRangeIcon.innerHTML = '<i class="fas fa-times"></i>';
    }
    
    // Update breakout status
    if (percentChange >= config.priceMovementMin && percentChange <= config.priceMovementMax) {
        elements.breakoutStatus.textContent = 'IN TARGET ZONE';
        elements.breakoutStatus.className = 'analysis-status alert';
        
        // Update critical zone status
        elements.zoneStatus.textContent = 'IN TARGET ZONE';
        elements.zoneStatus.className = 'critical-zone-status in-zone';
        
        // Position current value indicator in zone chart
        const zonePosition = ((percentChange - config.priceMovementMin) / (config.priceMovementMax - config.priceMovementMin)) * 25 + 40;
        elements.criticalZone.querySelector('.current-value').style.left = `${zonePosition}%`;
    } else if (percentChange > config.priceMovementMax) {
        elements.breakoutStatus.textContent = 'ABOVE TARGET';
        elements.breakoutStatus.className = 'analysis-status warning';
        
        // Update critical zone status
        elements.zoneStatus.textContent = 'ABOVE TARGET';
        elements.zoneStatus.className = 'critical-zone-status';
        
        // Position current value indicator in zone chart
        elements.criticalZone.querySelector('.current-value').style.left = '70%';
    } else {
        elements.breakoutStatus.textContent = 'BELOW TARGET';
        elements.breakoutStatus.className = 'analysis-status normal';
        
        // Update critical zone status
        elements.zoneStatus.textContent = 'BELOW TARGET';
        elements.zoneStatus.className = 'critical-zone-status';
        
        // Position current value indicator in zone chart
        elements.criticalZone.querySelector('.current-value').style.left = '20%';
    }
}

// Check for breakout and create alert if conditions met
function checkForBreakout(symbol) {
    // Get stock data
    const data = globalState.stockData[symbol];
    if (!data) return; // Skip if no data available
    
    // Parse values
    const percentChange = parseFloat(data.percentChange);
    const volumeMultiplier = parseFloat(data.volumeMultiplier);
    const breakoutProbability = parseFloat(data.breakoutProbability);
    
    // Check if stock meets breakout criteria
    if (percentChange >= config.priceMovementMin && 
        percentChange <= config.priceMovementMax && 
        volumeMultiplier >= config.volumeMultiplier &&
        breakoutProbability >= config.alertThreshold) {
        
        // Check if alert already exists for this stock
        const existingAlert = globalState.alerts.find(alert => 
            alert.symbol === symbol && 
            new Date() - alert.timestamp < 1000 * 60 * 60 // Only once per hour
        );
        
        if (!existingAlert) {
            // Create new alert
            createBreakoutAlert(symbol, data);
        }
    }
}

// Create breakout alert
function createBreakoutAlert(symbol, data) {
    console.log(`Breakout detected for ${symbol}!`);
    
    // Create alert object
    const alert = {
        id: Date.now(),
        symbol,
        price: data.currentPrice,
        percentChange: data.percentChange,
        volumeMultiplier: data.volumeMultiplier,
        breakoutProbability: data.breakoutProbability,
        timestamp: new Date()
    };
    
    // Add to alerts array (at the beginning)
    globalState.alerts.unshift(alert);
    
    // Limit to 20 alerts
    if (globalState.alerts.length > 20) {
        globalState.alerts.pop();
    }
    
    // Update UI
    updateAlertsList();
    incrementAlertCounter();
    
    // Show popup notification
    showAlertPopup(alert);
    
    // Play sound if enabled
    if (globalState.soundEnabled) {
        elements.alertSound.play();
    }
    
    // Update alert level to "high"
    updateAlertLevel('high');
}

// Show alert popup
function showAlertPopup(alert) {
    // Update popup content
    const popup = elements.alertPopup;
    
    // Update stock symbol and price
    popup.querySelector('.alert-popup-stock').innerHTML = `
        ${alert.symbol}
        <div class="alert-popup-price">$${parseFloat(alert.price).toFixed(2)}</div>
    `;
    
    // Update metrics
    popup.querySelector('.alert-popup-metrics').innerHTML = `
        <div class="alert-popup-metric">
            <div class="alert-popup-metric-label">Change</div>
            <div class="alert-popup-metric-value highlight">+${parseFloat(alert.percentChange).toFixed(1)}%</div>
        </div>
        <div class="alert-popup-metric">
            <div class="alert-popup-metric-label">Volume</div>
            <div class="alert-popup-metric-value highlight">${parseFloat(alert.volumeMultiplier).toFixed(1)}x Avg</div>
        </div>
        <div class="alert-popup-metric">
            <div class="alert-popup-metric-label">Probability</div>
            <div class="alert-popup-metric-value highlight">${parseFloat(alert.breakoutProbability)}%</div>
        </div>
    `;
    
    // Update message
    popup.querySelector('.alert-popup-message').textContent = 
        `Asset is currently in the critical 8-13% breakout zone with high volume and strong momentum indicators. 
        Historical patterns show ${Math.round(alert.breakoutProbability)}% probability of continued upward momentum.`;
    
    // Store current alert ID
    popup.setAttribute('data-alert-id', alert.id);
    
    // Show popup
    popup.style.display = 'block';
}

// Hide alert popup
function hideAlertPopup() {
    elements.alertPopup.style.display = 'none';
}

// View alert details
function viewAlertDetails() {
    // Get alert ID from popup
    const alertId = elements.alertPopup.getAttribute('data-alert-id');
    
    // Find alert in alerts array
    const alert = globalState.alerts.find(a => a.id.toString() === alertId);
    if (!alert) return;
    
    // Select stock
    selectStock(alert.symbol);
    
    // Hide popup
    hideAlertPopup();
}

// Update alerts list
function updateAlertsList() {
    // Update main alerts list
    if (globalState.alerts.length === 0) {
        // Show empty state
        elements.alertsList.innerHTML = `
            <div class="empty-alerts">
                <i class="fas fa-satellite-dish"></i>
                <div>No breakout alerts detected yet</div>
                <div>pE-QuantumEdge™ engine actively scanning market</div>
            </div>
        `;
    } else {
        // Clear list
        elements.alertsList.innerHTML = '';
        
        // Add alerts (limit to 5 for main list)
        const recentAlerts = globalState.alerts.slice(0, 5);
        
        recentAlerts.forEach(alert => {
            const alertItem = document.createElement('div');
            alertItem.className = 'alert-item';
            
            alertItem.innerHTML = `
                <div class="alert-item-header">
                    <div class="alert-item-stock">
                        <i class="fas fa-bolt alert-item-icon"></i> ${alert.symbol}
                    </div>
                    <div class="alert-item-time">${formatAlertTime(alert.timestamp)}</div>
                </div>
                <div class="alert-item-details">
                    <div class="alert-item-metrics">
                        <div class="alert-item-metric">
                            <span>+${parseFloat(alert.percentChange).toFixed(1)}%</span>
                        </div>
                        <div class="alert-item-metric">
                            <span>${parseFloat(alert.volumeMultiplier).toFixed(1)}x Vol</span>
                        </div>
                    </div>
                    <div class="alert-item-probability">
                        ${parseFloat(alert.breakoutProbability)}% prob
                    </div>
                </div>
                <div class="alert-item-actions">
                    <button class="alert-action primary" data-symbol="${alert.symbol}">View Analysis</button>
                </div>
            `;
            
            // Add click event for view button
            alertItem.querySelector('.alert-action').addEventListener('click', () => {
                selectStock(alert.symbol);
            });
            
            elements.alertsList.appendChild(alertItem);
        });
    }
    
    // Update all alerts list in modal
    if (globalState.alerts.length === 0) {
        // Show empty state
        elements.allAlertsList.innerHTML = `
            <div class="empty-alerts">
                <i class="fas fa-satellite-dish"></i>
                <div>No breakout alerts detected yet</div>
                <div>pE-QuantumEdge™ engine actively scanning market</div>
            </div>
        `;
    } else {
        // Clear list
        elements.allAlertsList.innerHTML = '';
        
        // Add all alerts
        globalState.alerts.forEach(alert => {
            const alertItem = document.createElement('div');
            alertItem.className = 'alert-item';
            
            alertItem.innerHTML = `
                <div class="alert-item-header">
                    <div class="alert-item-stock">
                        <i class="fas fa-bolt alert-item-icon"></i> ${alert.symbol}
                    </div>
                    <div class="alert-item-time">${formatAlertTime(alert.timestamp)}</div>
                </div>
                <div class="alert-item-details">
                    <div class="alert-item-metrics">
                        <div class="alert-item-metric">
                            <span>+${parseFloat(alert.percentChange).toFixed(1)}%</span>
                        </div>
                        <div class="alert-item-metric">
                            <span>${parseFloat(alert.volumeMultiplier).toFixed(1)}x Vol</span>
                        </div>
                    </div>
                    <div class="alert-item-probability">
                        ${parseFloat(alert.breakoutProbability)}% prob
                    </div>
                </div>
                <div class="alert-item-actions">
                    <button class="alert-action primary" data-symbol="${alert.symbol}">View Analysis</button>
                </div>
            `;
            
            // Add click event for view button
            alertItem.querySelector('.alert-action').addEventListener('click', () => {
                selectStock(alert.symbol);
                closeModal('alertsModal');
            });
            
            elements.allAlertsList.appendChild(alertItem);
        });
    }
}

// Format alert time
function formatAlertTime(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    
    if (diff < 60000) {
        return 'Just now';
    } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}h ago`;
    } else {
        return `${Math.floor(diff / 86400000)}d ago`;
    }
}

// Increment alert counter
function incrementAlertCounter() {
    globalState.alertCount++;
    elements.alertCounter.textContent = globalState.alertCount;
    elements.alertCounter.style.display = 'flex';
}

// Reset alert counter
function resetAlertCounter() {
    globalState.alertCount = 0;
    elements.alertCounter.style.display = 'none';
}

// Update alert level indicator
function updateAlertLevel(level) {
    const indicator = elements.alertLevelIndicator;
    
    // Remove existing classes
    indicator.classList.remove('normal', 'high', 'critical');
    
    // Add new class based on level
    if (level === 'high') {
        indicator.classList.add('high');
        indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> BREAKOUTS DETECTED';
    } else if (level === 'critical') {
        indicator.classList.add('critical');
        indicator.innerHTML = '<i class="fas fa-radiation"></i> CRITICAL ALERT';
    } else {
        indicator.classList.add('normal');
        indicator.innerHTML = '<i class="fas fa-shield-alt"></i> SYSTEM ARMED';
    }
}

// Update connection status
function updateConnectionStatus(status) {
    globalState.connectionStatus = status;
    
    const indicator = elements.connectionStatus.querySelector('.status-indicator');
    const text = elements.connectionStatus.querySelector('.status-text');
    
    // Remove existing classes
    indicator.classList.remove('connected', 'disconnected', 'connecting');
    
    // Update based on status
    if (status === 'connected') {
        indicator.classList.add('connected');
        text.textContent = 'ONLINE';
    } else if (status === 'connecting') {
        indicator.classList.add('connecting');
        text.textContent = 'CONNECTING';
    } else {
        indicator.classList.add('disconnected');
        text.textContent = 'OFFLINE';
    }
}

// Update sound toggle
function updateSoundToggle() {
    if (globalState.soundEnabled) {
        elements.soundToggle.classList.add('active');
        elements.soundToggle.innerHTML = '<i class="fas fa-volume-up"></i>';
    } else {
        elements.soundToggle.classList.remove('active');
        elements.soundToggle.innerHTML = '<i class="fas fa-volume-mute"></i>';
    }
}

// ===== Event Handler Methods =====

// Open modal
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Toggle visibility of API key
function toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('apiKey');
    const toggleBtn = document.getElementById('toggleApiVisibility');
    
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        apiKeyInput.type = 'password';
        toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// Toggle sound
function toggleSound() {
    globalState.soundEnabled = !globalState.soundEnabled;
    localStorage.setItem('soundEnabled', globalState.soundEnabled);
    updateSoundToggle();
}

// Handle settings form submission
function handleSettingsSubmit(e) {
    e.preventDefault();
    
    // Get form values
    const minPriceMovement = parseFloat(document.getElementById('minPriceMovement').value);
    const maxPriceMovement = parseFloat(document.getElementById('maxPriceMovement').value);
    const volumeMultiplier = parseFloat(document.getElementById('volumeMultiplier').value);
    const updateInterval = parseInt(document.getElementById('updateInterval').value);
    const apiKey = document.getElementById('apiKey').value;
    const connectionType = document.getElementById('connectionType').value;
    const alertThreshold = parseInt(document.getElementById('alertThreshold').value);
    
    // Validate input
    if (minPriceMovement >= maxPriceMovement) {
        document.getElementById('settingsMessage').innerHTML = 
            '<div class="form-message error"><i class="fas fa-exclamation-circle"></i>Min price movement must be less than max</div>';
        return;
    }
    
    // Update config
    config.priceMovementMin = minPriceMovement;
    config.priceMovementMax = maxPriceMovement;
    config.volumeMultiplier = volumeMultiplier;
    config.updateInterval = updateInterval;
    config.apiKey = apiKey;
    config.connectionType = connectionType;
    config.alertThreshold = alertThreshold;
    
    // Save API key and connection type to localStorage
    localStorage.setItem('apiKey', apiKey);
    localStorage.setItem('connectionType', connectionType);
    
    // Close modal
    closeModal('settingsModal');
    
    // Show success message
    document.getElementById('settingsMessage').innerHTML = 
        '<div class="form-message success"><i class="fas fa-check-circle"></i>Settings saved successfully</div>';
    
    // Initialize system if not already initialized
    if (!globalState.isInitialized) {
        initSystem();
    } else {
        // Reinitialize data connection with new settings
        if (globalState.dataFeed) {
            clearInterval(globalState.dataFeed);
        }
        
        if (connectionType === 'websocket') {
            initWebSocket();
        } else {
            initPollingConnection();
        }
    }
}

// Handle add stock form submission
function handleAddStockSubmit(e) {
    e.preventDefault();
    
    // Get form values
    const symbol = document.getElementById('stockSymbol').value.toUpperCase();
    const priority = document.getElementById('watchPriority').value;
    
    // Validate symbol
    if (!symbol || symbol.length > 6) {
        document.getElementById('addStockMessage').innerHTML = 
            '<div class="form-message error"><i class="fas fa-exclamation-circle"></i>Invalid stock symbol</div>';
        return;
    }
    
    // Check if already in watchlist
    const existingStock = globalState.watchlist.find(stock => stock.symbol === symbol);
    if (existingStock) {
        document.getElementById('addStockMessage').innerHTML = 
            '<div class="form-message error"><i class="fas fa-exclamation-circle"></i>Stock already in watchlist</div>';
        return;
    }
    
    // Add to watchlist
    const newStock = {
        symbol,
        name: '', // Will be updated when data is fetched
        priority
    };
    
    globalState.watchlist.push(newStock);
    
    // Save watchlist
    saveWatchlist();
    
    // Fetch data for new stock
    fetchStockData(symbol).then(data => {
        if (!data) {
            document.getElementById('addStockMessage').innerHTML = 
                '<div class="form-message error"><i class="fas fa-exclamation-circle"></i>Failed to fetch data for symbol</div>';
            return;
        }
        
        // Update stock name
        newStock.name = data.companyName;
        
        // Store data
        globalState.stockData[symbol] = data;
        
        // Update watchlist
        renderWatchlist();
        
        // Close modal
        closeModal('addStockModal');
        
        // Reset form
        document.getElementById('stockSymbol').value = '';
        
        // Show success message
        document.getElementById('addStockMessage').innerHTML = 
            '<div class="form-message success"><i class="fas fa-check-circle"></i>Stock added successfully</div>';
        
        // Select the new stock
        selectStock(symbol);
    });
}

// Toggle filter menu
function toggleFilterMenu() {
    elements.filterMenu.classList.toggle('show');
}

// Apply filter to alerts
function applyFilter(filter) {
    console.log(`Applying filter: ${filter}`);
    
    // Filter alerts based on selected filter
    let filteredAlerts = [];
    
    if (filter === 'all') {
        filteredAlerts = globalState.alerts;
    } else if (filter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        filteredAlerts = globalState.alerts.filter(alert => {
            const alertDate = new Date(alert.timestamp);
            return alertDate >= today;
        });
    } else if (filter === '8to13') {
        filteredAlerts = globalState.alerts.filter(alert => {
            const percentChange = parseFloat(alert.percentChange);
            return percentChange >= 8 && percentChange <= 13;
        });
    }
    
    // Update UI with filtered alerts
    if (filteredAlerts.length === 0) {
        elements.alertsList.innerHTML = `
            <div class="empty-alerts">
                <i class="fas fa-filter"></i>
                <div>No alerts match the selected filter</div>
                <div>Try a different filter or wait for new alerts</div>
            </div>
        `;
        
        elements.allAlertsList.innerHTML = `
            <div class="empty-alerts">
                <i class="fas fa-filter"></i>
                <div>No alerts match the selected filter</div>
                <div>Try a different filter or wait for new alerts</div>
            </div>
        `;
    } else {
        // Update both alert lists with filtered alerts
        // Code similar to updateAlertsList but using filteredAlerts instead
        // Skipping implementation for brevity
    }
}

// Filter watchlist by search input
function filterWatchlist() {
    const query = elements.stockSearch.value.toLowerCase();
    
    // Get all stock cards
    const stockCards = elements.watchlist.querySelectorAll('.stock-card');
    
    // Show/hide based on query
    stockCards.forEach(card => {
        const symbol = card.getAttribute('data-symbol').toLowerCase();
        const name = card.querySelector('.stock-name').textContent.toLowerCase();
        
        if (symbol.includes(query) || name.includes(query)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// Filter watchlist by tag
function filterWatchlistByTag(tag) {
    console.log(`Filtering by tag: ${tag}`);
    
    // Get all stock cards
    const stockCards = elements.watchlist.querySelectorAll('.stock-card');
    
    // Show/hide based on tag
    stockCards.forEach(card => {
        const symbol = card.getAttribute('data-symbol');
        const data = globalState.stockData[symbol];
        
        if (!data) return; // Skip if no data
        
        if (tag === 'all') {
            card.style.display = 'flex';
        } else if (tag === 'breakout zone') {
            if (data.inBreakoutZone) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        } else if (tag === '8-10%') {
            const percentChange = parseFloat(data.percentChange);
            if (percentChange >= 8 && percentChange <= 10) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        } else if (tag === '10-13%') {
            const percentChange = parseFloat(data.percentChange);
            if (percentChange > 10 && percentChange <= 13) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        } else if (tag === 'high volume') {
            if (data.highVolume) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        }
    });
}

// Change chart timeframe
function changeChartTimeframe(timeframe) {
    console.log(`Changing chart timeframe to ${timeframe}`);
    
    // Get selected stock data
    const symbol = globalState.selectedStock;
    if (!symbol) return;
    
    const data = globalState.stockData[symbol];
    if (!data) return;
    
    // In a real app, this would fetch new data for the selected timeframe
    // For this demo, we'll simulate different timeframes with the existing data
    
    if (timeframe === 'RT') {
        // Real-time view (most granular)
        // Use all data points
        updateChart(data);
    } else if (timeframe === '1D') {
        // Daily view
        // Use all data points but with less granularity
        const newData = {...data};
        
        // Sample every 5th point for less granularity
        newData.timeLabels = data.timeLabels.filter((_, i) => i % 5 === 0 || i === data.timeLabels.length - 1);
        newData.priceHistory = data.priceHistory.filter((_, i) => i % 5 === 0 || i === data.priceHistory.length - 1);
        
        updateChart(newData);
    } else if (timeframe === '1W') {
        // Weekly view - simulated by even less granular data
        const newData = {...data};
        
        // Sample every 10th point
        newData.timeLabels = data.timeLabels.filter((_, i) => i % 10 === 0 || i === data.timeLabels.length - 1);
        newData.priceHistory = data.priceHistory.filter((_, i) => i % 10 === 0 || i === data.priceHistory.length - 1);
        
        updateChart(newData);
    } else {
        // For 1M, 3M, 1Y timeframes, we'd fetch historical data
        // For this demo, we'll just show a message
        globalState.chartInstance.data.labels = [];
        globalState.chartInstance.data.datasets[0].data = [];
        globalState.chartInstance.update();
        
        elements.stockChart.style.display = 'none';
        elements.chartPlaceholder.style.display = 'flex';
        elements.chartPlaceholder.innerHTML = `
            <i class="fas fa-chart-line"></i>
            <div>Historical data for ${timeframe} timeframe would be displayed here</div>
        `;
        
        setTimeout(() => {
            // After a delay, go back to default view
            if (globalState.selectedStock === symbol) {
                elements.chartPlaceholder.style.display = 'none';
                elements.stockChart.style.display = 'block';
                updateChart(data);
                
                // Reset timeframe to 1D
                document.querySelectorAll('.time-btn').forEach(btn => {
                    if (btn.dataset.timeframe === '1D') {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }
        }, 2000);
    }
}

// ===== Utility Functions =====

// Find stock name by symbol
function findStockName(symbol) {
    const stock = globalState.watchlist.find(s => s.symbol === symbol);
    if (stock && stock.name) return stock.name;
    
    // If not found in watchlist or name is empty, generate a generic name
    return `${symbol} Inc.`;
}

// Generate a hash code from a string
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash



return Math.abs(hash);
}

// Generate a random number using a seed
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}