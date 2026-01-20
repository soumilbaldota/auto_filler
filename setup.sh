#!/bin/bash

# Setup script for Auto Filler

echo "🚀 Setting up Auto Filler..."

# Check Node.js version
echo "Checking Node.js version..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "Installing dependencies..."
npm install

# Install Playwright browsers
echo "Installing Playwright browsers..."
npx playwright install chromium --with-deps

# Create necessary directories
echo "Creating directories..."
mkdir -p browser-data extensions screenshots

# Copy environment file
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. (Optional) Add Simplify extension to extensions/simplify/"
echo "3. Run 'npm start' to start the server"
echo "4. Open http://localhost:3000 in your browser"
echo ""
