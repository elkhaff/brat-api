require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('common'));

// ----- Cache (SHA256 hash dari parameter -> file di /cache, TTL 1 bulan) -----
// GENERATION_VERSION ikut masuk ke hash. Setiap kali logic generate gambar/video
// berubah (bugfix dll), bump versi ini biar cache lama otomatis gak ke-pake lagi
// (gak perlu manual hapus folder /cache pas redeploy).
const GENERATION_VERSION = 'v4'; // v4: fix warna teks cuma kena frame pertama di /vid
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 1 bulan
fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheKey(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function cachePath(type, hash) {
  return path.join(CACHE_DIR, `${type}-${hash}.${type === 'img' ? 'png' : 'mp4'}`);
}

async function readCache(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null; // udah expired
    return await fs.promises.readFile(filePath);
  } catch {
    return null; // belum ada cache
  }
}

async function writeCache(filePath, buffer) {
  try {
    await fs.promises.writeFile(filePath, buffer);
  } catch (err) {
    console.error('cache write error:', err);
  }
}

// Bersihin file cache yang udah lewat TTL, jalan saat start + tiap 6 jam
async function cleanupCache() {
  try {
    const files = await fs.promises.readdir(CACHE_DIR);
    const now = Date.now();
    await Promise.all(files.map(async (f) => {
      const fp = path.join(CACHE_DIR, f);
      try {
        const stat = await fs.promises.stat(fp);
        if (now - stat.mtimeMs > CACHE_TTL_MS) {
          await fs.promises.unlink(fp);
        }
      } catch {}
    }));
  } catch (err) {
    console.error('cache cleanup error:', err);
  }
}
cleanupCache();
setInterval(cleanupCache, 6 * 60 * 60 * 1000);

// Buat browser instance
let browser;

const launchBrowser = async () => {
  browser = await chromium.launch(); // Browser headless
}

launchBrowser();

// (hit counter dihapus, gak ada lagi tempat buat nampilinnya sejak '/' redirect)
function infoPayload(extra = {}) {
  return {
    author: 'elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
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
// NOTE: file './site/index.html' itu BUKAN halaman bratgenerator asli, itu index
// hasil mirror HTTrack yang isinya cuma meta-refresh redirect -> goto langsung
// ke file aslinya biar gak ada flash/delay redirect.
const BRAT_PAGE_PATH = path.join(__dirname, './site/www.bratgenerator.com/index.html');

async function setupBratPage(page, { background } = {}) {
  await page.goto(`file://${BRAT_PAGE_PATH}`);
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

// GET / -> redirect ke halaman utama
app.get('/', (req, res) => {
  res.redirect('https://pomni.cc.cd');
});

// GET /colors -> daftar preset warna yang tersedia
app.get('/colors', (req, res) => {
  res.status(200).json({
    author: 'elkaff',
    note: 'Semua hex color valid (#rrggbb) bisa dipakai di param background dan color. Berikut preset populer.',
    presets: [
      { name: 'brat',       background: '#8ace00', color: '#000000', description: 'Warna ikonik album brat Charli XCX' },
      { name: 'classic',    background: '#ffffff', color: '#000000', description: 'Putih & hitam, default' },
      { name: 'dark',       background: '#000000', color: '#ffffff', description: 'Hitam & putih' },
      { name: 'pink',       background: '#ff69b4', color: '#000000', description: 'Y2K hot pink' },
      { name: 'lime',       background: '#ccff00', color: '#000000', description: 'Neon lime' },
      { name: 'fire',       background: '#ff2200', color: '#ffffff', description: 'Merah nyala' },
      { name: 'midnight',   background: '#0a0a1a', color: '#8ace00', description: 'Dark + brat green accent' },
      { name: 'lavender',   background: '#e6ccff', color: '#2d0060', description: 'Soft purple' },
      { name: 'cream',      background: '#f5f0e8', color: '#1a1a1a', description: 'Warm minimal' },
      { name: 'blue',       background: '#0000ff', color: '#ffff00', description: 'Bold electric contrast' },
    ]
  });
});


app.get('/docs', (req, res) => {
  res.status(200).json(infoPayload({
    description: 'Generate gambar & video bergaya "brat" (album cover Charli XCX) dari teks apa aja.',
    endpoints: {
      'GET /img': {
        description: 'Generate gambar PNG 500x500 statis',
        params: {
          text: { type: 'string', default: DEFAULTS.text, description: 'Teks yang ditampilkan, gak ada batasan panjang' },
          background: { type: 'hex color', default: DEFAULTS.background, description: 'Warna background, contoh %23ff0000 (urlencode #)' },
          color: { type: 'hex color', default: DEFAULTS.color, description: 'Warna teks' }
        },
        example: '/img?text=brat+summer&background=%2300ff66&color=%23000000'
      },
      'GET /vid': {
        description: 'Generate video MP4 500x500, teks muncul kata demi kata',
        params: {
          text: { type: 'string', default: DEFAULTS.text, description: 'Teks yang dianimasiin, gak ada batasan panjang' },
          background: { type: 'hex color', default: DEFAULTS.background, description: 'Warna background' },
          color: { type: 'hex color', default: DEFAULTS.color, description: 'Warna teks' },
          speed: { type: 'integer (ms)', default: 500, range: '200-2000', description: 'Jeda antar kata muncul' },
          hold: { type: 'integer (ms)', default: 1200, range: '0-5000', description: 'Lama frame terakhir ditahan' }
        },
        example: "/vid?text=brat+and+it's+completely+different&speed=400&hold=1500"
      }
    },
    availableColors: {
      note: 'Semua hex color valid (#rrggbb). Berikut palet populer yang cocok dengan estetika brat:',
      presets: [
        { name: 'brat green',   background: '#8ace00', color: '#000000', description: 'Warna ikonik album brat Charli XCX' },
        { name: 'classic',      background: '#ffffff', color: '#000000', description: 'Putih & hitam, default' },
        { name: 'dark mode',    background: '#000000', color: '#ffffff', description: 'Hitam & putih' },
        { name: 'hot pink',     background: '#ff69b4', color: '#000000', description: 'Y2K pink' },
        { name: 'electric blue',background: '#0000ff', color: '#ffff00', description: 'Bold contrast' },
        { name: 'lime',         background: '#ccff00', color: '#000000', description: 'Neon lime' },
        { name: 'fire',         background: '#ff2200', color: '#ffffff', description: 'Merah nyala' },
        { name: 'lavender',     background: '#e6ccff', color: '#2d0060', description: 'Soft purple' },
        { name: 'cream',        background: '#f5f0e8', color: '#1a1a1a', description: 'Warm minimal' },
        { name: 'midnight',     background: '#0a0a1a', color: '#8ace00', description: 'Dark + brat green accent' }
      ]
    },
    cache: {
      description: 'Tiap kombinasi parameter di-hash SHA256, hasil generate disimpan di folder /cache. Request berikutnya dengan parameter identik langsung diambil dari cache.',
      ttl: '30 hari, dibersihkan otomatis tiap 6 jam',
      header: 'X-Cache: HIT (dari cache) atau MISS (generate baru)'
    },
    emojiFont: 'Apple Color Emoji (build Linux) sudah ter-install di server, jadi emoji di dalam `text` ke-render dengan benar.',
    errorResponseExample: {
      author: 'elkaff',
      repository: { github: 'https://github.com/elkhaff/brat-api' },
      message: 'Gagal membuat video',
      error: '...'
    }
  }));
});

// GET /img -> screenshot gambar brat
app.get('/img', async (req, res) => {
  const { text, background, color } = resolveParams(req);

  const hash = cacheKey({ v: GENERATION_VERSION, type: 'img', text, background, color });
  const filePath = cachePath('img', hash);

  const cached = await readCache(filePath);
  if (cached) {
    res.set('Content-Type', 'image/png');
    res.set('X-Cache', 'HIT');
    return res.end(cached);
  }

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

    const buffer = await page.screenshot({
      clip: {
        x: box.x,
        y: box.y,
        width: 500,
        height: 500
      }
    });

    res.set('Content-Type', 'image/png');
    res.set('X-Cache', 'MISS');
    res.end(buffer);

    await writeCache(filePath, buffer);
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
//
// NOTE PENTING: ini SENGAJA gak pake Playwright recordVideo. recordVideo ngerekam
// dari context dibuat (termasuk proses navigasi awal), jadi gampang ke-capture
// frame transisi yang salah meskipun sudah di-setup duluan. Solusinya: generate
// video dengan cara screenshot manual tiap kata (sama persis kayak /img yang
// terbukti selalu benar) -> tiap screenshot di-hardlink berulang sesuai durasi
// yang diinginkan jadi sequence frame constant-framerate -> baru di-encode ffmpeg.
// Hardlink dipake (bukan copy) biar gak ada pemborosan disk walau 1 kata bisa
// muncul jadi puluhan frame fisik. Pendekatan CFR ini juga lebih akurat
// durasinya dibanding concat demuxer dengan custom duration (yang ternyata
// metadata durasinya suka meleset).
const VID_FPS = 24;

app.get('/vid', async (req, res) => {
  const { text, background, color } = resolveParams(req);
  const speed = Math.min(Math.max(parseInt(req.query.speed) || 500, 200), 2000);
  const hold = Math.min(Math.max(parseInt(req.query.hold) || 1200, 0), 5000);

  const words = text.trim().split(/\s+/).filter(Boolean); // gak ada batasan jumlah kata

  const hash = cacheKey({ v: GENERATION_VERSION, type: 'vid', text, background, color, speed, hold });
  const filePath = cachePath('vid', hash);

  const cached = await readCache(filePath);
  if (cached) {
    res.set('Content-Type', 'video/mp4');
    res.set('X-Cache', 'HIT');
    return res.end(cached);
  }

  if (!browser) {
    await launchBrowser();
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bratvid-'));
  const wordsDir = path.join(workDir, 'words'); // 1 file per kata (screenshot asli)
  const seqDir = path.join(workDir, 'seq'); // hardlink sequence buat ffmpeg
  fs.mkdirSync(wordsDir);
  fs.mkdirSync(seqDir);
  let context;

  try {
    context = await browser.newContext({ viewport: { width: 1536, height: 695 } });
    const page = await context.newPage();

    await setupBratPage(page, { background });

    // Set teks penuh dulu sekali buat nentuin posisi crop yang stabil dipake
    // di semua frame (textOverlay center-nya gak geser drastis antar frame).
    await page.fill('#textInput', text);
    await applyTextColor(page, color);
    const boxEl = await page.$('#textOverlay');
    const box = await boxEl.boundingBox();
    const clip = { x: box.x, y: box.y, width: 500, height: 500 };

    // Ambil 1 screenshot per kata (kumulatif), lalu hardlink jadi sequence
    // frame sebanyak yang dibutuhin biar durasi tampilnya sesuai speed/hold.
    let current = '';
    let frameIndex = 0;
    for (let i = 0; i < words.length; i++) {
      current = current ? `${current} ${words[i]}` : words[i];
      await page.fill('#textInput', current);
      await page.waitForTimeout(50); // kasih waktu reflow textFit settle sebelum di-capture
      // applyTextColor dipanggil SETIAP iterasi (bukan cuma i===0) karena
      // tiap page.fill() bikin textFit recalculate dan replace .textFitted span-nya,
      // otomatis nge-reset inline style warna yang sudah di-set sebelumnya.
      await applyTextColor(page, color);

      const wordFramePath = path.join(wordsDir, `w${String(i).padStart(5, '0')}.png`);
      const buf = await page.screenshot({ clip });
      await fs.promises.writeFile(wordFramePath, buf);

      const durationMs = i === words.length - 1 ? hold : speed;
      const repeatCount = Math.max(1, Math.round((durationMs / 1000) * VID_FPS));
      for (let k = 0; k < repeatCount; k++) {
        const seqPath = path.join(seqDir, `f${String(frameIndex).padStart(6, '0')}.png`);
        await fs.promises.link(wordFramePath, seqPath);
        frameIndex++;
      }
    }

    await context.close();
    context = null;

    const outputPath = path.join(workDir, 'output.mp4');
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-framerate', String(VID_FPS),
        '-i', path.join(seqDir, 'f%06d.png'),
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264',
        '-movflags', '+faststart',
        outputPath
      ]);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d; });
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr}`))));
    });

    const buffer = await fs.promises.readFile(outputPath);

    res.set('Content-Type', 'video/mp4');
    res.set('X-Cache', 'MISS');
    res.end(buffer);

    await writeCache(filePath, buffer);
  } catch (err) {
    console.error('vid error:', err);
    if (context) {
      try { await context.close(); } catch {}
    }
    if (!res.headersSent) {
      res.status(500).json(infoPayload({ message: 'Gagal membuat video', error: err.message }));
    }
  } finally {
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
});

// Path lain -> 404 + arahin ke docs
app.use('*', async (req, res) => {
  res.status(404).json(infoPayload({
    message: 'Endpoint tidak ditemukan. Liat dokumentasi lengkap di /docs',
    endpoints: { img: '/img', vid: '/vid', docs: '/docs' }
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
