const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'change-this-secret';

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to the Visa Slot Checker API!');
});

// Middleware to check API secret
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main visa slot checker endpoint
app.post('/check-slots', authenticate, async (req, res) => {
  const { username, password, appd } = req.body;

  if (!username || !password || !appd) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields: username, password, appd' 
    });
  }

  let browser = null;
  
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });

    const page = await browser.newPage();
    
    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to login page...');
    await page.goto('https://www.usvisascheduling.com/en-US/login/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for login form
    await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 30000 });
    
    console.log('Filling login form...');
    // Fill username
    const usernameInput = await page.$('input[name="username"]') || await page.$('input[type="text"]');
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 50 });

    // Fill password
    const passwordInput = await page.$('input[name="password"]') || await page.$('input[type="password"]');
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    // Click login button
    const loginButton = await page.$('button[type="submit"]') || await page.$('button:contains("Login")');
    if (loginButton) {
      await loginButton.click();
    }

    // Wait for navigation after login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Logged in successfully');

    // Navigate to schedule page
    const scheduleUrl = `https://www.usvisascheduling.com/en-US/schedule-group/${appd}/payment/`;
    console.log('Navigating to schedule page:', scheduleUrl);
    await page.goto(scheduleUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait a bit for the page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Make the API call to get slots
    const cacheString = Date.now().toString();
    const apiUrl = `https://www.usvisascheduling.com/en-US/api/v1/schedule-group/get-family-consular-schedule-entries?appd=${appd}&cacheString=${cacheString}`;
    
    console.log('Fetching slot data from API...');
    const slotsData = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include'
        });
        
        if (!response.ok) {
          return { error: `HTTP ${response.status}`, status: response.status };
        }
        
        return await response.json();
      } catch (err) {
        return { error: err.message };
      }
    }, apiUrl);

    console.log('API response received');

    if (slotsData.error) {
      return res.json({
        success: false,
        error: slotsData.error,
        message: 'Failed to fetch slot data'
      });
    }

    // Parse the slots data
    const slots = parseSlots(slotsData);
    
    return res.json({
      success: true,
      slots,
      totalSlots: slots.length,
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
});

// Parse slots from API response
function parseSlots(data) {
  const slots = [];
  
  try {
    if (Array.isArray(data)) {
      data.forEach(location => {
        const locationName = location.locationName || location.location || 'Unknown';
        const consulate = location.consulateName || location.consulate || locationName;
        
        if (location.slots && Array.isArray(location.slots)) {
          location.slots.forEach(slot => {
            slots.push({
              location: locationName,
              consulate,
              date: slot.date || slot.appointmentDate,
              time: slot.time || slot.appointmentTime,
              available: true
            });
          });
        }
        
        if (location.availableDates && Array.isArray(location.availableDates)) {
          location.availableDates.forEach(dateInfo => {
            slots.push({
              location: locationName,
              consulate,
              date: dateInfo.date || dateInfo,
              time: dateInfo.time || null,
              available: true
            });
          });
        }
      });
    }
  } catch (err) {
    console.error('Error parsing slots:', err);
  }
  
  return slots;
}

app.listen(PORT, () => {
  console.log(`Visa slot checker server running on port ${PORT}`);
});
