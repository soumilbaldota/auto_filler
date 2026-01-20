const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const Utils = require('../utils/helpers');
const GoogleLogin = require('../utils/googleLogin');

class BrowserManager {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.browsers = new Map();
  }

  async createSession() {
    try {
      // Launch browser with stealth mode and extension support
      const userDataDir = path.join(__dirname, '../../browser-data', `session-${Date.now()}`);
      await fs.mkdir(userDataDir, { recursive: true });

      const launchOptions = {
        headless: false, // Extensions require non-headless mode
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      };

      // Add extension if available
      const extensionPath = process.env.SIMPLIFY_EXTENSION_PATH;
      if (extensionPath) {
        try {
          await fs.access(extensionPath);
          launchOptions.args.push(
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
          );
        } catch (e) {
          console.warn('Simplify extension not found, continuing without it');
        }
      }

      const browserContext = await chromium.launchPersistentContext(userDataDir, launchOptions);
      
      // Additional stealth techniques
      await browserContext.addInitScript(() => {
        // Override navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });

        // Chrome runtime
        window.chrome = {
          runtime: {},
        };

        // Permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });

      const page = await browserContext.newPage();

      // Set viewport and user agent
      await page.setViewportSize({ width: 1280, height: 720 });

      const session = this.sessionManager.createSession(browserContext, page);
      this.browsers.set(session.id, { browserContext, page, userDataDir });

      // Attempt Google login if credentials are provided
      if (process.env.GOOGLE_EMAIL && process.env.GOOGLE_PASSWORD) {
        this.sessionManager.updateSession(session.id, { status: 'logging_in' });
        const googleLogin = new GoogleLogin(page);
        const loginResult = await googleLogin.login(
          process.env.GOOGLE_EMAIL,
          process.env.GOOGLE_PASSWORD
        );
        
        if (!loginResult.success) {
          this.sessionManager.addNotification(session.id, {
            type: 'warning',
            message: 'Google login requires manual intervention. Please complete login in the browser.'
          });
        }
      } else {
        console.log('No Google credentials provided, skipping auto-login');
        this.sessionManager.addNotification(session.id, {
          type: 'info',
          message: 'Please manually log in to Google in the browser window'
        });
      }
      
      this.sessionManager.updateSession(session.id, { status: 'ready' });
      
      console.log(`Browser session created: ${session.id}`);
      return session;
    } catch (error) {
      console.error('Error creating browser session:', error);
      throw error;
    }
  }

  async startJobSearch(sessionId) {
    const browser = this.browsers.get(sessionId);
    if (!browser) {
      throw new Error('Session not found');
    }

    const { page } = browser;
    this.sessionManager.updateSession(sessionId, { status: 'searching', searchStatus: 'active' });

    try {
      // Build search query with ATS domains
      const searchQuery = process.env.SEARCH_QUERY || 'Summer 2026 software intern';
      const atsDomains = (process.env.ATS_DOMAINS || '').split(',').map(d => d.trim());
      
      let fullQuery = searchQuery;
      if (atsDomains.length > 0) {
        const siteQuery = atsDomains.map(domain => `site:${domain}`).join(' OR ');
        fullQuery = `${searchQuery} (${siteQuery})`;
      }

      // Navigate to Google search
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`);
      
      this.sessionManager.addNotification(sessionId, {
        type: 'info',
        message: `Started job search with query: ${fullQuery}`
      });

      // Monitor for Simplify autofill completion
      this.setupAutofillMonitoring(sessionId, page);

      // Update stats
      const session = this.sessionManager.sessions.get(sessionId);
      if (session) {
        session.stats.jobsFound = await this.countJobListings(page);
        this.sessionManager.updateSession(sessionId, { stats: session.stats });
      }

    } catch (error) {
      console.error(`Error during job search for session ${sessionId}:`, error);
      this.sessionManager.addNotification(sessionId, {
        type: 'error',
        message: `Search error: ${error.message}`
      });
      this.sessionManager.updateSession(sessionId, { searchStatus: 'error' });
    }
  }

  setupAutofillMonitoring(sessionId, page) {
    // Monitor page for Simplify extension activities
    page.on('console', async (msg) => {
      const text = msg.text();
      
      // Detect Simplify autofill completion (adjust based on actual Simplify behavior)
      if (text.includes('simplify') || text.includes('autofill')) {
        console.log(`Simplify activity detected in session ${sessionId}: ${text}`);
      }
    });

    // Monitor for forms and manual action requirements
    page.on('framenavigated', async () => {
      try {
        // Check if we're on an application page
        const url = page.url();
        const atsDomains = (process.env.ATS_DOMAINS || '').split(',');
        const isATSPage = atsDomains.some(domain => url.includes(domain));

        if (isATSPage) {
          // Check for forms
          const hasForm = await page.evaluate(() => {
            return document.querySelector('form') !== null;
          });

          if (hasForm) {
            const session = this.sessionManager.sessions.get(sessionId);
            if (session) {
              session.stats.formsAutofilled++;
              this.sessionManager.updateSession(sessionId, { stats: session.stats });
            }

            // Simulate checking for manual action requirement
            // In reality, Simplify would trigger this
            setTimeout(() => {
              this.requireManualAction(sessionId, url);
            }, 5000);
          }
        }
      } catch (e) {
        console.error('Error monitoring page:', e);
      }
    });
  }

  requireManualAction(sessionId, url) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (session) {
      session.stats.manualActionsRequired++;
      this.sessionManager.updateSession(sessionId, { 
        stats: session.stats,
        searchStatus: 'manual_action_required'
      });
      
      this.sessionManager.addNotification(sessionId, {
        type: 'warning',
        message: `Manual action required at: ${url}`,
        url
      });
    }
  }

  async countJobListings(page) {
    try {
      // Count search results
      const count = await page.evaluate(() => {
        const results = document.querySelectorAll('div.g, div[data-sokoban-container]');
        return results.length;
      });
      return count;
    } catch (e) {
      return 0;
    }
  }

  async takeScreenshot(sessionId) {
    const browser = this.browsers.get(sessionId);
    if (!browser) {
      throw new Error('Session not found');
    }

    const { page } = browser;
    const screenshotDir = path.join(__dirname, '../../screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });

    const filename = `session-${sessionId}-${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);
    
    await page.screenshot({ path: filepath, fullPage: false });
    return filepath;
  }

  async closeSession(sessionId) {
    const browser = this.browsers.get(sessionId);
    if (!browser) {
      throw new Error('Session not found');
    }

    const { browserContext, userDataDir } = browser;
    
    try {
      await browserContext.close();
      this.browsers.delete(sessionId);
      this.sessionManager.deleteSession(sessionId);
      
      // Clean up user data directory
      try {
        await fs.rm(userDataDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Could not delete user data dir: ${e.message}`);
      }
      
      console.log(`Browser session closed: ${sessionId}`);
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
      throw error;
    }
  }

  async closeAllSessions() {
    const sessionIds = Array.from(this.browsers.keys());
    await Promise.all(sessionIds.map(id => this.closeSession(id).catch(e => {
      console.error(`Error closing session ${id}:`, e);
    })));
  }
}

module.exports = BrowserManager;
