/**
 * ApplicationBrowserManager - Enhanced browser manager for job applications
 * Includes VNC/noVNC support and Simplify extension event tracking
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const GoogleLogin = require('../utils/googleLogin');
const SimplifyTracker = require('../utils/simplifyTracker');

class ApplicationBrowserManager {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.browsers = new Map();
    this.vncServers = new Map();
    this.baseVncPort = 5900;
    this.baseNoVncPort = 6080;
    this.usedPorts = new Set();
  }

  async launchSessionForJob(job, options = {}) {
    const {
      autoLogin = true,
      enableVnc = true
    } = options;

    try {
      // Create browser data directory
      const userDataDir = path.join(__dirname, '../../browser-data', `application-${job.id}`);
      await fs.mkdir(userDataDir, { recursive: true });

      // Get VNC ports if enabled
      let vncInfo = null;
      if (enableVnc) {
        vncInfo = await this.setupVncPorts();
      }

      const launchOptions = {
        headless: false, // Must be non-headless for extensions and VNC
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--start-maximized'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      };

      // Add Simplify extension
      const extensionPath = process.env.SIMPLIFY_EXTENSION_PATH || '/app/extensions/simplify';
      try {
        await fs.access(path.join(extensionPath, 'manifest.json'));
        launchOptions.args.push(
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`
        );
        console.log(`✓ Simplify extension loaded from: ${extensionPath}`);
      } catch (e) {
        console.warn('⚠ Simplify extension not found at:', extensionPath);
        console.warn('  Browser will launch without Simplify. You can manually install it.');
      }

      const browserContext = await chromium.launchPersistentContext(userDataDir, launchOptions);

      // Add stealth scripts
      await this.addStealthScripts(browserContext);

      // Add Simplify monitoring scripts
      await this.addSimplifyMonitoring(browserContext);

      const page = await browserContext.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });

      // Create session
      const session = this.sessionManager.createSession(browserContext, page, job, vncInfo);
      this.browsers.set(session.id, { 
        browserContext, 
        page, 
        userDataDir, 
        job,
        vncInfo 
      });

      // Initialize Simplify tracker
      const simplifyTracker = new SimplifyTracker(page, this.sessionManager, session.id);
      await simplifyTracker.initialize();
      this.browsers.get(session.id).simplifyTracker = simplifyTracker;

      // Setup Simplify event listeners
      this.setupSimplifyEventListeners(session.id, page);

      // Auto-login to Google if credentials provided
      if (autoLogin && process.env.GOOGLE_EMAIL && process.env.GOOGLE_PASSWORD) {
        await this.performGoogleLogin(session.id, page);
      }

      // Navigate to job application
      this.sessionManager.updateSession(session.id, { status: 'loading' });
      this.sessionManager.addEvent(session.id, {
        type: 'navigation',
        message: `Navigating to job application: ${job.url}`
      });

      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      this.sessionManager.updateSession(session.id, { status: 'autofilling' });
      this.sessionManager.addEvent(session.id, {
        type: 'page_loaded',
        message: 'Job application page loaded, waiting for Simplify'
      });

      console.log(`Session ${session.id} launched for job: ${job.title}`);
      return session;

    } catch (error) {
      console.error(`Error launching session for job ${job.id}:`, error);
      throw error;
    }
  }

  async addStealthScripts(browserContext) {
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
  }

  async addSimplifyMonitoring(browserContext) {
    // Inject script to detect Simplify extension activity
    await browserContext.addInitScript(() => {
      // Create a custom event dispatcher for Simplify detection
      window.__autofiller_simplify = {
        detected: false,
        fillEvents: [],
        
        reportEvent: function(type, data) {
          const event = new CustomEvent('simplify_event', {
            detail: { type, data, timestamp: Date.now() }
          });
          document.dispatchEvent(event);
        }
      };

      // Monitor DOM changes that might indicate Simplify activity
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          // Look for Simplify extension elements or modifications
          if (mutation.target && mutation.target.classList) {
            const classes = Array.from(mutation.target.classList);
            if (classes.some(c => c.toLowerCase().includes('simplify'))) {
              window.__autofiller_simplify.detected = true;
              window.__autofiller_simplify.reportEvent('simplify_detected', {});
            }
          }
          
          // Check for input value changes (autofill activity)
          if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
            const input = mutation.target;
            if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
              window.__autofiller_simplify.fillEvents.push({
                field: input.name || input.id,
                time: Date.now()
              });
              window.__autofiller_simplify.reportEvent('field_filled', {
                fieldName: input.name || input.id,
                fieldType: input.type
              });
            }
          }
        }
      });

      // Start observing after DOM is ready
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['value', 'class']
        });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['value', 'class']
          });
        });
      }

      // Also monitor for form submissions
      document.addEventListener('submit', (e) => {
        window.__autofiller_simplify.reportEvent('form_submit', {
          formAction: e.target.action,
          formMethod: e.target.method
        });
      });
    });
  }

  setupSimplifyEventListeners(sessionId, page) {
    // Listen for console messages from Simplify
    page.on('console', async (msg) => {
      const text = msg.text().toLowerCase();
      
      if (text.includes('simplify')) {
        this.sessionManager.addEvent(sessionId, {
          type: 'simplify_console',
          message: msg.text()
        });

        if (text.includes('autofill') && text.includes('complete')) {
          this.sessionManager.markAutofillComplete(sessionId);
        }
      }
    });

    // Listen for our custom Simplify events
    page.exposeFunction('__reportSimplifyEvent', async (type, data) => {
      this.handleSimplifyEvent(sessionId, type, data);
    });

    page.on('load', async () => {
      // Inject event listener for our custom events
      await page.evaluate(() => {
        document.addEventListener('simplify_event', (e) => {
          window.__reportSimplifyEvent(e.detail.type, e.detail.data);
        });
      }).catch(() => {});
    });

    // Monitor page navigation
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const url = page.url();
        this.sessionManager.addEvent(sessionId, {
          type: 'navigation',
          message: `Navigated to: ${url}`,
          data: { url }
        });

        // Check if we're on a confirmation page
        if (this.isConfirmationPage(url)) {
          this.sessionManager.markSessionComplete(sessionId);
        }
      }
    });

    // Setup periodic autofill check
    this.setupAutofillCheck(sessionId, page);
  }

  handleSimplifyEvent(sessionId, type, data) {
    switch (type) {
      case 'simplify_detected':
        this.sessionManager.updateSimplifyStatus(sessionId, { detected: true });
        break;
      case 'field_filled':
        const session = this.sessionManager.getRawSession(sessionId);
        if (session) {
          session.simplifyStatus.fieldsFilledCount++;
          this.sessionManager.updateSimplifyStatus(sessionId, {
            fieldsFilledCount: session.simplifyStatus.fieldsFilledCount
          });
        }
        break;
      case 'form_submit':
        this.sessionManager.addEvent(sessionId, {
          type: 'form_submit',
          message: 'Form submitted',
          data
        });
        break;
    }
  }

  setupAutofillCheck(sessionId, page) {
    // Check every 5 seconds if autofill might be complete
    const checkInterval = setInterval(async () => {
      const browser = this.browsers.get(sessionId);
      if (!browser) {
        clearInterval(checkInterval);
        return;
      }

      try {
        const autofillStatus = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select');
          let filled = 0;
          let empty = 0;
          
          inputs.forEach(input => {
            if (input.value && input.value.trim()) {
              filled++;
            } else if (!input.disabled && !input.readOnly) {
              empty++;
            }
          });

          return {
            totalFields: inputs.length,
            filledFields: filled,
            emptyFields: empty,
            completionPercentage: inputs.length > 0 ? Math.round((filled / inputs.length) * 100) : 0
          };
        });

        // Update session with form data
        const session = this.sessionManager.getRawSession(sessionId);
        if (session) {
          session.formData.filledFields = autofillStatus.filledFields;
          session.formData.pendingFields = autofillStatus.emptyFields;
          
          // If most fields are filled, consider autofill complete
          if (autofillStatus.completionPercentage >= 80 && !session.simplifyStatus.autofillCompleted) {
            this.sessionManager.updateSimplifyStatus(sessionId, { autofillStarted: true });
            
            // Wait a bit more then mark complete
            setTimeout(() => {
              const currentSession = this.sessionManager.getRawSession(sessionId);
              if (currentSession && !currentSession.simplifyStatus.autofillCompleted) {
                this.sessionManager.markAutofillComplete(sessionId);
              }
            }, 3000);
          }
        }
      } catch (e) {
        // Page might have navigated, ignore errors
      }
    }, 5000);

    // Store interval for cleanup
    const browser = this.browsers.get(sessionId);
    if (browser) {
      browser.checkInterval = checkInterval;
    }
  }

  isConfirmationPage(url) {
    const confirmationPatterns = [
      /confirmation/i,
      /thank.*you/i,
      /application.*submitted/i,
      /success/i,
      /applied/i
    ];
    return confirmationPatterns.some(pattern => pattern.test(url));
  }

  async performGoogleLogin(sessionId, page) {
    this.sessionManager.updateSession(sessionId, { status: 'logging_in' });
    this.sessionManager.addEvent(sessionId, {
      type: 'login',
      message: 'Attempting Google login'
    });

    const googleLogin = new GoogleLogin(page);
    const loginResult = await googleLogin.login(
      process.env.GOOGLE_EMAIL,
      process.env.GOOGLE_PASSWORD
    );

    if (!loginResult.success) {
      this.sessionManager.addNotification(sessionId, {
        type: 'warning',
        message: 'Google login may require manual intervention'
      });
    } else {
      this.sessionManager.addEvent(sessionId, {
        type: 'login',
        message: 'Google login successful'
      });
    }
  }

  async setupVncPorts() {
    // Find available ports
    const vncPort = await this.findAvailablePort(this.baseVncPort);
    const noVncPort = await this.findAvailablePort(this.baseNoVncPort);

    this.usedPorts.add(vncPort);
    this.usedPorts.add(noVncPort);

    return {
      vncPort,
      noVncPort,
      noVncUrl: `http://localhost:${noVncPort}/vnc.html?autoconnect=true`,
      password: this.generateVncPassword()
    };
  }

  async findAvailablePort(basePort) {
    let port = basePort;
    while (this.usedPorts.has(port)) {
      port++;
    }
    return port;
  }

  generateVncPassword() {
    return Math.random().toString(36).substring(2, 10);
  }

  async takeScreenshot(sessionId) {
    const browser = this.browsers.get(sessionId);
    if (!browser) {
      throw new Error('Session not found');
    }

    const { page } = browser;
    const screenshotDir = path.join(__dirname, '../../screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });

    const filename = `application-${sessionId}-${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);
    
    await page.screenshot({ path: filepath, fullPage: false });
    return filepath;
  }

  async closeSession(sessionId) {
    const browser = this.browsers.get(sessionId);
    if (!browser) {
      throw new Error('Session not found');
    }

    const { browserContext, userDataDir, vncInfo, checkInterval, simplifyTracker } = browser;
    
    try {
      // Cleanup Simplify tracker
      if (simplifyTracker) {
        simplifyTracker.cleanup();
      }

      // Clear autofill check interval
      if (checkInterval) {
        clearInterval(checkInterval);
      }

      // Release VNC ports
      if (vncInfo) {
        this.usedPorts.delete(vncInfo.vncPort);
        this.usedPorts.delete(vncInfo.noVncPort);
      }

      await browserContext.close();
      this.browsers.delete(sessionId);
      this.sessionManager.deleteSession(sessionId);
      
      // Clean up user data directory
      try {
        await fs.rm(userDataDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Could not delete user data dir: ${e.message}`);
      }
      
      console.log(`Application session closed: ${sessionId}`);
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

  getSessionBrowser(sessionId) {
    return this.browsers.get(sessionId);
  }
}

module.exports = ApplicationBrowserManager;
