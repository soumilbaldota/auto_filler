# Deployment Guide

## Production Deployment

### Prerequisites

- Server with Node.js 18+ installed
- Docker (recommended)
- Domain name (optional)
- SSL certificate (optional, for HTTPS)

## Option 1: Docker Deployment (Recommended)

### 1. Prepare the Server

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

### 2. Clone and Configure

```bash
# Clone repository
git clone https://github.com/soumilbaldota/auto_filler.git
cd auto_filler

# Configure environment
cp .env.example .env
nano .env  # Edit with your settings
```

### 3. Build and Run

```bash
# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

### 4. Access the Application

The application will be available at:
- Dashboard: `http://your-server-ip:3000`
- API: `http://your-server-ip:3000/api`
- WebSocket: `ws://your-server-ip:3001`

---

## Option 2: Direct Deployment

### 1. Prepare Server

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install system dependencies for Playwright
sudo apt-get install -y \
  libgtk-3-0 libnotify4 libnss3 libxss1 \
  libasound2 libxtst6 xauth xvfb \
  fonts-liberation libappindicator3-1 \
  libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdbus-1-3 libdrm2 \
  libgbm1 libnspr4 libu2f-udev \
  libvulkan1 xdg-utils
```

### 2. Deploy Application

```bash
# Clone repository
git clone https://github.com/soumilbaldota/auto_filler.git
cd auto_filler

# Install dependencies
npm install

# Install Playwright
npx playwright install chromium --with-deps

# Configure environment
cp .env.example .env
nano .env
```

### 3. Run with Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/backend/server.js --name auto-filler

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 4. Manage Application

```bash
# View logs
pm2 logs auto-filler

# Restart
pm2 restart auto-filler

# Stop
pm2 stop auto-filler

# Monitor
pm2 monit
```

---

## Nginx Reverse Proxy (Optional)

### 1. Install Nginx

```bash
sudo apt-get install nginx
```

### 2. Configure Nginx

Create `/etc/nginx/sites-available/auto-filler`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

### 3. Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/auto-filler /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL/HTTPS Setup (Optional)

### Using Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

---

## Environment Variables for Production

```bash
# .env file
PORT=3000
WS_PORT=3001
NODE_ENV=production

# Google credentials (optional)
GOOGLE_EMAIL=your-email@gmail.com
GOOGLE_PASSWORD=your-secure-password

# Job search settings
SEARCH_QUERY=Summer 2026 software intern
ATS_DOMAINS=lever.co,greenhouse.io,workday.com

# Simplify extension (if available)
SIMPLIFY_EXTENSION_PATH=/app/extensions/simplify

# Security
MAX_CONTAINERS=10
```

---

## Security Considerations

### 1. Firewall

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. Environment Variables

- Never commit `.env` with real credentials
- Use strong passwords
- Consider using secrets management (e.g., AWS Secrets Manager)

### 3. Regular Updates

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade

# Update Node.js dependencies
cd /path/to/auto_filler
npm update

# Update Playwright
npx playwright install chromium --with-deps
```

---

## Monitoring

### Application Logs

```bash
# Docker
docker-compose logs -f

# PM2
pm2 logs auto-filler

# System logs
journalctl -u auto-filler -f
```

### Resource Monitoring

```bash
# Docker
docker stats

# PM2
pm2 monit

# System
htop
```

---

## Scaling

### Multiple Containers

Edit `docker-compose.yml`:

```yaml
services:
  auto-filler-backend:
    deploy:
      replicas: 3
```

### Load Balancing

Use Nginx to load balance across multiple instances:

```nginx
upstream auto_filler {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    listen 80;
    location / {
        proxy_pass http://auto_filler;
    }
}
```

---

## Backup

### Backup Browser Data

```bash
# Create backup
tar -czf backup-$(date +%Y%m%d).tar.gz browser-data/ extensions/

# Restore
tar -xzf backup-20240120.tar.gz
```

---

## Troubleshooting

### Check Service Status

```bash
# Docker
docker-compose ps

# PM2
pm2 status

# Logs
tail -f /var/log/nginx/error.log
```

### Common Issues

1. **Port already in use**: Change PORT in `.env`
2. **Browser crashes**: Increase memory, check system resources
3. **Extension not loading**: Verify path and permissions

---

## Performance Tuning

### Node.js

```bash
# Increase memory limit
NODE_OPTIONS=--max-old-space-size=4096 npm start
```

### Docker

```yaml
# docker-compose.yml
services:
  auto-filler-backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

---

**Your Auto Filler is now production-ready!** 🚀
