# Auto Filler - Quick Start Guide

This guide will help you get Auto Filler up and running quickly.

## Prerequisites

- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
- **Git**: For cloning the repository
- **Docker (optional)**: For containerized deployment

## Installation (5 minutes)

### Option 1: Automated Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/soumilbaldota/auto_filler.git
cd auto_filler

# Run setup script (Linux/Mac)
./setup.sh

# Or run manually (Windows/Linux/Mac)
npm install
npx playwright install chromium --with-deps
cp .env.example .env
```

### Option 2: Docker Setup

```bash
# Clone the repository
git clone https://github.com/soumilbaldota/auto_filler.git
cd auto_filler

# Copy environment file
cp .env.example .env

# Build and run with Docker
docker-compose up --build
```

## Configuration (2 minutes)

Edit the `.env` file:

```bash
# Required: Job search settings
SEARCH_QUERY=Summer 2026 software intern
ATS_DOMAINS=lever.co,greenhouse.io,workday.com

# Optional: Google auto-login (leave empty to login manually)
GOOGLE_EMAIL=your-email@gmail.com
GOOGLE_PASSWORD=your-password

# Optional: Simplify extension path
SIMPLIFY_EXTENSION_PATH=./extensions/simplify
```

## Running the Application

### Start the Server

```bash
npm start
```

You should see:
```
Backend server running on http://localhost:3000
WebSocket server running on ws://localhost:3001
Dashboard available at http://localhost:3000
```

### Access the Dashboard

Open your browser to: **http://localhost:3000**

## Using the Dashboard

### 1. Create a Browser Session

Click the **"Create New Browser Session"** button. This will:
- Launch a stealth Chromium browser
- Load the Simplify extension (if configured)
- Attempt Google login (if credentials provided)
- Show the session in the dashboard

### 2. Start Job Search

Click **"Start Search"** on any session. This will:
- Navigate to Google with your job search query
- Filter results by ATS domains
- Monitor for job application pages
- Track autofill activities

### 3. Monitor Sessions

The dashboard shows:
- **Active Sessions**: All running browser instances
- **Jobs Found**: Number of search results
- **Forms Autofilled**: Applications processed by Simplify
- **Manual Actions**: When you need to intervene
- **Notifications**: Real-time alerts and updates

### 4. Take Actions

- **Screenshot**: Capture current browser state
- **Close**: Terminate the browser session

## Adding Simplify Extension

If you have the Simplify extension:

1. Download the unpacked extension files
2. Create directory: `mkdir -p extensions/simplify`
3. Copy extension files to `extensions/simplify/`
4. Update `.env`: `SIMPLIFY_EXTENSION_PATH=./extensions/simplify`
5. Restart the server

The extension will automatically load in new browser sessions.

## Troubleshooting

### Server won't start

```bash
# Check Node.js version (should be 18+)
node --version

# Reinstall dependencies
rm -rf node_modules
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps
```

### Browser won't launch

```bash
# On Linux, install system dependencies
npx playwright install-deps chromium

# On Ubuntu/Debian
sudo apt-get install -y \
  libgtk-3-0 libnotify4 libnss3 libxss1 \
  libasound2 libxtst6 xauth xvfb
```

### Extension not loading

- Ensure extension path is correct in `.env`
- Verify `manifest.json` exists in extension directory
- Check browser console for extension errors
- Try without headless mode (already default)

### WebSocket connection failed

- Check if port 3001 is available
- Verify firewall settings
- Try restarting the server

### Google login fails

- Leave credentials empty and login manually
- May require 2FA or captcha (manual intervention)
- Check for security alerts in your Google account

## Next Steps

1. **Customize Search**: Edit `SEARCH_QUERY` and `ATS_DOMAINS` in `.env`
2. **Multiple Sessions**: Create multiple browser sessions for parallel searching
3. **Monitor Notifications**: Watch for manual action requirements
4. **Take Screenshots**: Capture important moments
5. **Docker Deploy**: Use Docker for production deployment

## Getting Help

- Check [README.md](README.md) for detailed documentation
- Review [CONTRIBUTING.md](CONTRIBUTING.md) for development info
- Open an issue on GitHub for bug reports or questions

## Tips

- **Multiple Sessions**: You can run multiple browser sessions simultaneously
- **Manual Login**: If auto-login fails, log in manually in the browser window
- **Extension Setup**: Configure Simplify manually in the browser if needed
- **Keep Running**: Leave browsers running while Simplify autofills applications
- **Manual Actions**: The system will notify you when manual intervention is needed

---

**Ready to automate your job applications!** 🚀
