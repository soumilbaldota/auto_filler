/**
 * Google Login Automation
 * Handles automated login to Google accounts
 */

const Utils = require('./helpers');

class GoogleLogin {
  constructor(page) {
    this.page = page;
  }

  /**
   * Attempt to log in to Google account
   */
  async login(email, password) {
    try {
      console.log('Starting Google login...');
      
      // Navigate to Google
      await this.page.goto('https://accounts.google.com/', { waitUntil: 'networkidle' });
      
      // Wait for email input
      await this.page.waitForSelector('input[type="email"]', { timeout: 10000 });
      
      // Enter email
      await this.page.fill('input[type="email"]', email);
      await this.page.click('button:has-text("Next"), #identifierNext');
      
      // Wait for password input
      await this.page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await Utils.sleep(1000);
      
      // Enter password
      await this.page.fill('input[type="password"]', password);
      await this.page.click('button:has-text("Next"), #passwordNext');
      
      // Wait for navigation
      await Utils.sleep(3000);
      
      // Check if login was successful
      const isLoggedIn = await this.verifyLogin();
      
      if (isLoggedIn) {
        console.log('✅ Google login successful');
        return { success: true };
      } else {
        console.warn('⚠️ Google login verification failed - may require manual intervention');
        return { 
          success: false, 
          message: 'Login verification failed. Manual intervention may be required (2FA, captcha, etc.)' 
        };
      }
    } catch (error) {
      console.error('Google login error:', error);
      return { 
        success: false, 
        message: `Login failed: ${error.message}`,
        requiresManualAction: true
      };
    }
  }

  /**
   * Verify if login was successful
   */
  async verifyLogin() {
    try {
      // Check for common Google post-login elements
      const url = this.page.url();
      
      // If we're redirected to myaccount, we're logged in
      if (url.includes('myaccount.google.com')) {
        return true;
      }
      
      // Check for profile picture or account menu
      const hasAccountMenu = await this.page.evaluate(() => {
        return document.querySelector('[aria-label*="Google Account"]') !== null ||
               document.querySelector('[aria-label*="Google apps"]') !== null;
      });
      
      return hasAccountMenu;
    } catch {
      return false;
    }
  }

  /**
   * Check if already logged in
   */
  async isLoggedIn() {
    try {
      await this.page.goto('https://accounts.google.com/', { waitUntil: 'networkidle' });
      return await this.verifyLogin();
    } catch {
      return false;
    }
  }
}

module.exports = GoogleLogin;
