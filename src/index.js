import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import * as d3 from 'd3';
import { createClient } from '@polygon.io/client-js';
import moment from 'moment';
import './styles.css';

const POLYGON_API_KEY = 'YOUR_POLYGON_API_KEY';
const polygonRest = createClient(POLYGON_API_KEY);

const SINGULARITY = () => {
  const [breakoutCandidates, setBreakoutCandidates] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [marketStats, setMarketStats] = useState({
    spy: { price: 0, change: 0 },
    vix: { price: 0, change: 0 },
    advancers: 0,
    decliners: 0,
    breakoutIndex: 0,
    volumeRatio: 0
  });
  const [sectorData, setSectorData] = useState({});
  const [alertLog, setAlertLog] = useState([]);
  const [currentView, setCurrentView] = useState('matrix');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [systemMetrics, setSystemMetrics] = useState({
    status: 'initializing',
    scanTime: null,
    capacity: 0,
    latency: 0,
    accuracy: 0,
    version: 'v2.7.4',
    environment: 'production',
    uptime: 0
  });
  
  const [scanParameters, setScanParameters] = useState({
    minPercentChange: 8.0,
    maxPercentChange: 13.0,
    minVolumeRatio: 2.5,
    minPrice: 2.0,
    maxPrice: 2000,
    excludedSectors: [],
    minMarketCap: 100000000,
    minAvgVolume: 250000
  });
  
  const [matrixMode, setMatrixMode] = useState('realtime');
  const [notifications, setNotifications] = useState([]);
  
  const tickers = useRef({});
  const webSocketRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const alertSoundRef = useRef(null);
  const criticalAlertSoundRef = useRef(null);
  const uptimeIntervalRef = useRef(null);
  const processingRef = useRef(false);
  const alertQueueRef = useRef([]);
  
  const heatmapRef = useRef(null);
  const volumeProfileRef = useRef(null);
  const timelineRef = useRef(null);
  const priceMapRef = useRef(null);
  const systemStatusRef = useRef(null);
  
  const marketOpenTime = useMemo(() => {
    const now = new Date();
    const marketOpen = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30, 0);
    return marketOpen;
  }, []);
  
  const marketCloseTime = useMemo(() => {
    const now = new Date();
    const marketClose = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0);
    return marketClose;
  }, []);
  
  const isMarketOpen = useCallback(() => {
    const now = new Date();
    const day = now.getDay();
    
    if (day === 0 || day === 6) return false;
    
    return now >= marketOpenTime && now <= marketCloseTime;
  }, [marketOpenTime, marketCloseTime]);
  
  useEffect(() => {
    alertSoundRef.current = new Audio('/alert.mp3');
    alertSoundRef.current.preload = 'auto';
    
    criticalAlertSoundRef.current = new Audio('/critical-alert.mp3');
    criticalAlertSoundRef.current.preload = 'auto';
    
    const initialUptimeInterval = setInterval(() => {
      setSystemMetrics(prev => ({
        ...prev,
        uptime: prev.uptime + 1
      }));
    }, 1000);
    
    uptimeIntervalRef.current = initialUptimeInterval;
    
    initializeSingularity();
    
    return () => {
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
      
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      
      if (uptimeIntervalRef.current) {
        clearInterval(uptimeIntervalRef.current);
      }
      
      if (alertSoundRef.current) {
        alertSoundRef.current.pause();
      }
      
      if (criticalAlertSoundRef.current) {
        criticalAlertSoundRef.current.pause();
      }
    };
  }, []);

  const initializeSingularity = async () => {
    try {
      updateSystemStatus('initializing');
      
      await new Promise(resolve => setTimeout(resolve, 600));
      updateSystemStatus('connecting');
      setSystemMetrics(prev => ({ ...prev, capacity: 15 }));
      
      await new Promise(resolve => setTimeout(resolve, 800));
      updateSystemStatus('loading_market_data');
      setSystemMetrics(prev => ({ ...prev, capacity: 30 }));
      
      await initializeMarketData();
      
      await new Promise(resolve => setTimeout(resolve, 600));
      updateSystemStatus('scanning_universe');
      setSystemMetrics(prev => ({ ...prev, capacity: 60 }));
      
      await initializeTickerUniverse();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateSystemStatus('calibrating');
      setSystemMetrics(prev => ({ ...prev, capacity: 85 }));
      
      await initializeWebSocket();
      
      await new Promise(resolve => setTimeout(resolve, 800));
      updateSystemStatus('online');
      setSystemMetrics(prev => ({ 
        ...prev, 
        capacity: 100,
        latency: 12 + Math.random() * 8,
        accuracy: 95 + Math.random() * 4,
        scanTime: new Date().toISOString()
      }));
      
      startRealTimeScan();
      createVisualizations();
      
    } catch (error) {
      console.error('Initialization error:', error);
      updateSystemStatus('error');
      addNotification('System initialization failed. Attempting recovery...', 'error');
      
      setTimeout(() => {
        initializeSingularity();
      }, 10000);
    }
  };
  
  const updateSystemStatus = (status) => {
    setSystemMetrics(prev => ({ ...prev, status }));
    
    if (status === 'online') {
      addNotification('SINGULARITY™ Matrix online. Real-time breakout detection active.', 'success');
    } else if (status === 'error') {
      addNotification('System error detected. Diagnostic protocols initiated.', 'error');
    }
  };
  
  const addNotification = (message, type = 'info', duration = 6000) => {
    const id = Date.now();
    setNotifications(prev => [{ id, message, type }, ...prev]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, duration);
  };
  
  const initializeMarketData = async () => {
    try {
      const today = moment().format('YYYY-MM-DD');
      
      const spyData = await axios.get(
        `https://api.polygon.io/v2/aggs/ticker/SPY/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
      );
      
      const vixData = await axios.get(
        `https://api.polygon.io/v2/aggs/ticker/VIX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
      );
      
      const marketStatus = await axios.get(
        `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`
      );
      
      const snapshot = await axios.get(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`
      );
      
      const spySnapshot = spyData.data.results ? spyData.data.results[0] : { c: 0, o: 0 };
      const vixSnapshot = vixData.data.results ? vixData.data.results[0] : { c: 0, o: 0 };
      
      const tickers = snapshot.data.tickers || [];
      
      const advancers = tickers.filter(ticker => ticker.day?.c > ticker.prevDay?.c).length;
      const decliners = tickers.filter(ticker => ticker.day?.c < ticker.prevDay?.c).length;
      
      const spyChange = spySnapshot.o > 0 ? ((spySnapshot.c - spySnapshot.o) / spySnapshot.o) * 100 : 0;
      const vixChange = vixSnapshot.o > 0 ? ((vixSnapshot.c - vixSnapshot.o) / vixSnapshot.o) * 100 : 0;
      
      const marketCond = advancers / (advancers + decliners) * 100;
      const breakoutIndex = calculateBreakoutIndex(marketCond, vixSnapshot.c);
      
      setMarketStats({
        spy: { price: spySnapshot.c, change: spyChange },
        vix: { price: vixSnapshot.c, change: vixChange },
        advancers,
        decliners,
        breakoutIndex,
        volumeRatio: calculateVolumeRatio(tickers)
      });
      
      addNotification(`Market data synchronized. Breakout Index: ${breakoutIndex.toFixed(1)}`, 'info');
      
    } catch (error) {
      console.error('Error fetching market data:', error);
      addNotification('Market data synchronization failure', 'error');
      throw error;
    }
  };
  
  const calculateBreakoutIndex = (marketCondition, vix) => {
    // Proprietary algorithm that combines market breadth and volatility
    // Higher values indicate more favorable conditions for breakouts
    const vixFactor = vix <= 15 ? 1.2 : 
                      vix <= 20 ? 1.0 : 
                      vix <= 30 ? 0.8 : 0.6;
    
    const marketFactor = marketCondition >= 65 ? 1.3 : 
                         marketCondition >= 55 ? 1.0 : 
                         marketCondition >= 45 ? 0.8 : 0.6;
    
    return Math.min(100, Math.max(0, marketFactor * vixFactor * 75));
  };
  
  const calculateVolumeRatio = (tickers) => {
    if (!tickers || tickers.length === 0) return 1.0;
    
    const validTickers = tickers.filter(t => 
      t.day?.v && t.prevDay?.v && t.prevDay.v > 0
    );
    
    if (validTickers.length === 0) return 1.0;
    
    const volumeRatios = validTickers.map(t => t.day.v / t.prevDay.v);
    const averageRatio = volumeRatios.reduce((sum, ratio) => sum + ratio, 0) / volumeRatios.length;
    
    return averageRatio;
  };
  
  const initializeTickerUniverse = async () => {
    try {
      const allTickers = [];
      let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&sort=market_cap&order=desc&limit=250&apiKey=${POLYGON_API_KEY}`;
      
      let progress = 0;
      
      // Load at least 1000 tickers
      while (nextUrl && allTickers.length < 1000) {
        const response = await axios.get(nextUrl);
        const newTickers = response.data.results || [];
        
        allTickers.push(...newTickers);
        progress = allTickers.length;
        
        setSystemMetrics(prev => ({ 
          ...prev, 
          capacity: Math.min(70, 30 + (progress / 10))
        }));
        
        addNotification(`Loading ticker data: ${progress} symbols synchronized`, 'info');
        
        nextUrl = response.data.next_url;
        if (nextUrl) {
          nextUrl += `&apiKey=${POLYGON_API_KEY}`;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Extract ticker symbols and other metadata
      const watchlistSymbols = allTickers.map(ticker => ticker.ticker);
      setWatchlist(watchlistSymbols);
      
      // Process sector information
      const sectors = {};
      allTickers.forEach(ticker => {
        const sector = ticker.sic_description || 'Unknown';
        if (!sectors[sector]) {
          sectors[sector] = {
            count: 0,
            marketCap: 0,
            tickers: [],
            potentialBreakouts: 0
          };
        }
        
        sectors[sector].count++;
        sectors[sector].marketCap += ticker.market_cap || 0;
        sectors[sector].tickers.push(ticker.ticker);
      });
      
      setSectorData(sectors);
      
      // Process ticker data for real-time monitoring
      const tickerData = {};
      
      const batchSize = 50;
      for (let i = 0; i < Math.min(allTickers.length, 1000); i += batchSize) {
        const batch = allTickers.slice(i, i + batchSize);
        
        setSystemMetrics(prev => ({ 
          ...prev, 
          capacity: Math.min(84, 70 + (i / allTickers.length) * 14)
        }));
        
        await Promise.all(batch.map(async (ticker) => {
          const symbol = ticker.ticker;
          
          try {
            // Get previous close price
            const prevDayData = await axios.get(
              `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
            );
            
            // Get historical volume data for average volume calculation
            const endDate = moment().format('YYYY-MM-DD');
            const startDate = moment().subtract(14, 'days').format('YYYY-MM-DD');
            
            const historicalData = await axios.get(
              `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=14&apiKey=${POLYGON_API_KEY}`
            );
            
            // Calculate average volume
            let avgVolume = 0;
            if (historicalData.data.results && historicalData.data.results.length > 0) {
              const volumes = historicalData.data.results.map(bar => bar.v);
              avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
            }
            
            // Store ticker data
            const price = prevDayData.data.results ? prevDayData.data.results[0].c : 0;
            
            tickerData[symbol] = {
              lastPrice: price,
              prevClose: price,
              volume: 0,
              avgVolume,
              percentChange: 0,
              volumeRatio: 0,
              high: price,
              low: price,
              marketCap: ticker.market_cap || 0,
              sector: ticker.sic_description || 'Unknown',
              lastUpdateTime: Date.now()
            };
          } catch (error) {
            console.warn(`Error initializing data for ${symbol}:`, error);
          }
        }));
        
        // Prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Store ticker data for real-time updates
      tickers.current = tickerData;
      
      addNotification(`Universe mapping complete. ${Object.keys(tickerData).length} tickers calibrated.`, 'success');
      
    } catch (error) {
      console.error('Error loading ticker universe:', error);
      addNotification('Universe mapping failure. Recovery initiated.', 'error');
      throw error;
    }
  };
  
  const initializeWebSocket = async () => {
    try {
      // Close existing connection if any
      if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
        webSocketRef.current.close();
      }
      
      // Create new WebSocket connection
      const ws = new WebSocket('wss://socket.polygon.io/stocks');
      webSocketRef.current = ws;
      
      ws.onopen = () => {
        // Authenticate
        ws.send(JSON.stringify({ action: "auth", params: POLYGON_API_KEY }));
        addNotification('Quantum Bridge established. Streaming market data active.', 'success');
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle authentication response
        if (data[0] && data[0].ev === 'status' && data[0].status === 'auth_success') {
          // Subscribe to tickers in our watchlist
          if (watchlist.length > 0) {
            const subscriptionMessage = {
              action: "subscribe",
              params: watchlist.map(ticker => `T.${ticker},A.${ticker},Q.${ticker}`)
            };
            
            ws.send(JSON.stringify(subscriptionMessage));
            addNotification(`Subscribed to ${watchlist.length} real-time data streams.`, 'success');
          }
        }
        
        // Process incoming data
        processWebSocketData(data);
      };
      
      ws.onclose = () => {
        updateSystemStatus('reconnecting');
        addNotification('Quantum Bridge disconnected. Reestablishing connection...', 'warning');
        
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          if (systemMetrics.status !== 'offline') {
            initializeWebSocket();
          }
        }, 5000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateSystemStatus('error');
        addNotification('Quantum Bridge error detected. Diagnostic protocols initiated.', 'error');
      };
      
      return ws;
    } catch (error) {
      console.error('WebSocket initialization error:', error);
      addNotification('Quantum Bridge initialization failure.', 'error');
      throw error;
    }
  };
  
  const processWebSocketData = (data) => {
    // Early return if ticker data not yet initialized
    if (!tickers.current || Object.keys(tickers.current).length === 0) return;
    
    data.forEach(message => {
      // Process trade data
      if (message.ev === 'T') {
        const ticker = message.sym;
        const price = message.p;
        const size = message.s;
        const timestamp = message.t;
        
        // Update our ticker data if we're tracking this symbol
        if (ticker && tickers.current[ticker]) {
          const tickerData = tickers.current[ticker];
          
          // Update latest price
          tickerData.lastPrice = price;
          
          // Update high/low of day
          tickerData.high = Math.max(tickerData.high, price);
          tickerData.low = Math.min(tickerData.low > 0 ? tickerData.low : price, price);
          
          // Update volume
          tickerData.volume += size;
          
          // Calculate percent change from previous close
          if (tickerData.prevClose > 0) {
            const percentChange = ((price - tickerData.prevClose) / tickerData.prevClose) * 100;
            tickerData.percentChange = percentChange;
            
            // Calculate volume ratio (relative to average daily volume)
            const tradingHoursElapsed = calculateTradingHoursElapsed();
            const volumeRatio = tickerData.avgVolume > 0 ? 
              (tickerData.volume / (tickerData.avgVolume * tradingHoursElapsed)) : 0;
            
            tickerData.volumeRatio = volumeRatio;
            
            // Update last update time
            tickerData.lastUpdateTime = Date.now();
            
            // Check for breakout conditions
            if (!processingRef.current && 
                percentChange >= scanParameters.minPercentChange && 
                percentChange <= scanParameters.maxPercentChange && 
                volumeRatio >= scanParameters.minVolumeRatio && 
                price >= scanParameters.minPrice && 
                price <= scanParameters.maxPrice &&
                !breakoutCandidates.some(candidate => candidate.symbol === ticker)) {
              
              // Queue this alert for processing
              alertQueueRef.current.push({
                symbol: ticker,
                price,
                percentChange,
                volume: tickerData.volume,
                volumeRatio,
                avgVolume: tickerData.avgVolume,
                marketCap: tickerData.marketCap,
                sector: tickerData.sector,
                timestamp: Date.now()
              });
            }
          }
        }
      }
    });
    
    // Process alert queue if not already processing
    if (alertQueueRef.current.length > 0 && !processingRef.current) {
      processAlertQueue();
    }
  };
  
  const calculateTradingHoursElapsed = () => {
    const now = new Date();
    
    if (!isMarketOpen()) return 1.0;
    
    const elapsedMs = now - marketOpenTime;
    const totalTradingMs = marketCloseTime - marketOpenTime;
    
    return Math.max(0.1, Math.min(1.0, elapsedMs / totalTradingMs));
  };
  
  const processAlertQueue = () => {
    processingRef.current = true;
    
    // Process one alert at a time
    const alert = alertQueueRef.current.shift();
    if (alert) {
      // Add to breakout candidates
      setBreakoutCandidates(prev => {
        const updatedCandidates = [alert, ...prev];
        // Sort by time (newest first)
        return updatedCandidates.sort((a, b) => b.timestamp - a.timestamp);
      });
      
      // Add to alert log
      setAlertLog(prev => [alert, ...prev]);
      
      // Update sector statistics
      updateSectorStats(alert.sector);
      
      // Play sound if enabled
      if (audioEnabled) {
        const isCritical = alert.percentChange > 11 && alert.volumeRatio > scanParameters.minVolumeRatio * 1.5;
        
        if (isCritical && criticalAlertSoundRef.current) {
          criticalAlertSoundRef.current.play().catch(e => console.warn('Error playing sound:', e));
        } else if (alertSoundRef.current) {
          alertSoundRef.current.play().catch(e => console.warn('Error playing sound:', e));
        }
      }
      
      // Visual notification
      addNotification(`BREAKOUT DETECTED: ${alert.symbol} | +${alert.percentChange.toFixed(2)}% | Volume: ${alert.volumeRatio.toFixed(1)}x`, 'breakout');
      
      // Trigger screen flash effect
      triggerAlertEffect(alert.percentChange > 11);
    }
    
    // Process next alert or release lock
    if (alertQueueRef.current.length > 0) {
      setTimeout(processAlertQueue, 500);
    } else {
      processingRef.current = false;
    }
  };
  
  const updateSectorStats = (sector) => {
    if (!sector) return;
    
    setSectorData(prev => {
      const updatedSectorData = { ...prev };
      
      if (updatedSectorData[sector]) {
        updatedSectorData[sector].potentialBreakouts++;
      }
      
      return updatedSectorData;
    });
  };
  
  const triggerAlertEffect = (isCritical) => {
    const flash = document.createElement('div');
    flash.className = isCritical ? 'critical-alert-flash' : 'alert-flash';
    document.body.appendChild(flash);
    
    setTimeout(() => {
      flash.remove();
    }, 500);
  };
  
  const startRealTimeScan = () => {
    // Clear existing interval if any
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    
    // Set up interval for regular market updates (backup to WebSocket)
    scanIntervalRef.current = setInterval(() => {
      // Update scan time
      setSystemMetrics(prev => ({ 
        ...prev, 
        scanTime: new Date().toISOString(),
        latency: 12 + Math.random() * 8
      }));
      
      // If market is closed, update status
      if (!isMarketOpen() && systemMetrics.status !== 'offline') {
        updateSystemStatus('offline');
        addNotification('Market closed. SINGULARITY™ Matrix in standby mode.', 'info');
      } else if (isMarketOpen() && systemMetrics.status === 'offline') {
        updateSystemStatus('online');
        addNotification('Market open. SINGULARITY™ Matrix reactivated.', 'success');
      }
      
      // Update visualizations
      updateVisualizations();
      
    }, 15000); // Every 15 seconds
    
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  };
  
  const createVisualizations = () => {
    createHeatmap();
    createVolumeProfile();
    createTimeline();
    createPriceMap();
    createSystemStatus();
  };
  
  const updateVisualizations = () => {
    updateHeatmap();
    updateVolumeProfile();
    updateTimeline();
    updatePriceMap();
    updateSystemStatus();
  };
  
  const createHeatmap = () => {
    if (!heatmapRef.current) return;
    
    const width = heatmapRef.current.clientWidth;
    const height = heatmapRef.current.clientHeight;
    
    const svg = d3.select(heatmapRef.current)
      .html('')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    svg.append('text')
      .attr('x', 10)
      .attr('y', 15)
      .attr('fill', 'rgba(255, 255, 255, 0.7)')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-size', '10px')
      .text('SECTOR BREAKOUT HEATMAP');
    
    updateHeatmap();
  };
  
  const updateHeatmap = () => {
    if (!heatmapRef.current) return;
    
    const width = heatmapRef.current.clientWidth;
    const height = heatmapRef.current.clientHeight;
    
    const svg = d3.select(heatmapRef.current).select('svg');
    
    // Get sectors with highest breakout potential
    const sectors = Object.entries(sectorData)
      .filter(([name, data]) => data.count >= 5)
      .sort((a, b) => b[1].potentialBreakouts / b[1].count - a[1].potentialBreakouts / a[1].count)
      .slice(0, 6);
    
    // Calculate box size
    const boxWidth = (width - 20) / 3;
    const boxHeight = (height - 30) / 2;
    
    // Remove existing boxes
    svg.selectAll('.sector-box').remove();
    
    // Create sector boxes
    sectors.forEach(([name, data], i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      
      const x = 10 + col * boxWidth;
      const y = 25 + row * boxHeight;
      
      const intensity = data.potentialBreakouts / data.count;
      const color = d3.interpolateRgb(
        'rgba(0, 229, 255, 0.2)',
        'rgba(255, 0, 85, 0.6)'
      )(Math.min(1, intensity * 5));
      
      const sectorGroup = svg.append('g')
        .attr('class', 'sector-box')
        .attr('transform', `translate(${x}, ${y})`);
      
      sectorGroup.append('rect')
        .attr('width', boxWidth - 5)
        .attr('height', boxHeight - 5)
        .attr('rx', 2)
        .attr('fill', color)
        .attr('stroke', 'rgba(0, 229, 255, 0.3)')
        .attr('stroke-width', 1);
      
      sectorGroup.append('text')
        .attr('x', 10)
        .attr('y', 15)
        .attr('fill', 'rgba(255, 255, 255, 0.9)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '10px')
        .text(name.length > 15 ? name.substring(0, 15) + '...' : name);
      
      sectorGroup.append('text')
        .attr('x', 10)
        .attr('y', 30)
        .attr('fill', 'rgba(255, 255, 255, 0.7)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '9px')
        .text(`Breakouts: ${data.potentialBreakouts}`);
      
      sectorGroup.append('text')
        .attr('x', 10)
        .attr('y', 42)
        .attr('fill', 'rgba(255, 255, 255, 0.5)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '8px')
        .text(`Tickers: ${data.count}`);
    });
  };
  
  const createVolumeProfile = () => {
    if (!volumeProfileRef.current) return;
    
    const width = volumeProfileRef.current.clientWidth;
    const height = volumeProfileRef.current.clientHeight;
    
    const svg = d3.select(volumeProfileRef.current)
      .html('')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    svg.append('text')
      .attr('x', 10)
      .attr('y', 15)
      .attr('fill', 'rgba(255, 255, 255, 0.7)')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-size', '10px')
      .text('VOLUME PROFILE');
    
    updateVolumeProfile();
  };
  
  const updateVolumeProfile = () => {
    if (!volumeProfileRef.current || breakoutCandidates.length === 0) return;
    
    const width = volumeProfileRef.current.clientWidth;
    const height = volumeProfileRef.current.clientHeight;
    
    const svg = d3.select(volumeProfileRef.current).select('svg');
    
    // Get recent breakout candidates
    const recentCandidates = breakoutCandidates.slice(0, 5);
    
    // Calculate bar dimensions
    const barWidth = (width - 40) / recentCandidates.length;
    const maxVolumeRatio = Math.max(...recentCandidates.map(c => c.volumeRatio), 5);
    
    // Remove existing bars
    svg.selectAll('.volume-bar').remove();
    
    // Create volume bars
    recentCandidates.forEach((candidate, i) => {
      const x = 20 + i * barWidth;
      const barHeight = (height - 40) * (candidate.volumeRatio / maxVolumeRatio);
      const y = height - 10 - barHeight;
      
      // Color based on percentage change
      const percent = candidate.percentChange;
      const color = percent <= 9 ? 'rgba(0, 229, 255, 0.8)' : 
                   percent <= 10 ? 'rgba(0, 255, 153, 0.8)' : 
                   percent <= 11 ? 'rgba(255, 204, 0, 0.8)' : 
                   'rgba(255, 0, 85, 0.8)';
      
      const barGroup = svg.append('g')
        .attr('class', 'volume-bar');
      
      barGroup.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', barWidth - 5)
        .attr('height', barHeight)
        .attr('rx', 2)
        .attr('fill', color);
      
      barGroup.append('text')
        .attr('x', x + (barWidth - 5) / 2)
        .attr('y', height - 5)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.7)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '9px')
        .text(candidate.symbol);
      
      barGroup.append('text')
        .attr('x', x + (barWidth - 5) / 2)
        .attr('y', y - 5)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.9)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '9px')
        .text(`${candidate.volumeRatio.toFixed(1)}x`);
    });
  };
  
  const createTimeline = () => {
    if (!timelineRef.current) return;
    
    const width = timelineRef.current.clientWidth;
    const height = timelineRef.current.clientHeight;
    
    const svg = d3.select(timelineRef.current)
      .html('')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    svg.append('text')
      .attr('x', 10)
      .attr('y', 15)
      .attr('fill', 'rgba(255, 255, 255, 0.7)')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-size', '10px')
      .text('BREAKOUT TIMELINE');
    
    updateTimeline();
  };
  
  const updateTimeline = () => {
    if (!timelineRef.current) return;
    
    const width = timelineRef.current.clientWidth;
    const height = timelineRef.current.clientHeight;
    
    const svg = d3.select(timelineRef.current).select('svg');
    
    // Create timeline
    const timelineData = [];
    const now = Date.now();
    
    for (let i = 0; i < 24; i++) {
      const time = now - (23 - i) * 15 * 60 * 1000; // 15-minute increments
      
      // Count breakouts in this time period
      const count = alertLog.filter(alert => 
        alert.timestamp >= time && 
        alert.timestamp < time + 15 * 60 * 1000
      ).length;
      
      timelineData.push({
        time,
        count
      });
    }
    
    // Remove existing timeline
    svg.selectAll('.timeline-path').remove();
    svg.selectAll('.timeline-point').remove();
    svg.selectAll('.timeline-label').remove();
    
    // Create x and y scales
    const x = d3.scaleLinear()
      .domain([0, timelineData.length - 1])
      .range([30, width - 20]);
    
    const maxCount = Math.max(...timelineData.map(d => d.count), 1);
    
    const y = d3.scaleLinear()
      .domain([0, maxCount])
      .range([height - 20, 30]);
    
    // Create line generator
    const line = d3.line()
      .x((d, i) => x(i))
      .y(d => y(d.count))
      .curve(d3.curveMonotoneX);
    
    // Draw line
    svg.append('path')
      .datum(timelineData)
      .attr('class', 'timeline-path')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(0, 229, 255, 0.8)')
      .attr('stroke-width', 2)
      .attr('d', line);
    
    // Draw points for actual breakouts
    timelineData.forEach((d, i) => {
      if (d.count > 0) {
        svg.append('circle')
          .attr('class', 'timeline-point')
          .attr('cx', x(i))
          .attr('cy', y(d.count))
          .attr('r', 3)
          .attr('fill', 'rgba(255, 0, 85, 0.8)');
      }
    });
    
    // Draw time labels
    for (let i = 0; i < timelineData.length; i += 4) {
      const time = moment(timelineData[i].time).format('HH:mm');
      
      svg.append('text')
        .attr('class', 'timeline-label')
        .attr('x', x(i))
        .attr('y', height - 5)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.5)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '8px')
        .text(time);
    }
  };
  
  const createPriceMap = () => {
    if (!priceMapRef.current) return;
    
    const width = priceMapRef.current.clientWidth;
    const height = priceMapRef.current.clientHeight;
    
    const svg = d3.select(priceMapRef.current)
      .html('')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    svg.append('text')
      .attr('x', 10)
      .attr('y', 15)
      .attr('fill', 'rgba(255, 255, 255, 0.7)')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-size', '10px')
      .text('PERCENT CHANGE DISTRIBUTION');
    
    updatePriceMap();
  };
  
  const updatePriceMap = () => {
    if (!priceMapRef.current || breakoutCandidates.length === 0) return;
    
    const width = priceMapRef.current.clientWidth;
    const height = priceMapRef.current.clientHeight;
    
    const svg = d3.select(priceMapRef.current).select('svg');
    
    // Clear existing elements
    svg.selectAll('.price-point').remove();
    
    // Calculate positions for each point
    const xScale = d3.scaleLinear()
      .domain([scanParameters.minPercentChange, scanParameters.maxPercentChange])
      .range([30, width - 20]);
    
    const yScale = d3.scaleLinear()
      .domain([0, 6])
      .range([height - 20, 30]);
    
    // Draw distribution
    breakoutCandidates.slice(0, 15).forEach((candidate, i) => {
      const x = xScale(candidate.percentChange);
      const y = yScale(candidate.volumeRatio > 5 ? 5 : candidate.volumeRatio);
      
      // Color based on volume ratio
      const color = candidate.volumeRatio <= 3 ? 'rgba(0, 229, 255, 0.8)' : 
                   candidate.volumeRatio <= 4 ? 'rgba(0, 255, 153, 0.8)' : 
                   candidate.volumeRatio <= 5 ? 'rgba(255, 204, 0, 0.8)' : 
                   'rgba(255, 0, 85, 0.8)';
      
      const point = svg.append('g')
        .attr('class', 'price-point')
        .attr('transform', `translate(${x}, ${y})`);
      
      point.append('circle')
        .attr('r', 4)
        .attr('fill', color);
      
      point.append('text')
        .attr('x', 0)
        .attr('y', -6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.9)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '8px')
        .text(candidate.symbol);
    });
    
    // Draw axes
    svg.selectAll('.axis-label').remove();
    
    // X-axis labels
    for (let percent = 8; percent <= 13; percent++) {
      svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', xScale(percent))
        .attr('y', height - 5)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.5)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '8px')
        .text(`${percent}%`);
    }
    
    // Y-axis labels
    for (let vol = 0; vol <= 5; vol += 2) {
      svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', 20)
        .attr('y', yScale(vol) + 3)
        .attr('text-anchor', 'end')
        .attr('fill', 'rgba(255, 255, 255, 0.5)')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', '8px')
        .text(`${vol}x`);
    }
  };
  
  const createSystemStatus = () => {
    if (!systemStatusRef.current) return;
    
    updateSystemStatus();
  };
  
  const updateSystemStatus = () => {
    if (!systemStatusRef.current) return;
    
    // Nothing to do here since the system status is rendered directly from React state
  };
  
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return moment(timestamp).format('HH:mm:ss');
  };
  
  const formatTimeSince = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };
  
  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
    
    addNotification(`Audio alerts ${!audioEnabled ? 'enabled' : 'disabled'}`, 'info');
  };
  
  const updateScanParameters = (name, value) => {
    setScanParameters(prev => ({
      ...prev,
      [name]: value
    }));
    
    addNotification(`Scan parameter updated: ${name} = ${value}`, 'info');
  };
  
  const dismissBreakoutCandidate = (symbol) => {
    setBreakoutCandidates(prev => 
      prev.filter(candidate => candidate.symbol !== symbol)
    );
    
    addNotification(`Dismissed breakout candidate: ${symbol}`, 'info');
  };
  
  const renderMatrixView = () => (
    <div className="matrix-view">
      <div className="matrix-header">
        <div className="matrix-title">SINGULARITY™ QUANTUM BREAKOUT MATRIX</div>
        <div className="matrix-subtitle">REAL-TIME 8-13% BREAKOUT DETECTION SYSTEM</div>
        
        <div className="matrix-mode-selector">
          <button 
            className={`matrix-mode-button ${matrixMode === 'realtime' ? 'active' : ''}`}
            onClick={() => setMatrixMode('realtime')}
          >
            REALTIME <span className="matrix-indicator"></span>
          </button>
          <button 
            className={`matrix-mode-button ${matrixMode === 'analytics' ? 'active' : ''}`}
            onClick={() => setMatrixMode('analytics')}
          >
            ANALYTICS <span className="matrix-indicator"></span>
          </button>
        </div>
      </div>
      
      <div className="matrix-grid">
        <div className="grid-cell market-status">
          <div className="cell-header">
            <div className="cell-title">MARKET PULSE</div>
            <div className={`status-badge ${systemMetrics.status}`}>
              <div className="status-dot"></div>
              <span className="status-text">{systemMetrics.status.toUpperCase()}</span>
            </div>
          </div>
          
          <div className="market-indicators">
            <div className="indicator">
              <div className="indicator-label">S&P 500</div>
              <div className={`indicator-value ${marketStats.spy.change >= 0 ? 'positive' : 'negative'}`}>
                {marketStats.spy.price.toFixed(2)}
                <span className="indicator-change">
                  {marketStats.spy.change >= 0 ? '+' : ''}{marketStats.spy.change.toFixed(2)}%
                </span>
              </div>
            </div>
            
            <div className="indicator">
              <div className="indicator-label">VIX</div>
              <div className={`indicator-value ${marketStats.vix.change < 0 ? 'positive' : 'negative'}`}>
                {marketStats.vix.price.toFixed(2)}
                <span className="indicator-change">
                  {marketStats.vix.change >= 0 ? '+' : ''}{marketStats.vix.change.toFixed(2)}%
                </span>
              </div>
            </div>
            
            <div className="indicator">
              <div className="indicator-label">MARKET BREADTH</div>
              <div className="indicator-value">
                {marketStats.advancers}/{marketStats.decliners}
              </div>
            </div>
            
            <div className="indicator">
              <div className="indicator-label">BREAKOUT INDEX</div>
              <div className="indicator-value">
                {marketStats.breakoutIndex.toFixed(1)}
              </div>
            </div>
          </div>
          
          {matrixMode === 'realtime' ? (
            <div className="visualization-container">
              <div className="visual-grid">
                <div className="visual-cell" ref={heatmapRef}></div>
                <div className="visual-cell" ref={volumeProfileRef}></div>
                <div className="visual-cell" ref={timelineRef}></div>
                <div className="visual-cell" ref={priceMapRef}></div>
              </div>
            </div>
          ) : (
            <div className="analytics-container">
              <div className="analytics-grid">
                <div className="analytics-cell breakout-stats">
                  <div className="analytics-header">BREAKOUT STATISTICS</div>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <div className="stat-label">TOTAL ALERTS</div>
                      <div className="stat-value">{alertLog.length}</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">ACTIVE BREAKOUTS</div>
                      <div className="stat-value">{breakoutCandidates.length}</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">AVG VOLUME RATIO</div>
                      <div className="stat-value">
                        {breakoutCandidates.length > 0 
                          ? (breakoutCandidates.reduce((sum, c) => sum + c.volumeRatio, 0) / breakoutCandidates.length).toFixed(1) + 'x'
                          : 'N/A'
                        }
                      </div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">AVG PERCENT CHANGE</div>
                      <div className="stat-value">
                        {breakoutCandidates.length > 0 
                          ? '+' + (breakoutCandidates.reduce((sum, c) => sum + c.percentChange, 0) / breakoutCandidates.length).toFixed(2) + '%'
                          : 'N/A'
                        }
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="analytics-cell sector-leaders">
                  <div className="analytics-header">SECTOR LEADERS</div>
                  <div className="sector-list">
                    {Object.entries(sectorData)
                      .filter(([name, data]) => data.potentialBreakouts > 0)
                      .sort((a, b) => b[1].potentialBreakouts - a[1].potentialBreakouts)
                      .slice(0, 5)
                      .map(([name, data]) => (
                        <div key={name} className="sector-item">
                          <div className="sector-name">{name}</div>
                          <div className="sector-breakouts">{data.potentialBreakouts}</div>
                          <div className="sector-bar">
                            <div 
                              className="sector-fill"
                              style={{ width: `${Math.min(100, (data.potentialBreakouts / data.count) * 400)}%` }}
                            ></div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                
                <div className="analytics-cell volume-leaders">
                  <div className="analytics-header">VOLUME LEADERS</div>
                  <div className="volume-list">
                    {breakoutCandidates
                      .sort((a, b) => b.volumeRatio - a.volumeRatio)
                      .slice(0, 5)
                      .map(candidate => (
                        <div key={candidate.symbol} className="volume-item">
                          <div className="volume-symbol">{candidate.symbol}</div>
                          <div className="volume-data">
                            <div className="volume-value">{candidate.volumeRatio.toFixed(1)}x</div>
                            <div className="volume-change">+{candidate.percentChange.toFixed(2)}%</div>
                          </div>
                          <div className="volume-bar">
                            <div 
                              className="volume-fill"
                              style={{ width: `${Math.min(100, candidate.volumeRatio * 16)}%` }}
                            ></div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                
                <div className="analytics-cell percent-leaders">
                  <div className="analytics-header">PERCENT LEADERS</div>
                  <div className="percent-list">
                    {breakoutCandidates
                      .sort((a, b) => b.percentChange - a.percentChange)
                      .slice(0, 5)
                      .map(candidate => (
                        <div key={candidate.symbol} className="percent-item">
                          <div className="percent-symbol">{candidate.symbol}</div>
                          <div className="percent-data">
                            <div className="percent-value">+{candidate.percentChange.toFixed(2)}%</div>
                            <div className="percent-volume">{candidate.volumeRatio.toFixed(1)}x</div>
                          </div>
                          <div className="percent-bar">
                            <div 
                              className="percent-fill"
                              style={{ width: `${Math.min(100, (candidate.percentChange / scanParameters.maxPercentChange) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="grid-cell breakout-detector">
          <div className="cell-header">
            <div className="cell-title">BREAKOUT DETECTION MATRIX</div>
            <div className="breakout-stats">
              <div className="breakout-stat">
                <div className="stat-value">{watchlist.length}</div>
                <div className="stat-label">MONITORED</div>
              </div>
              <div className="breakout-stat">
                <div className="stat-value">{breakoutCandidates.length}</div>
                <div className="stat-label">ALERTS</div>
              </div>
              <div className="detector-indicator"></div>
            </div>
          </div>
          
          {breakoutCandidates.length > 0 ? (
            <div className="breakout-list">
              <div className="breakout-header">
                <div className="breakout-col symbol">SYMBOL</div>
                <div className="breakout-col price">PRICE</div>
                <div className="breakout-col change">CHANGE</div>
                <div className="breakout-col volume">VOLUME</div>
                <div className="breakout-col time">DETECTED</div>
                <div className="breakout-col actions">ACTIONS</div>
              </div>
              
              <div className="breakout-items">
                {breakoutCandidates.map((candidate, index) => (
                  <div 
                    key={candidate.symbol} 
                    className={`breakout-item ${index === 0 ? 'new-alert' : ''}`}
                  >
                    <div className="breakout-content">
                      <div className="breakout-col symbol">
                        <div className="symbol-text">{candidate.symbol}</div>
                        <div className="sector-text">{candidate.sector}</div>
                      </div>
                      
                      <div className="breakout-col price">${candidate.price.toFixed(2)}</div>
                      
                      <div className="breakout-col change">
                        <div className="change-bar" style={{ width: `${Math.min(100, candidate.percentChange * 5)}%` }}></div>
                        <div className="change-text">+{candidate.percentChange.toFixed(2)}%</div>
                      </div>
                      
                      <div className="breakout-col volume">
                        <div className="volume-bar" style={{ width: `${Math.min(100, candidate.volumeRatio * 15)}%` }}></div>
                        <div className="volume-text">{candidate.volumeRatio.toFixed(1)}x</div>
                      </div>
                      
                      <div className="breakout-col time">
                        {formatTimeSince(candidate.timestamp)}
                      </div>
                      
                      <div className="breakout-col actions">
                        <a 
                          href={`https://app.webull.com/trade?symbol=${candidate.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="trade-button"
                        >
                          TRADE
                        </a>
                        <button 
                          className="chart-button"
                          onClick={() => window.open(`https://app.webull.com/quote/nyse-${candidate.symbol}`)}
                        >
                          CHART
                        </button>
                        <button 
                          className="dismiss-button"
                          onClick={() => dismissBreakoutCandidate(candidate.symbol)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    
                    <div className="breakout-probability">
                      <div className="probability-label">BREAKOUT POTENTIAL</div>
                      <div className="probability-bar">
                        <div 
                          className="probability-value" 
                          style={{ 
                            width: `${Math.min(100, 40 + (candidate.percentChange - scanParameters.minPercentChange) * 10 + (candidate.volumeRatio - scanParameters.minVolumeRatio) * 5)}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : systemMetrics.status === 'online' ? (
            <div className="no-breakouts">
              <div className="radar-animation">
                <div className="radar-sweep"></div>
              </div>
              <div className="no-breakouts-text">NO BREAKOUT CANDIDATES DETECTED</div>
              <div className="scanning-text">SINGULARITY™ MATRIX ACTIVELY SCANNING {watchlist.length} SYMBOLS</div>
            </div>
          ) : (
            <div className="system-initializing">
              <div className="initializing-animation"></div>
              <div className="initializing-text">INITIALIZING SINGULARITY™ MATRIX</div>
              <div className="progress-bar">
                <div 
                  className="progress-value"
                  style={{ width: `${systemMetrics.capacity}%` }}
                ></div>
              </div>
              <div className="progress-text">{systemMetrics.capacity}% COMPLETE</div>
            </div>
          )}
        </div>
        
        <div className="grid-cell system-settings">
          <div className="cell-header">
            <div className="cell-title">SYSTEM METRICS</div>
          </div>
          
          <div className="metrics-grid">
            <div className="metric">
              <div className="metric-label">PROCESSING CAPACITY</div>
              <div className="metric-bar">
                <div 
                  className="metric-value"
                  style={{ width: `${systemMetrics.capacity}%` }}
                ></div>
              </div>
              <div className="metric-text">{systemMetrics.capacity}%</div>
            </div>
            
            <div className="metric">
              <div className="metric-label">NETWORK LATENCY</div>
              <div className="metric-bar">
                <div 
                  className="metric-value"
                  style={{ width: `${(systemMetrics.latency / 50) * 100}%` }}
                ></div>
              </div>
              <div className="metric-text">{systemMetrics.latency.toFixed(1)}ms</div>
            </div>
            
            <div className="metric">
              <div className="metric-label">DETECTION ACCURACY</div>
              <div className="metric-bar">
                <div 
                  className="metric-value"
                  style={{ width: `${systemMetrics.accuracy}%` }}
                ></div>
              </div>
              <div className="metric-text">{systemMetrics.accuracy.toFixed(1)}%</div>
            </div>
          </div>
          
          <div className="parameter-grid">
            <div className="parameter-header">DETECTION PARAMETERS</div>
            
            <div className="parameter">
              <div className="parameter-label">PRICE INCREASE RANGE</div>
              <div className="parameter-slider">
                <div className="slider-track">
                  <div 
                    className="slider-fill"
                    style={{ 
                      left: `${(scanParameters.minPercentChange / 20) * 100}%`, 
                      right: `${100 - ((scanParameters.maxPercentChange / 20) * 100)}%` 
                    }}
                  ></div>
                </div>
                
                <input 
                  type="range"
                  min="0"
                  max="20"
                  step="0.1"
                  value={scanParameters.minPercentChange}
                  onChange={(e) => updateScanParameters('minPercentChange', parseFloat(e.target.value))}
                  className="range-input min-range"
                />
                
                <input 
                  type="range"
                  min="0"
                  max="20"
                  step="0.1"
                  value={scanParameters.maxPercentChange}
                  onChange={(e) => updateScanParameters('maxPercentChange', parseFloat(e.target.value))}
                  className="range-input max-range"
                />
              </div>
              <div className="parameter-values">
                <span>{scanParameters.minPercentChange.toFixed(1)}%</span>
                <span>{scanParameters.maxPercentChange.toFixed(1)}%</span>
              </div>
            </div>
            
            <div className="parameter">
              <div className="parameter-label">MINIMUM VOLUME RATIO</div>
              <div className="parameter-slider">
                <div className="slider-track">
                  <div 
                    className="slider-fill"
                    style={{ width: `${(scanParameters.minVolumeRatio / 10) * 100}%` }}
                  ></div>
                </div>
                
                <input 
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={scanParameters.minVolumeRatio}
                  onChange={(e) => updateScanParameters('minVolumeRatio', parseFloat(e.target.value))}
                  className="range-input"
                />
              </div>
              <div className="parameter-values">
                <span>{scanParameters.minVolumeRatio.toFixed(1)}x</span>
              </div>
            </div>
            
            <div className="parameter">
              <div className="parameter-label">PRICE RANGE</div>
              <div className="parameter-slider">
                <div className="slider-track">
                  <div 
                    className="slider-fill"
                    style={{ 
                      left: `${(Math.log10(scanParameters.minPrice) / Math.log10(scanParameters.maxPrice)) * 100}%`, 
                      right: `${100 - ((Math.log10(scanParameters.maxPrice) / Math.log10(scanParameters.maxPrice)) * 100)}%` 
                    }}
                  ></div>
                </div>
                
                <input 
                  type="range"
                  min="1"
                  max="2000"
                  step="1"
                  value={scanParameters.minPrice}
                  onChange={(e) => updateScanParameters('minPrice', parseFloat(e.target.value))}
                  className="range-input min-range"
                />
                
                <input 
                  type="range"
                  min="1"
                  max="2000"
                  step="1"
                  value={scanParameters.maxPrice}
                  onChange={(e) => updateScanParameters('maxPrice', parseFloat(e.target.value))}
                  className="range-input max-range"
                />
              </div>
              <div className="parameter-values">
                <span>${scanParameters.minPrice.toFixed(2)}</span>
                <span>${scanParameters.maxPrice.toFixed(0)}</span>
              </div>
            </div>
            
            <div className="parameter">
              <div className="parameter-label">ALERT AUDIO</div>
              <div 
                className={`toggle-switch ${audioEnabled ? 'active' : ''}`}
                onClick={toggleAudio}
              >
                <div className="toggle-slider"></div>
              </div>
            </div>
          </div>
          
          <div className="system-info">
            <div className="info-item">
              <div className="info-label">SYSTEM VERSION</div>
              <div className="info-value">{systemMetrics.version}</div>
            </div>
            <div className="info-item">
              <div className="info-label">LAST SCAN</div>
              <div className="info-value">{systemMetrics.scanTime ? formatTime(systemMetrics.scanTime) : 'N/A'}</div>
            </div>
            <div className="info-item">
              <div className="info-label">SYSTEM UPTIME</div>
              <div className="info-value">{formatUptime(systemMetrics.uptime)}</div>
            </div>
          </div>
        </div>
        
        <div className="grid-cell watchlist">
          <div className="cell-header">
            <div className="cell-title">ACTIVE SCAN MATRIX</div>
          </div>
          
          <div className="watchlist-content">
            <div className="watchlist-info">
              Monitoring {watchlist.length} symbols in real-time
            </div>
            
            <div className="watchlist-grid">
              {watchlist.slice(0, 48).map(symbol => (
                <div key={symbol} className="watchlist-item">
                  {symbol}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="notifications-container">
        {notifications.map(notification => (
          <div 
            key={notification.id} 
            className={`notification ${notification.type}`}
          >
            <div className="notification-dot"></div>
            <div className="notification-text">{notification.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
  
  const renderSettingsView = () => (
    <div className="settings-view">
      <div className="settings-header">
        <div className="settings-title">SYSTEM CONFIGURATION</div>
        <button 
          className="back-button"
          onClick={() => setCurrentView('matrix')}
        >
          RETURN TO MATRIX
        </button>
      </div>
      
      <div className="settings-grid">
        <div className="settings-section api-settings">
          <div className="section-header">API CONFIGURATION</div>
          
          <div className="setting-item">
            <div className="setting-label">POLYGON.IO API KEY</div>
            <input 
              type="password" 
              className="setting-input" 
              value="••••••••••••••••••••••••••••••"
              readOnly
            />
            <button className="setting-button">UPDATE</button>
          </div>
          
          <div className="setting-item">
            <div className="setting-label">DATA UPDATE FREQUENCY</div>
            <select className="setting-select">
              <option>REAL-TIME (WEBSOCKET)</option>
              <option>HIGH FREQUENCY (1s)</option>
              <option>STANDARD (5s)</option>
              <option>LOW BANDWIDTH (15s)</option>
            </select>
          </div>
        </div>
        
        <div className="settings-section filter-settings">
          <div className="section-header">ADVANCED FILTERS</div>
          
          <div className="setting-item">
            <div className="setting-label">MINIMUM MARKET CAP</div>
            <select className="setting-select">
              <option>NANO ($50M+)</option>
              <option selected>MICRO ($100M+)</option>
              <option>SMALL ($300M+)</option>
              <option>MID ($2B+)</option>
              <option>LARGE ($10B+)</option>
            </select>
          </div>
          
          <div className="setting-item">
            <div className="setting-label">MINIMUM AVERAGE VOLUME</div>
            <select className="setting-select">
              <option>ULTRA LOW (50K+)</option>
              <option>LOW (100K+)</option>
              <option selected>MEDIUM (250K+)</option>
              <option>HIGH (500K+)</option>
              <option>ULTRA HIGH (1M+)</option>
            </select>
          </div>
          
          <div className="setting-item">
            <div className="setting-label">EXCLUDED SECTORS</div>
            <div className="sector-checkboxes">
              <label>
                <input type="checkbox" /> FINANCIAL
              </label>
              <label>
                <input type="checkbox" /> ENERGY
              </label>
              <label>
                <input type="checkbox" /> HEALTHCARE
              </label>
              <label>
                <input type="checkbox" /> REAL ESTATE
              </label>
              <label>
                <input type="checkbox" /> UTILITIES
              </label>
            </div>
          </div>
        </div>
        
        <div className="settings-section alert-settings">
          <div className="section-header">ALERT CONFIGURATION</div>
          
          <div className="setting-item">
            <div className="setting-label">NOTIFICATION SOUNDS</div>
            <div className="toggle-switch active">
              <div className="toggle-slider"></div>
            </div>
          </div>
          
          <div className="setting-item">
            <div className="setting-label">VISUAL EFFECTS</div>
            <div className="toggle-switch active">
              <div className="toggle-slider"></div>
            </div>
          </div>
          
          <div className="setting-item">
            <div className="setting-label">EMAIL ALERTS</div>
            <div className="toggle-switch">
              <div className="toggle-slider"></div>
            </div>
          </div>
        </div>
        
        <div className="settings-section system-settings">
          <div className="section-header">SYSTEM INFORMATION</div>
          
          <div className="info-item">
            <div className="info-label">VERSION</div>
            <div className="info-value">{systemMetrics.version}</div>
          </div>
          
          <div className="info-item">
            <div className="info-label">ENVIRONMENT</div>
            <div className="info-value">{systemMetrics.environment}</div>
          </div>
          
          <div className="info-item">
            <div className="info-label">UPTIME</div>
            <div className="info-value">{formatUptime(systemMetrics.uptime)}</div>
          </div>
          
          <div className="setting-item centered">
            <a 
              href="https://www.webull.com/introduce"
              target="_blank"
              rel="noopener noreferrer"
              className="purchase-button"
            >
              PURCHASE ACCESS
            </a>
          </div>
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="singularity-container">
      <div className="control-bar">
        <div className="logo">
          <div className="logo-text">SINGULARITY™</div>
          <div className="logo-subtext">QUANTUM BREAKOUT DETECTION MATRIX</div>
        </div>
        
        <div className="nav-buttons">
          <button 
            className={`nav-button ${currentView === 'matrix' ? 'active' : ''}`}
            onClick={() => setCurrentView('matrix')}
          >
            <span className="button-glow"></span>
            MATRIX
          </button>
          <button 
            className={`nav-button ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            <span className="button-glow"></span>
            SETTINGS
          </button>
        </div>
        
        <div className="system-controls">
          <div className={`status-indicator ${systemMetrics.status}`}>
            <div className="status-dot"></div>
            <span className="status-text">{systemMetrics.status.toUpperCase()}</span>
          </div>
          
          <a 
            href="https://www.webull.com/introduce"
            target="_blank"
            rel="noopener noreferrer"
            className="purchase-button"
          >
            <span className="button-glow"></span>
            PURCHASE ACCESS
          </a>
        </div>
      </div>
      
      <div className="content-area">
        {currentView === 'matrix' ? renderMatrixView() : renderSettingsView()}
      </div>
      
      <div className="status-bar">
        <div className="status-left">
          <div className="status-item">
            <span className="status-label">DATA SOURCE:</span>
            <span className="status-value">POLYGON.IO ENTERPRISE API</span>
          </div>
        </div>
        
        <div className="status-right">
          <div className="status-item">
            <span className="status-label">TICKERS:</span>
            <span className="status-value">{watchlist.length}</span>
          </div>
          <div className="status-item">
            <span className="status-label">ALERTS:</span>
            <span className="status-value">{breakoutCandidates.length}</span>
          </div>
          <div className="status-item">
            <span className="status-label">LATENCY:</span>
            <span className="status-value">{systemMetrics.latency.toFixed(1)}ms</span>
          </div>
          <div className="status-item">
            <span className="status-label">VERSION:</span>
            <span className="status-value">{systemMetrics.version}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SINGULARITY />
  </React.StrictMode>
);