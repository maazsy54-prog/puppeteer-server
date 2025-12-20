const express = require('express');
const puppeteer = require('puppeteer'); // ✅ correct for puppeteer docker image
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'change-this-secret';

/* ================= AUTH MIDDLEWARE ================= */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

/* ================= BASIC ROUTES ================= */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Visa slot checker server is running'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

/* ================= MAIN ENDPOINT ================= */
app.post('/check-slots', authenticate, async (req, res) => {
  const { username, password, appd } = req.body;

  if (!username || !password || !appd) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields'
    });
  }

  let browser;

  try {
    console.log('[INFO] Launching browser...');

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: puppeteer.executablePath(), // ✅ FIXED
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });

    const page = await browser.newPage();

    // ✅ CRITICAL FIXES
    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );

    /* ================= LOGIN ================= */
    console.log('[INFO] Opening login page...');
    await page.goto('https://www.usvisascheduling.com/en-US/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    await page.waitForSelector('input[type="text"], input[name="username"]');

    await page.type('input[type="text"], input[name="username"]', username, { delay: 40 });
    await page.type('input[type="password"]', password, { delay: 40 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout: 120000
      })
    ]);

    console.log('[INFO] Logged in successfully');

    /* ================= SCHEDULE PAGE ================= */
    const scheduleUrl = `https://www.usvisascheduling.com/en-US/schedule-group/${appd}/payment/`;
    await page.goto(scheduleUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    await page.waitForTimeout(3000);

    /* ================= API CALL ================= */
    const apiUrl =
      `https://www.usvisascheduling.com/en-US/api/v1/schedule-group/get-family-consular-schedule-entries` +
      `?appd=${appd}&cacheString=${Date.now()}`;

    console.log('[INFO] Fetching slots API');

    const slotsData = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        return res.ok ? await res.json() : { error: res.status };
      } catch (e) {
        return { error: e.message };
      }
    }, apiUrl);

    if (slotsData.error) {
      return res.json({
        success: false,
        error: 'Failed to fetch slots'
      });
    }

    const slots = parseSlots(slotsData);

    return res.json({
      success: true,
      totalSlots: slots.length,
      slots,
      checkedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('[ERROR]', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed');
    }
  }
});

/* ================= SLOT PARSER ================= */
function parseSlots(data) {
  const slots = [];

  if (!Array.isArray(data)) return slots;

  for (const loc of data) {
    const location = loc.locationName || loc.location || 'Unknown';

    if (Array.isArray(loc.availableDates)) {
      for (const d of loc.availableDates) {
        slots.push({
          location,
          date: d.date || d,
          available: true
        });
      }
    }
  }
  return slots;
}

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});




