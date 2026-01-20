# Auto Filler v2.0 - Job Application Automation Framework

A comprehensive framework that automates the job application process using stealth Chromium browsers and the Simplify extension. Search for jobs, approve applications, and let the system auto-fill forms while you focus on reviewing and submitting.

## ✨ What's New in v2.0

- **Staged Workflow**: Lookup → Approval → Application
- **Job Collection**: Automated Google search across multiple ATS platforms
- **Batch Operations**: Approve and launch multiple applications at once
- **VNC/noVNC Support**: Remote access to browser sessions
- **Simplify Event Tracking**: Real-time monitoring of autofill progress
- **Enhanced Dashboard**: Beautiful, responsive UI with real-time updates

## 🎯 How It Works

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. LOOKUP       │ ──▶ │  2. APPROVAL     │ ──▶ │  3. AUTO-FILL    │ ──▶ │  4. REVIEW       │
│  Search Google   │     │  Review & select │     │  Simplify fills  │     │  VNC access to   │
│  for job apps    │     │  jobs to apply   │     │  the forms       │     │  complete & submit│
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Stage 1: Job Lookup
- Enter search query (e.g., "Summer 2026 software intern")
- System searches Google with ATS domain filters
- Collects job links, titles, and company names
- Real-time progress updates

### Stage 2: Approval
- Review collected jobs
- Approve or reject each job
- Bulk approve all pending jobs
- View job details before approving

### Stage 3: Auto-Fill
- Launch browser sessions for approved jobs
- Simplify extension auto-fills application forms
- Real-time event tracking
- Progress monitoring

### Stage 4: Review & Submit
- Access browser via VNC/screenshots
- Review auto-filled information
- Make corrections as needed
- Submit the application

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/auto_filler.git
cd auto_filler

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

### Running

```bash
# Start the new workflow server
npm run app

# Or use the old single-session mode
npm start
```

Open http://localhost:3000 in your browser.

## 🐳 Docker Deployment (with VNC)

Run with full VNC support for remote browser access:

```bash
# Build and run
docker-compose -f docker-compose.vnc.yml up --build
```

Access points:
- **Dashboard**: http://localhost:3000
- **noVNC Web Client**: http://localhost:6080
- **VNC Direct**: localhost:5900

## 📋 Configuration

Edit `.env` to customize:

```env
# Server
PORT=3000
WS_PORT=3001

# Google credentials (for OAuth login)
GOOGLE_EMAIL=your-email@gmail.com
GOOGLE_PASSWORD=your-password

# Search settings
SEARCH_QUERY=Summer 2026 software intern
ATS_DOMAINS=lever.co,greenhouse.io,workday.com,myworkdayjobs.com,taleo.net,icims.com,smartrecruiters.com

# Simplify extension path
SIMPLIFY_EXTENSION_PATH=./extensions/simplify

# Limits
MAX_CONCURRENT_SESSIONS=3
```

### Installing Simplify Extension

1. Download Simplify from Chrome Web Store
2. Extract the extension files
3. Copy to `extensions/simplify/`
4. The manifest.json should be at `extensions/simplify/manifest.json`

## 🖥️ Dashboard Features

### Job Lookup Panel
- Configure search query and ATS domains
- Start/stop job search
- View search progress
- See all collected jobs

### Approval Panel
- Review pending jobs
- Approve/reject individual jobs
- Bulk approve all pending
- Launch sessions for approved jobs

### Sessions Panel
- View all active browser sessions
- Monitor Simplify autofill progress
- See real-time events
- Take screenshots
- Access VNC for manual completion

### Completed Panel
- View all completed applications
- Track submission timestamps

### Activity Log
- Real-time notifications
- Event history
- Error tracking

## 🔌 API Reference

### Jobs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/jobs/search` | POST | Start job search |
| `/api/jobs` | GET | List all jobs |
| `/api/jobs/:id` | GET | Get job details |
| `/api/jobs/:id/approve` | POST | Approve a job |
| `/api/jobs/:id/reject` | POST | Reject a job |
| `/api/jobs/approve-all` | POST | Approve all pending |
| `/api/jobs/:id/apply` | POST | Launch session for job |
| `/api/jobs/apply-all` | POST | Launch all approved |

### Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id/screenshot` | GET | Take screenshot |
| `/api/sessions/:id/complete` | POST | Mark as complete |
| `/api/sessions/:id` | DELETE | Close session |

### Stats

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Get all statistics |
| `/api/health` | GET | Health check |

## 🔔 WebSocket Events

Connect to `ws://localhost:3001` for real-time updates:

```javascript
// Events received
{
  type: 'initial_state',           // Full state on connect
  type: 'search_progress',         // Search progress updates
  type: 'job_found',               // New job discovered
  type: 'job_updated',             // Job status changed
  type: 'session_created',         // New session launched
  type: 'session_updated',         // Session state changed
  type: 'notification',            // Alert/notification
  type: 'autofill_complete',       // Simplify finished
  type: 'session_completed'        // Application submitted
}
```

## 📁 Project Structure

```
auto_filler/
├── src/
│   ├── backend/
│   │   ├── appServer.js              # New workflow server
│   │   ├── server.js                 # Original server
│   │   ├── jobCollector.js           # Google search & collection
│   │   ├── applicationBrowserManager.js  # Browser with VNC
│   │   ├── applicationSessionManager.js  # Enhanced sessions
│   │   ├── browserManager.js         # Original browser manager
│   │   └── sessionManager.js         # Original session manager
│   ├── frontend/
│   │   └── public/
│   │       ├── dashboard.html        # New workflow dashboard
│   │       └── index.html            # Original dashboard
│   └── utils/
│       ├── simplifyTracker.js        # Simplify event detection
│       ├── googleLogin.js            # Google OAuth helper
│       └── helpers.js                # Utility functions
├── browser-data/                     # Browser profiles
├── extensions/                       # Browser extensions
├── screenshots/                      # Session screenshots
├── Dockerfile                        # Basic container
├── Dockerfile.vnc                    # Container with VNC
├── docker-compose.yml                # Basic compose
├── docker-compose.vnc.yml            # Compose with VNC
├── package.json
└── .env.example
```

## 🔒 Security

- Never commit `.env` with real credentials
- Use strong passwords
- Run in isolated containers for production
- Monitor for suspicious activity
- Keep dependencies updated

## 🛠️ Troubleshooting

### Job search not finding results
- Check your internet connection
- Verify ATS domains are correct
- Google may rate-limit; wait and try again

### Simplify not auto-filling
- Ensure extension is properly installed
- Login to Simplify in the browser
- Check if the ATS is supported by Simplify

### VNC not connecting
- Ensure Docker container is running
- Check port 5900/6080 are not blocked
- Try the noVNC web client first

### Browser sessions crashing
- Increase Docker shared memory (`shm_size`)
- Check available system resources
- Reduce concurrent sessions

## 📄 License

ISC License

---

**Note**: This tool is for educational and personal use. Ensure you comply with the terms of service of any websites you automate.
