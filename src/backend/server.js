const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

const BrowserManager = require('./browserManager');
const SessionManager = require('./sessionManager');

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// Simple rate limiting middleware
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const record = rateLimitMap.get(ip);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ 
      success: false, 
      error: 'Too many requests. Please try again later.' 
    });
  }
  
  record.count++;
  next();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(rateLimit);
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Initialize managers
const sessionManager = new SessionManager();
const browserManager = new BrowserManager(sessionManager);

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('Dashboard connected via WebSocket');
  
  // Send current state on connection
  ws.send(JSON.stringify({
    type: 'initial_state',
    data: sessionManager.getAllSessions()
  }));

  ws.on('close', () => {
    console.log('Dashboard disconnected');
  });
});

// Broadcast updates to all connected clients
sessionManager.on('update', (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
});

// API Routes

// Get all browser sessions
app.get('/api/sessions', (req, res) => {
  res.json(sessionManager.getAllSessions());
});

// Create a new browser session
app.post('/api/sessions', async (req, res) => {
  try {
    const session = await browserManager.createSession();
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific session details
app.get('/api/sessions/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (session) {
    res.json(session);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Close a browser session
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await browserManager.closeSession(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start job search for a session
app.post('/api/sessions/:id/search', async (req, res) => {
  try {
    await browserManager.startJobSearch(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Take screenshot of a session
app.get('/api/sessions/:id/screenshot', async (req, res) => {
  try {
    const screenshotPath = await browserManager.takeScreenshot(req.params.id);
    res.sendFile(path.resolve(screenshotPath));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeSessions: sessionManager.getActiveSessionCount(),
    timestamp: new Date().toISOString()
  });
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
  console.log(`Dashboard available at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing all browser sessions...');
  await browserManager.closeAllSessions();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing all browser sessions...');
  await browserManager.closeAllSessions();
  process.exit(0);
});
