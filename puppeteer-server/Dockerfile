FROM ghcr.io/puppeteer/puppeteer:24.15.0

WORKDIR /app

# Copy from subfolder
COPY puppeteer-server/package*.json ./

RUN npm install --omit=dev

COPY puppeteer-server .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3000

CMD ["node", "server.js"]




