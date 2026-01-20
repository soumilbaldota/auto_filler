# Contributing to Auto Filler

Thank you for your interest in contributing to Auto Filler!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Install Playwright: `npx playwright install chromium --with-deps`
4. Copy `.env.example` to `.env` and configure
5. Run the development server: `npm run dev`

## Code Structure

```
src/
├── backend/          # Server-side code
│   ├── server.js           # Main API server
│   ├── browserManager.js   # Browser session management
│   └── sessionManager.js   # State management
├── frontend/         # Client-side code
│   └── public/
│       └── index.html      # Dashboard UI
└── utils/            # Shared utilities
    ├── helpers.js          # Common utility functions
    └── googleLogin.js      # Google authentication
```

## Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test your changes locally
4. Commit with clear messages: `git commit -m "Add feature X"`
5. Push and create a pull request

## Code Style

- Use meaningful variable names
- Add comments for complex logic
- Follow existing code patterns
- Keep functions focused and small

## Testing

Before submitting:
- Test all API endpoints
- Verify WebSocket connections
- Check browser automation works
- Test Docker deployment if applicable

## Pull Request Process

1. Update README.md if needed
2. Update documentation for new features
3. Ensure all tests pass
4. Request review from maintainers

## Bug Reports

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Screenshots if applicable

## Feature Requests

- Describe the feature clearly
- Explain the use case
- Discuss implementation approach if possible

## Questions?

Open an issue for any questions or discussions!
