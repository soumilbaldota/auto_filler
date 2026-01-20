/**
 * Auto Filler Server - Enhanced with job workflow stages
 * 
 * Workflow:
 * 1. Lookup Stage - Search and collect job links
 * 2. Approval Stage - User reviews and approves jobs
 * 3. Session Launch - Launch browser sessions for approved jobs
 * 4. Application Stage - Autofill and user completion
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

const JobCollector = require('./jobCollector');
const ApplicationSessionManager = require('./applicationSessionManager');
const ApplicationBrowserManager = require('./applicationBrowserManager');

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// Initialize managers
const jobCollector = new JobCollector();
const sessionManager = new ApplicationSessionManager();
const browserManager = new ApplicationBrowserManager(sessionManager);

// Store collected jobs in memory
let collectedJobs = [];
let searchProgress = { status: 'idle', currentPage: 0, totalPages: 0, jobsFound: 0 };

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;

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

// ----- Serve Dashboard (before static middleware) -----
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/dashboard.html'));
});

app.get('/old', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.use(express.static(path.join(__dirname, '../frontend/public')));

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: WS_PORT });

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Dashboard connected via WebSocket');
  
  // Send current state on connection
  ws.send(JSON.stringify({
    type: 'initial_state',
    data: {
      jobs: collectedJobs,
      searchProgress,
      sessions: sessionManager.getAllSessions(),
      stats: {
        ...sessionManager.getStats(),
        pendingJobs: collectedJobs.filter(j => j.status === 'pending').length,
        approvedJobs: collectedJobs.filter(j => j.status === 'approved').length
      }
    }
  }));

  ws.on('close', () => {
    console.log('Dashboard disconnected');
  });
});

// Forward all session manager events to WebSocket clients
sessionManager.on('update', (data) => {
  broadcast(data);
});

// Forward job collector events
jobCollector.on('progress', (progress) => {
  searchProgress = progress;
  broadcast({ type: 'search_progress', data: progress });
});

jobCollector.on('job_found', (job) => {
  collectedJobs.push(job);
  broadcast({ type: 'job_found', data: job });
});

jobCollector.on('completed', (jobs) => {
  broadcast({ type: 'search_completed', data: { jobs, count: jobs.length } });
});

jobCollector.on('error', (error) => {
  broadcast({ type: 'search_error', data: { message: error.message } });
});

// ============================================
// API Routes
// ============================================

// ----- Health Check -----
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeApplications: sessionManager.getActiveSessionCount(),
    collectedJobs: collectedJobs.length,
    searchStatus: searchProgress.status,
    timestamp: new Date().toISOString()
  });
});

// ----- Job Collection (Lookup Stage) -----

// Start job search
app.post('/api/jobs/search', async (req, res) => {
  try {
    const { 
      searchQuery, 
      atsDomains, 
      maxPages = 5, 
      maxResults = 100 
    } = req.body;

    // Clear previous jobs if starting new search
    if (req.body.clearPrevious !== false) {
      collectedJobs = [];
    }

    // Start async search
    jobCollector.searchJobs({
      searchQuery: searchQuery || process.env.SEARCH_QUERY,
      atsDomains: atsDomains || (process.env.ATS_DOMAINS || '').split(','),
      maxPages,
      maxResults
    }).then(jobs => {
      collectedJobs = jobs;
    }).catch(err => {
      console.error('Search error:', err);
    });

    res.json({ 
      success: true, 
      message: 'Job search started',
      status: 'searching'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get search progress
app.get('/api/jobs/search/progress', (req, res) => {
  res.json({
    success: true,
    progress: searchProgress
  });
});

// Stop ongoing search
app.post('/api/jobs/search/stop', async (req, res) => {
  try {
    await jobCollector.cleanup();
    searchProgress.status = 'stopped';
    res.json({ success: true, message: 'Search stopped' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all collected jobs
app.get('/api/jobs', (req, res) => {
  const { status, atsType, company } = req.query;
  
  let jobs = [...collectedJobs];
  
  if (status) {
    jobs = jobs.filter(j => j.status === status);
  }
  if (atsType) {
    jobs = jobs.filter(j => j.atsType === atsType);
  }
  if (company) {
    jobs = jobs.filter(j => j.company.toLowerCase().includes(company.toLowerCase()));
  }
  
  res.json({
    success: true,
    count: jobs.length,
    jobs
  });
});

// Manually add a job (for testing) - must be before :jobId route
app.post('/api/jobs/add', (req, res) => {
  const { url, title, company } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }
  
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    hostname = 'unknown';
  }
  
  const job = {
    id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    url,
    title: title || 'Manual Job Entry',
    company: company || 'Unknown Company',
    description: 'Manually added job',
    domain: hostname,
    atsType: 'Manual',
    collectedAt: new Date().toISOString(),
    status: 'pending'
  };
  
  collectedJobs.push(job);
  broadcast({ type: 'job_found', data: job });
  
  res.json({ success: true, job });
});

// Get single job
app.get('/api/jobs/:jobId', (req, res) => {
  const job = collectedJobs.find(j => j.id === req.params.jobId);
  if (job) {
    res.json({ success: true, job });
  } else {
    res.status(404).json({ success: false, error: 'Job not found' });
  }
});

// Clear all jobs
app.delete('/api/jobs', (req, res) => {
  collectedJobs = [];
  res.json({ success: true, message: 'All jobs cleared' });
});

// ----- Job Approval (Approval Stage) -----

// Approve a job for application
app.post('/api/jobs/:jobId/approve', (req, res) => {
  const job = collectedJobs.find(j => j.id === req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  
  job.status = 'approved';
  job.approvedAt = new Date().toISOString();
  broadcast({ type: 'job_updated', data: job });
  
  res.json({ success: true, job });
});

// Reject a job
app.post('/api/jobs/:jobId/reject', (req, res) => {
  const job = collectedJobs.find(j => j.id === req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  
  job.status = 'rejected';
  job.rejectedAt = new Date().toISOString();
  broadcast({ type: 'job_updated', data: job });
  
  res.json({ success: true, job });
});

// Approve all pending jobs
app.post('/api/jobs/approve-all', (req, res) => {
  const approvedJobs = [];
  collectedJobs.forEach(job => {
    if (job.status === 'pending') {
      job.status = 'approved';
      job.approvedAt = new Date().toISOString();
      approvedJobs.push(job);
    }
  });
  
  broadcast({ type: 'jobs_bulk_updated', data: { jobs: approvedJobs, action: 'approved' } });
  
  res.json({ success: true, count: approvedJobs.length, jobs: approvedJobs });
});

// Reset job status to pending
app.post('/api/jobs/:jobId/reset', (req, res) => {
  const job = collectedJobs.find(j => j.id === req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  
  job.status = 'pending';
  delete job.approvedAt;
  delete job.rejectedAt;
  broadcast({ type: 'job_updated', data: job });
  
  res.json({ success: true, job });
});

// ----- Application Sessions (Session Launch Stage) -----

// Launch session for a specific job
app.post('/api/jobs/:jobId/apply', async (req, res) => {
  try {
    const job = collectedJobs.find(j => j.id === req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    if (job.status !== 'approved') {
      return res.status(400).json({ success: false, error: 'Job must be approved before applying' });
    }

    // Check if session already exists for this job
    const existingSession = sessionManager.getSessionByJobId(job.id);
    if (existingSession) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session already exists for this job',
        session: existingSession
      });
    }

    job.status = 'applying';
    broadcast({ type: 'job_updated', data: job });

    const session = await browserManager.launchSessionForJob(job);
    
    res.json({ success: true, session: sessionManager.getSession(session.id) });
  } catch (error) {
    console.error('Error launching application session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Launch sessions for all approved jobs
app.post('/api/jobs/apply-all', async (req, res) => {
  try {
    const { maxConcurrent = 3 } = req.body;
    const approvedJobs = collectedJobs.filter(j => j.status === 'approved');
    
    if (approvedJobs.length === 0) {
      return res.json({ success: true, message: 'No approved jobs to apply to', count: 0 });
    }

    // Limit concurrent sessions
    const jobsToLaunch = approvedJobs.slice(0, maxConcurrent);
    const launchedSessions = [];

    for (const job of jobsToLaunch) {
      try {
        job.status = 'applying';
        broadcast({ type: 'job_updated', data: job });
        
        const session = await browserManager.launchSessionForJob(job);
        launchedSessions.push(sessionManager.getSession(session.id));
        
        // Small delay between launches
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error launching session for job ${job.id}:`, error);
        job.status = 'error';
        job.error = error.message;
        broadcast({ type: 'job_updated', data: job });
      }
    }

    res.json({ 
      success: true, 
      message: `Launched ${launchedSessions.length} application sessions`,
      count: launchedSessions.length,
      sessions: launchedSessions,
      remainingApproved: approvedJobs.length - launchedSessions.length
    });
  } catch (error) {
    console.error('Error launching application sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all application sessions
app.get('/api/sessions', (req, res) => {
  const { status } = req.query;
  
  let sessions = sessionManager.getAllSessions();
  
  if (status) {
    sessions = sessionManager.getSessionsByStatus(status);
  }
  
  res.json({
    success: true,
    count: sessions.length,
    sessions,
    stats: sessionManager.getStats()
  });
});

// Get specific session
app.get('/api/sessions/:sessionId', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId);
  if (session) {
    res.json({ success: true, session });
  } else {
    res.status(404).json({ success: false, error: 'Session not found' });
  }
});

// Get session VNC info
app.get('/api/sessions/:sessionId/vnc', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  if (session.vnc) {
    res.json({ success: true, vnc: session.vnc });
  } else {
    res.status(400).json({ success: false, error: 'VNC not enabled for this session' });
  }
});

// Take screenshot of session
app.get('/api/sessions/:sessionId/screenshot', async (req, res) => {
  try {
    const screenshotPath = await browserManager.takeScreenshot(req.params.sessionId);
    res.sendFile(path.resolve(screenshotPath));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark session as complete (user finished application)
app.post('/api/sessions/:sessionId/complete', (req, res) => {
  const session = sessionManager.getRawSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  sessionManager.markSessionComplete(req.params.sessionId);
  
  // Update job status
  const job = collectedJobs.find(j => j.id === session.job.id);
  if (job) {
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    broadcast({ type: 'job_updated', data: job });
  }
  
  res.json({ success: true, session: sessionManager.getSession(req.params.sessionId) });
});

// Close a session
app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const session = sessionManager.getRawSession(req.params.sessionId);
    
    // Reset job status if session is closed early
    if (session && session.job) {
      const job = collectedJobs.find(j => j.id === session.job.id);
      if (job && job.status === 'applying') {
        job.status = 'approved'; // Allow retry
        broadcast({ type: 'job_updated', data: job });
      }
    }
    
    await browserManager.closeSession(req.params.sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Close all sessions
app.delete('/api/sessions', async (req, res) => {
  try {
    await browserManager.closeAllSessions();
    res.json({ success: true, message: 'All sessions closed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ----- Statistics -----

app.get('/api/stats', (req, res) => {
  const jobStats = {
    total: collectedJobs.length,
    pending: collectedJobs.filter(j => j.status === 'pending').length,
    approved: collectedJobs.filter(j => j.status === 'approved').length,
    rejected: collectedJobs.filter(j => j.status === 'rejected').length,
    applying: collectedJobs.filter(j => j.status === 'applying').length,
    completed: collectedJobs.filter(j => j.status === 'completed').length,
    error: collectedJobs.filter(j => j.status === 'error').length
  };
  
  const sessionStats = sessionManager.getStats();
  
  const atsByType = {};
  collectedJobs.forEach(job => {
    atsByType[job.atsType] = (atsByType[job.atsType] || 0) + 1;
  });
  
  res.json({
    success: true,
    jobs: jobStats,
    sessions: sessionStats,
    searchProgress,
    atsByType
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                   Auto Filler Server                       ║
╠════════════════════════════════════════════════════════════╣
║  HTTP API:    http://localhost:${PORT}                        ║
║  WebSocket:   ws://localhost:${WS_PORT}                         ║
║  Dashboard:   http://localhost:${PORT}                        ║
╚════════════════════════════════════════════════════════════╝

Workflow:
  1. POST /api/jobs/search     - Start job lookup
  2. GET  /api/jobs            - View collected jobs
  3. POST /api/jobs/:id/approve - Approve jobs to apply
  4. POST /api/jobs/:id/apply  - Launch application session
  5. GET  /api/sessions        - View active sessions
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await browserManager.closeAllSessions();
  await jobCollector.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await browserManager.closeAllSessions();
  await jobCollector.cleanup();
  process.exit(0);
});
