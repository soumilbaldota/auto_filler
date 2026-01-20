/**
 * Utility functions for the Auto Filler framework
 */

const fs = require('fs').promises;
const path = require('path');

class Utils {
  /**
   * Ensure a directory exists, create if it doesn't
   */
  static async ensureDir(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Clean up old browser data directories
   */
  static async cleanupOldBrowserData(maxAge = 24 * 60 * 60 * 1000) {
    const browserDataDir = path.join(__dirname, '../../browser-data');
    
    try {
      const entries = await fs.readdir(browserDataDir, { withFileTypes: true });
      const now = Date.now();
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(browserDataDir, entry.name);
          const stats = await fs.stat(dirPath);
          
          if (now - stats.mtimeMs > maxAge) {
            console.log(`Cleaning up old browser data: ${entry.name}`);
            await fs.rm(dirPath, { recursive: true, force: true });
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up browser data:', error);
    }
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(date) {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Parse ATS domains from environment
   */
  static getATSDomains() {
    const domains = process.env.ATS_DOMAINS || '';
    return domains.split(',').map(d => d.trim()).filter(d => d.length > 0);
  }

  /**
   * Build Google search URL with ATS domain filters
   */
  static buildSearchURL(query, domains) {
    let fullQuery = query;
    
    if (domains && domains.length > 0) {
      const siteQuery = domains.map(domain => `site:${domain}`).join(' OR ');
      fullQuery = `${query} (${siteQuery})`;
    }
    
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  }

  /**
   * Validate extension path
   */
  static async validateExtensionPath(extensionPath) {
    if (!extensionPath) {
      return { valid: false, message: 'No extension path provided' };
    }

    try {
      await fs.access(extensionPath);
      
      // Check for manifest.json
      const manifestPath = path.join(extensionPath, 'manifest.json');
      await fs.access(manifestPath);
      
      return { valid: true };
    } catch {
      return { 
        valid: false, 
        message: `Extension not found or invalid at: ${extensionPath}` 
      };
    }
  }

  /**
   * Generate session ID
   */
  static generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize filename
   */
  static sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  }

  /**
   * Check if URL is an ATS page
   */
  static isATSPage(url, domains) {
    if (!domains || domains.length === 0) {
      return false;
    }
    return domains.some(domain => url.includes(domain));
  }

  /**
   * Sleep for specified milliseconds
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry function with exponential backoff
   */
  static async retry(fn, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries - 1) {
          console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await this.sleep(delay);
          delay = Math.min(delay * backoffFactor, maxDelay);
        }
      }
    }

    throw lastError;
  }
}

module.exports = Utils;
