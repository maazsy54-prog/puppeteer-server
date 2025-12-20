FROM ghcr.io/puppeteer/puppeteer:24.15.0

WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production --omit=dev

# Copy the rest of the project files
COPY . .

# Install missing dependencies for Chromium
RUN apt-get update && apt-get install -y wget gnupg
RUN apt-get install -y libxss1 libappindicator3-1 libindicator7

# Skip Chromium download and set executable path
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]







