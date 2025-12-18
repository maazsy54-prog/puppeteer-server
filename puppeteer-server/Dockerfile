FROM ghcr.io/puppeteer/puppeteer:24.15.0

# Switch to root to install dependencies
USER root

WORKDIR /app

# Copy package files from subfolder
COPY puppeteer-server/package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy app source
COPY puppeteer-server .

# Fix ownership so puppeteer user can run app
RUN chown -R pptruser:pptruser /app

# Switch back to puppeteer user (SECURITY BEST PRACTICE)
USER pptruser

EXPOSE 3000

CMD ["node", "server.js"]






