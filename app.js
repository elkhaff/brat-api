require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('common'));

// Buat browser instance
let browser;

const launchBrowser = async () => {
  browser = await chromium.launch(); // Browser headless
}

launchBrowser();

async function fetchCount() {
  try {
    return (await axios.get("https://api.counterapi.dev/v1/aqul/brat/up")).data?.count || 0
  } catch {
    return 0
  }
}

function infoPayload(extra = {}) {
  return {
    author: 'elkaff',
    repository: {
      github: 'https://github.com/zennn08/brat-api/'
    },
    runtime: {
      os: os.type(),
      platform: os.platform(),
      architecture: os.arch(),
      cpuCount: os.cpus().length,
      uptime: `${os.uptime()} seconds`,
      memoryUsage: `${Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)} MB used of ${Math.round(os.totalmem() / 1024 / 1024)} MB`
    },
    ...extra
  };
}

// Default value kalo query param gak diisi
const DEFAULTS = {
  text: 'brat',
  background: '#ffffff',
  color: '#000000'
};

function resolveParams(req) {
  const text = (req.query.text || '').trim() || DEFAULTS.text;
  const background = req.query.background || DEFAULTS.background;
  const color = req.query.color || DEFAULTS.color;
  return { text, background, color };
}

// Buka halaman brat generator + setup theme & background.
// Warna teks (.textFitted) sengaja TIDAK di-set di sini karena span-nya baru
// kebentuk setelah #textInput pertama kali diisi (lihat applyTextColor).
async function setupBratPage(page, { background } = {}) {
  const filePath = path.join(__dirname, './site/index.html');
  await page.goto(`file://${filePath}`);
  await page.click('#toggleButtonWhite');
  await page.click('#textOverlay');
  await page.click('#textInput');

  if (background) {
    await page.evaluate((bg) => {
      $('.node__content.clearfix').css('background-color', bg);
    }, background);
  }
}

async function applyTextColor(page, color) {
  if (!color) return;
  await page.evaluate((c) => {
    $('.textFitted').css('color', c);
  }, color);
}

// GET / -> info & dokumentasi API
app.get('/', async (req, res) => {
  const hit = await fetchCount();
  res.status(200).json(infoPayload({
    hit,
    message: 'Brat API by elkaff',
    endpoints: {
      '/img': 'Generate gambar brat. Query: text, background, color (semua opsional, ada default)',
      '/vid': 'Generate video brat (teks muncul kata per kata). Query: text, background, color, speed, hold (semua opsional, ada default)'
    },
    defaults: DEFAULTS
  }));
});

// GET /img -> screenshot gambar brat
app.get('/img', async (req, res) => {
  const { text, background, color } = resolveParams(req);

  if (!browser) {
    await launchBrowser();
  }
  const context = await browser.newContext({
    viewport: {
      width: 1536,
      height: 695
    }
  });

  try {
    const page = await context.newPage();

    await setupBratPage(page, { background });
    await page.fill('#textInput', text);
    await applyTextColor(page, color);

    const element = await page.$('#textOverlay');
    const box = await element.boundingBox();

    res.set('Content-Type', 'image/png');
    res.end(await page.screenshot({
      clip: {
        x: box.x,
        y: box.y,
        width: 500,
        height: 500
      }
    }));
  } catch (err) {
    console.error('img error:', err);
    if (!res.headersSent) {
      res.status(500).json(infoPayload({ message: 'Gagal membuat gambar', error: err.message }));
    }
  } finally {
    await context.close();
  }
});

// GET /vid -> teks brat muncul kata demi kata, hasil akhir berupa video mp4
app.get('/vid', async (req, res) => {
  const { text, background, color } = resolveParams(req);

  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 40); // batasi 40 kata
  const speed = Math.min(Math.max(parseInt(req.query.speed) || 500, 200), 2000);
  const hold = Math.min(Math.max(parseInt(req.query.hold) || 1200, 0), 5000);

  if (!browser) {
    await launchBrowser();
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bratvid-'));
  let context;

  try {
    context = await browser.newContext({
      viewport: { width: 1536, height: 695 },
      recordVideo: { dir: workDir, size: { width: 1536, height: 695 } }
    });
    const page = await context.newPage();

    await setupBratPage(page, { background });

    let current = '';
    for (let i = 0; i < words.length; i++) {
      current = current ? `${current} ${words[i]}` : words[i];
      await page.fill('#textInput', current);
      if (i === 0) {
        await applyTextColor(page, color); // span textFitted baru ada setelah fill pertama
      }
      await page.waitForTimeout(speed);
    }
    await page.waitForTimeout(hold);

    const element = await page.$('#textOverlay');
    const box = await element.boundingBox();

    const video = page.video();
    await context.close();
    context = null;

    const rawVideoPath = await video.path();
    const outputPath = path.join(workDir, 'output.mp4');

    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-i', rawVideoPath,
        '-filter:v', `crop=500:500:${Math.round(box.x)}:${Math.round(box.y)}`,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputPath
      ]);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d; });
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr}`))));
    });

    res.set('Content-Type', 'video/mp4');
    res.sendFile(outputPath, (err) => {
      fs.rm(workDir, { recursive: true, force: true }, () => {});
      if (err && !res.headersSent) {
        res.status(500).end();
      }
    });
  } catch (err) {
    console.error('vid error:', err);
    if (context) {
      try { await context.close(); } catch {}
    }
    fs.rm(workDir, { recursive: true, force: true }, () => {});
    if (!res.headersSent) {
      res.status(500).json(infoPayload({ message: 'Gagal membuat video', error: err.message }));
    }
  }
});

// Path lain -> 404 + arahin ke endpoint yang bener
app.use('*', async (req, res) => {
  res.status(404).json(infoPayload({
    message: 'Endpoint tidak ditemukan. Coba /img atau /vid'
  }));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Menangani penutupan server
const closeBrowser = async () => {
  if (browser) {
    console.log('Closing browser...');
    await browser.close();
    console.log('Browser closed');
  }
};

process.on('SIGINT', async () => {
  console.log('SIGINT received');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received');
  await closeBrowser();
  process.exit(0);
});

process.on('exit', async () => {
  console.log('Process exiting');
  await closeBrowser();
});
