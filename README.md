# Auto Filler - Job Application Automation Framework

A comprehensive framework that runs stealth Chromium browsers in containers using Playwright. Each browser can install the Simplify extension for autofilling job applications, with centralized management and real-time monitoring.

## Features

- 🚀 **Stealth Browser Automation**: Uses Playwright with stealth techniques to avoid detection
- 🔌 **Extension Support**: Automatic installation of the Simplify extension
- 🔍 **Smart Job Search**: Automated job searching with ATS domain filtering
- 📊 **Real-time Dashboard**: Monitor all browser sessions and their states
- 🔔 **Notifications**: Get alerts when manual action is required
- 🐳 **Docker Support**: Run browsers in isolated containers
- 🌐 **Multi-Session Management**: Handle multiple browser sessions simultaneously

## Architecture

```
┌─────────────────┐
│   Dashboard     │ (Frontend - Real-time UI)
│  (WebSocket)    │
└────────┬────────┘
         │
┌────────▼────────┐
│  Backend API    │ (Express + WebSocket Server)
│  Session Mgr    │
└────────┬────────┘
         │
┌────────▼────────┐
│ Browser Manager │ (Playwright + Stealth)
│  ├─ Session 1   │
│  ├─ Session 2   │
│  └─ Session N   │
└─────────────────┘
```

## Prerequisites

- Node.js 18+ 
- Docker and Docker Compose (optional, for containerized deployment)
- Simplify browser extension files (optional)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/soumilbaldota/auto_filler.git
cd auto_filler
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install Playwright browsers

```bash
npx playwright install chromium --with-deps
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and configure:
- `GOOGLE_EMAIL`: Your Google account email (for browser login)
- `GOOGLE_PASSWORD`: Your Google password
- `SEARCH_QUERY`: Job search query (default: "Summer 2026 software intern")
- `ATS_DOMAINS`: Comma-separated list of ATS domains to search
- `SIMPLIFY_EXTENSION_PATH`: Path to Simplify extension directory (optional)

### 5. (Optional) Add Simplify Extension

If you have the Simplify extension:

1. Create an `extensions` directory:
   ```bash
   mkdir -p extensions/simplify
   ```

2. Copy the unpacked Simplify extension files to `extensions/simplify/`

3. Update `.env`:
   ```
   SIMPLIFY_EXTENSION_PATH=./extensions/simplify
   ```

## Usage

### Running Locally

Start the server:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

Access the dashboard at: http://localhost:3000

### Running with Docker

Build and run with Docker Compose:

```bash
docker-compose up --build
```

The dashboard will be available at: http://localhost:3000

## Dashboard Features

### 1. Session Management
- **Create New Sessions**: Click "Create New Browser Session" to launch a new stealth browser
- **View Active Sessions**: See all running browser sessions in real-time
- **Session Statistics**: Track jobs found, forms autofilled, and manual actions required

### 2. Job Search
- Click "Start Search" on any session to begin automated job searching
- The system searches Google with your configured query and ATS domain filters
- Example: `Summer 2026 software intern (site:lever.co OR site:greenhouse.io)`

### 3. Real-time Monitoring
- Live connection status indicator
- WebSocket updates for instant state changes
- Notification feed for important events

### 4. Actions
- **Start Search**: Begin job search automation
- **Screenshot**: Capture current browser state
- **Close**: Terminate browser session and cleanup

## API Endpoints

### Sessions

- `GET /api/sessions` - List all browser sessions
- `POST /api/sessions` - Create a new browser session
- `GET /api/sessions/:id` - Get specific session details
- `DELETE /api/sessions/:id` - Close a browser session
- `POST /api/sessions/:id/search` - Start job search for a session
- `GET /api/sessions/:id/screenshot` - Take screenshot of session

### Health

- `GET /api/health` - Check server status

## WebSocket Events

The WebSocket server (port 3001) sends real-time updates:

- `initial_state` - Current state when connecting
- `session_created` - New session created
- `session_updated` - Session state changed
- `session_deleted` - Session closed
- `notification` - New notification (manual action required, errors, etc.)

## Configuration

### ATS Domains

The framework supports searching across multiple Applicant Tracking Systems:

- Lever (lever.co)
- Greenhouse (greenhouse.io)
- Workday (workday.com, myworkdayjobs.com)
- Taleo (taleo.net)
- iCIMS (icims.com)
- SmartRecruiters (smartrecruiters.com)

Add more in `.env`:
```
ATS_DOMAINS=lever.co,greenhouse.io,workday.com,custom-ats.com
```

### Search Query

Customize your job search:
```
SEARCH_QUERY=Summer 2026 software engineering intern
```

## Stealth Features

The framework implements several anti-detection techniques:

- ✅ Removes `navigator.webdriver` flag
- ✅ Overrides automation indicators
- ✅ Customizes navigator properties (plugins, languages)
- ✅ Adds Chrome runtime object
- ✅ Handles permission queries
- ✅ Disables automation-controlled features

## Simplify Extension Integration

When the Simplify extension is installed:

1. Browser automatically loads the extension
2. You can manually log in to Simplify in the browser
3. The extension will autofill application forms
4. Dashboard receives notifications when manual action is required
5. You can interact with the browser to complete manual steps

## Troubleshooting

### Browser won't start

- Ensure Playwright browsers are installed: `npx playwright install chromium --with-deps`
- Check system dependencies (Linux): Install required libs for Chromium

### Extension not loading

- Verify extension path in `.env`
- Ensure extension is unpacked (not .crx file)
- Check browser console logs for extension errors

### WebSocket connection failed

- Ensure both ports 3000 and 3001 are available
- Check firewall settings
- Verify WebSocket URL in dashboard matches your configuration

### Sessions not appearing

- Check backend logs for errors
- Verify API server is running on port 3000
- Check browser console for API errors

## Development

### Project Structure

```
auto_filler/
├── src/
│   ├── backend/
│   │   ├── server.js          # Express API server
│   │   ├── browserManager.js  # Playwright browser management
│   │   └── sessionManager.js  # Session state management
│   └── frontend/
│       └── public/
│           └── index.html     # Dashboard UI
├── browser-data/              # Browser user data (gitignored)
├── extensions/                # Browser extensions (gitignored)
├── screenshots/               # Session screenshots (gitignored)
├── Dockerfile                 # Docker container config
├── docker-compose.yml         # Docker Compose config
├── package.json               # Node.js dependencies
└── .env                       # Environment configuration
```

### Adding Features

The modular architecture makes it easy to extend:

1. **Backend**: Add routes in `server.js`, browser logic in `browserManager.js`
2. **Frontend**: Modify `index.html` for UI changes
3. **Sessions**: Extend `sessionManager.js` for new session properties

## Security Notes

⚠️ **Important Security Considerations**:

- Never commit `.env` file with real credentials
- Use strong, unique passwords
- Consider using OAuth instead of password auth
- Run in isolated containers for production
- Regularly update dependencies
- Monitor for suspicious activity

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

ISC License

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions

---

**Note**: This tool is for educational and personal use. Ensure you comply with the terms of service of any websites you automate.
