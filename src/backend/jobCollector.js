/**
 * JobCollector - Handles the lookup stage
 * Searches Google for job applications and collects job links with role names
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

class JobCollector extends EventEmitter {
  constructor() {
    super();
    this.browser = null;
    this.page = null;
    this.isSearching = false;
    this.collectedJobs = [];
    this.searchProgress = {
      status: 'idle', // 'idle', 'searching', 'completed', 'error'
      currentPage: 0,
      totalPages: 5,
      jobsFound: 0
    };
  }

  async initialize() {
    if (this.browser) return;

    const userDataDir = path.join(__dirname, '../../browser-data', `collector-${Date.now()}`);
    await fs.mkdir(userDataDir, { recursive: true });

    // Use visible browser on Xvfb display for better Google compatibility
    const isDocker = process.env.DOCKER_ENV === 'true' || process.env.DISPLAY;
    
    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: !isDocker, // Use headed mode in Docker (on Xvfb)
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--window-size=1280,720',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      viewport: { width: 1280, height: 720 },
    });

    // Add stealth scripts
    await this.browser.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // Add plugins
      Object.defineProperty(navigator, 'plugins', { 
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ] 
      });
      
      // Languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      // Chrome runtime
      window.chrome = { 
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
      
      // Permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    console.log('JobCollector browser initialized', isDocker ? '(headed mode on Xvfb)' : '(headless mode)');
  }

  async searchJobs(options = {}) {
    const {
      searchQuery = process.env.SEARCH_QUERY || 'Summer 2026 software intern',
      atsDomains = (process.env.ATS_DOMAINS || 'lever.co,greenhouse.io,workday.com,myworkdayjobs.com,taleo.net,icims.com,smartrecruiters.com').split(','),
      maxPages = 5,
      maxResults = 100
    } = options;

    if (this.isSearching) {
      throw new Error('Search already in progress');
    }

    this.isSearching = true;
    this.collectedJobs = [];
    this.searchProgress = {
      status: 'searching',
      currentPage: 0,
      totalPages: maxPages,
      jobsFound: 0
    };

    this.emit('progress', this.searchProgress);

    try {
      await this.initialize();

      // Build search query - search each ATS domain
      for (const domain of atsDomains) {
        if (this.collectedJobs.length >= maxResults) break;

        const siteQuery = `${searchQuery} site:${domain.trim()}`;
        console.log(`Searching: ${siteQuery}`);

        try {
          await this.searchDomain(siteQuery, domain.trim(), maxPages, maxResults);
        } catch (error) {
          console.error(`Error searching ${domain}:`, error.message);
        }

        // Small delay between domain searches to avoid rate limiting
        await this.delay(1000);
      }

      this.searchProgress.status = 'completed';
      this.emit('progress', this.searchProgress);
      this.emit('completed', this.collectedJobs);

      return this.collectedJobs;
    } catch (error) {
      this.searchProgress.status = 'error';
      this.emit('progress', this.searchProgress);
      this.emit('error', error);
      throw error;
    } finally {
      this.isSearching = false;
    }
  }

  async searchDomain(query, domain, maxPages, maxResults) {
    try {
      // Navigate directly to Google search with time filter (past 24 hours)
      // Using tbs=qdr:d parameter for "past day" filter
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbs=qdr:d&num=20`;
      console.log(`Navigating to: ${searchUrl}`);
      
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(2000);

      // Handle consent dialog if present (common in EU/some regions)
      try {
        const consentButton = await this.page.$('button:has-text("Accept all"), button:has-text("I agree"), button[id*="agree"], div[role="none"] button');
        if (consentButton) {
          await consentButton.click();
          await this.delay(1000);
          // Re-navigate after consent
          await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await this.delay(1500);
        }
      } catch (e) {
        // No consent dialog, continue
      }

      // Verify the time filter is applied by checking URL
      const currentUrl = this.page.url();
      console.log(`Current URL: ${currentUrl}`);
      if (currentUrl.includes('tbs=qdr:d') || currentUrl.includes('tbs=qdr%3Ad')) {
        console.log('✓ Past 24 hours filter is active');
      } else {
        console.log('⚠ Time filter may not be applied, retrying...');
        // Try adding filter again
        const newUrl = currentUrl.includes('?') 
          ? `${currentUrl}&tbs=qdr:d` 
          : `${currentUrl}?tbs=qdr:d`;
        await this.page.goto(newUrl, { waitUntil: 'domcontentloaded' });
        await this.delay(1500);
      }

      // Check if we got blocked
      const pageContent = await this.page.content();
      if (pageContent.includes('unusual traffic') || pageContent.includes('captcha') || pageContent.includes('sorry')) {
        console.error('Google detected automated traffic - may need to solve CAPTCHA');
        await this.page.screenshot({ path: '/app/screenshots/google-blocked.png' });
        return;
      }

      console.log(`Search results page loaded for: ${query} (filtered to past 24 hours)`);

      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        if (this.collectedJobs.length >= maxResults) break;

        this.searchProgress.currentPage = pageNum + 1;
        this.emit('progress', this.searchProgress);

        // Extract job listings from current page
        const jobs = await this.extractJobsFromPage(domain);
        console.log(`Found ${jobs.length} jobs on page ${pageNum + 1} for ${domain}`);
        
        for (const job of jobs) {
          if (this.collectedJobs.length >= maxResults) break;
          
          // Avoid duplicates
          if (!this.collectedJobs.find(j => j.url === job.url)) {
            this.collectedJobs.push(job);
            this.searchProgress.jobsFound = this.collectedJobs.length;
            this.emit('job_found', job);
            this.emit('progress', this.searchProgress);
            console.log(`Added job: ${job.title} at ${job.company}`);
          }
        }

        // Try to go to next page
        const hasNextPage = await this.goToNextPage();
        if (!hasNextPage) break;

        await this.delay(2000 + Math.random() * 1000); // Random delay to seem more human
      }
    } catch (error) {
      console.error(`Error in searchDomain for ${domain}:`, error.message);
      try {
        await this.page.screenshot({ path: `/app/screenshots/error-${domain.replace('.', '-')}.png` });
      } catch (e) {}
    }
  }

  async extractJobsFromPage(domain) {
    const jobs = [];

    try {
      const results = await this.page.evaluate((targetDomain) => {
        const items = [];
        
        // Multiple selectors to handle Google's different result layouts
        const searchResults = document.querySelectorAll(
          'div.g, div[data-sokoban-container], div[data-hveid], div.MjjYud > div'
        );

        console.log(`Found ${searchResults.length} search result elements`);

        searchResults.forEach(result => {
          try {
            // Try multiple selectors for links
            const linkEl = result.querySelector('a[href^="http"]:not([href*="google"])');
            // Try multiple selectors for titles
            const titleEl = result.querySelector('h3, [role="heading"], a > div > span');
            // Try multiple selectors for snippets
            const snippetEl = result.querySelector(
              'div[data-sncf], div.VwiC3b, span.aCOpRe, div[style*="-webkit-line-clamp"]'
            );

            if (linkEl) {
              const url = linkEl.href;
              const title = titleEl ? titleEl.textContent : linkEl.textContent;
              const snippet = snippetEl ? snippetEl.textContent : '';

              // Only include if URL matches target domain
              if (url && url.includes(targetDomain)) {
                items.push({ url, title: title || url, snippet });
              }
            }
          } catch (e) {
            // Ignore individual result errors
          }
        });

        // Also try to get links directly if the above didn't work
        if (items.length === 0) {
          const allLinks = document.querySelectorAll('a[href*="' + targetDomain + '"]');
          allLinks.forEach(link => {
            const url = link.href;
            if (url && url.includes(targetDomain) && !url.includes('google')) {
              const title = link.textContent || link.closest('div')?.querySelector('h3')?.textContent || url;
              items.push({ url, title, snippet: '' });
            }
          });
        }

        return items;
      }, domain);

      console.log(`Extracted ${results.length} potential jobs for ${domain}`);

      for (const result of results) {
        const job = {
          id: this.generateJobId(),
          url: result.url,
          title: this.cleanTitle(result.title),
          company: this.extractCompany(result.title, result.url),
          description: result.snippet,
          domain: domain,
          atsType: this.getATSType(domain),
          collectedAt: new Date().toISOString(),
          status: 'pending' // pending, approved, rejected, applying, completed, error
        };
        jobs.push(job);
      }
    } catch (error) {
      console.error('Error extracting jobs:', error);
    }

    return jobs;
  }

  async goToNextPage() {
    try {
      const nextButton = await this.page.$('a#pnnext, a[aria-label="Next"]');
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForLoadState('domcontentloaded');
        return true;
      }
    } catch (error) {
      console.log('No next page found');
    }
    return false;
  }

  cleanTitle(title) {
    // Remove common suffixes and clean up title
    return title
      .replace(/\s*[-–|]\s*(Lever|Greenhouse|Workday|Apply|Job|Career).*$/i, '')
      .replace(/\s*\|\s*.*$/, '')
      .trim();
  }

  extractCompany(title, url) {
    // Try to extract company name from title or URL
    // Common patterns: "Role at Company" or "Company - Role"
    const atMatch = title.match(/(?:at|@)\s+([^-|]+)/i);
    if (atMatch) return atMatch[1].trim();

    const dashMatch = title.match(/^([^-]+?)\s*[-–]\s*/);
    if (dashMatch) return dashMatch[1].trim();

    // Try to extract from URL
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      // For lever.co URLs, company is in subdomain or path
      if (url.includes('lever.co')) {
        const leverMatch = url.match(/(?:jobs\.lever\.co|lever\.co)\/([^\/]+)/);
        if (leverMatch) return this.formatCompanyName(leverMatch[1]);
      }
      // For greenhouse
      if (url.includes('greenhouse.io')) {
        const ghMatch = url.match(/boards\.greenhouse\.io\/([^\/]+)/);
        if (ghMatch) return this.formatCompanyName(ghMatch[1]);
      }
    } catch (e) {}

    return 'Unknown Company';
  }

  formatCompanyName(slug) {
    return slug
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  getATSType(domain) {
    const atsMap = {
      'lever.co': 'Lever',
      'greenhouse.io': 'Greenhouse',
      'workday.com': 'Workday',
      'myworkdayjobs.com': 'Workday',
      'taleo.net': 'Taleo',
      'icims.com': 'iCIMS',
      'smartrecruiters.com': 'SmartRecruiters'
    };
    return atsMap[domain] || 'Unknown';
  }

  generateJobId() {
    return `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCollectedJobs() {
    return this.collectedJobs;
  }

  getProgress() {
    return this.searchProgress;
  }

  updateJobStatus(jobId, status) {
    const job = this.collectedJobs.find(j => j.id === jobId);
    if (job) {
      job.status = status;
      job.updatedAt = new Date().toISOString();
      this.emit('job_updated', job);
      return job;
    }
    return null;
  }

  approveJob(jobId) {
    return this.updateJobStatus(jobId, 'approved');
  }

  rejectJob(jobId) {
    return this.updateJobStatus(jobId, 'rejected');
  }

  approveAllJobs() {
    this.collectedJobs
      .filter(j => j.status === 'pending')
      .forEach(j => this.approveJob(j.id));
    return this.collectedJobs;
  }

  getApprovedJobs() {
    return this.collectedJobs.filter(j => j.status === 'approved');
  }

  getPendingJobs() {
    return this.collectedJobs.filter(j => j.status === 'pending');
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = JobCollector;
