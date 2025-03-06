FROM node:20-slim

WORKDIR /app

# Install only the necessary dependencies for Chromium
RUN apt-get update && apt-get install -y \
    libwoff1 \
    libopus0 \
    libwebp7 \
    libwebpdemux2 \
    libenchant-2-2 \
    libgudev-1.0-0 \
    libsecret-1-0 \
    libhyphen0 \
    libgdk-pixbuf2.0-0 \
    libegl1 \
    libnotify4 \
    libxslt1.1 \
    libevent-2.1-7 \
    libgles2 \
    libvpx7 \
    libxcomposite1 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libepoxy0 \
    libgtk-3-0 \
    libharfbuzz-icu0 \
    libnss3 \
    libnspr4 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Create downloads directory
RUN mkdir -p /app/downloads

# Copy package files
COPY package*.json ./

# Install only playwright-chromium and other dependencies
RUN npm ci

# Copy entire project
COPY . .

# Install only Chromium browser
RUN npx playwright install chromium

# Compile TypeScript
RUN npm run build

# Start your application
CMD ["npm", "start"]
