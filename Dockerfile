# Use Node.js 20 slim as base image
FROM node:20-slim

# Install dependencies for Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libatk1.0-0 \
    fonts-liberation \
    libappindicator3-1 \
    lsb-release \
    xdg-utils \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Using --production to skip devDependencies if any
RUN npm install

# Copy the rest of the application
COPY . .

# Create data directory for persistence
RUN mkdir -p data

# Expose the API port
EXPOSE 3000

# Set environment variables (can be overridden by docker-compose or .env)
ENV NODE_ENV=production
ENV API_PORT=3000

# Command to start the application
# We use api.js as it starts both the API and the Bot
CMD ["node", "api.js"]
