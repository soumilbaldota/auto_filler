FROM mcr.microsoft.com/playwright:v1.57.0-noble

# Set working directory
WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Install browsers with dependencies
RUN npx playwright install chromium --with-deps

# Create directories for browser data and extensions
RUN mkdir -p /app/browser-data /app/extensions /app/screenshots

# Expose ports
EXPOSE 3000 3001

# Run the application
CMD ["npm", "start"]
