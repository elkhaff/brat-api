require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const axios = require('axios');
const crypto = require('crypto');
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Use system temp directory instead of local temp
const tmpDir = path.join(os.tmpdir(), 'brat-temp');

// Create temp directory with proper error handling
const ensureTempDir = () => {
  try {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
      console.log('Temp directory created:', tmpDir);
    }
  } catch (error) {
    console.error('Failed to create temp directory:', error);
    throw new Error('Cannot create temporary directory. Check write permissions.');
  }
};

// Initialize temp directory
ensureTempDir();

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

const brat = async (text) => {
  if (!browser) {
    await launchBrowser();
  }
  
  const context = await browser.newContext({
    viewport: {
      width: 1536,
      height: 695
    }
  });
  const page = await context.newPage();

  const filePath = path.join(__dirname, './site/index.html');

  // Open https://www.bratgenerator.com/
  await page.goto(`file://${filePath}`);

  // Click on <div> #toggleButtonWhite
  await page.click('#toggleButtonWhite');

  // Click on <div> #textOverlay
  await page.click('#textOverlay');

  // Click on <input> #textInput
  await page.click('#textInput');

  // Fill text on <input> #textInput
  await page.fill('#textInput', text);

  const element = await page.$('#textOverlay');
  const box = await element.boundingBox();

  const screenshot = await page.screenshot({
    clip: {
      x: box.x,
      y: box.y,
      width: 500,
      height: 500
    }
  });
  
  await context.close();
  
  return screenshot;
};

const bratvid = async (text) => {
  const words = text.split(" ");
  
  // Ensure temp directory exists
  ensureTempDir();
  
  const tempSubDir = path.join(tmpDir, `lib-${crypto.randomUUID()}`);
  if (!fs.existsSync(tempSubDir)) {
    fs.mkdirSync(tempSubDir, { recursive: true });
  }
  
  const framePaths = [];
  let fileListPath;

  try {
    for (let i = 0; i < words.length; i++) {
      const currentText = words.slice(0, i + 1).join(" ");
      const imageBuffer = await brat(currentText);
      const framePath = path.join(tempSubDir, `frame${i}.png`);
      fs.writeFileSync(framePath, imageBuffer);
      framePaths.push(framePath);
    }
    
    fileListPath = path.join(tempSubDir, "filelist.txt");
    let fileListContent = "";

    for (let i = 0; i < framePaths.length; i++) {
      fileListContent += `file '${framePaths[i]}'\n`;
      fileListContent += `duration 0.7\n`;
    }

    fileListContent += `file '${framePaths[framePaths.length - 1]}'\n`;
    fileListContent += `duration 2\n`;

    fs.writeFileSync(fileListPath, fileListContent);
    const filename = `${crypto.randomUUID()}.mp4`;
    const outputVideoPath = path.join(tempSubDir, filename);

    execSync(`ffmpeg -y -f concat -safe 0 -i "${fileListPath}" -vf "fps=30" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputVideoPath}"`);
    
    const videoBuffer = fs.readFileSync(outputVideoPath);
    
    // Cleanup
    framePaths.forEach((frame) => {
      if (fs.existsSync(frame)) fs.unlinkSync(frame);
    });
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
    if (fs.existsSync(tempSubDir)) fs.rmSync(tempSubDir, { recursive: true });

    return videoBuffer;

  } catch (err) {
    console.error(err);
   
    // Cleanup on error
    framePaths.forEach((frame) => {
      if (fs.existsSync(frame)) fs.unlinkSync(frame);
    });
    if (fileListPath && fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    if (fs.existsSync(tempSubDir)) fs.rmSync(tempSubDir, { recursive: true });
    
    throw err;
  }
};

// Rest of your code remains the same...
app.get('/', async (req, res) => {
  const hit = fetchCount();
  return res.status(200).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: await hit,
    endpoints: {
      brat: '/brat?text=your_text_here',
      bratvid: '/bratvid?text=your_text_here'
    },
    message: "Brat Generator API - Image and Video generation",
    runtime: {
      os: os.type(),
      platform: os.platform(),
      architecture: os.arch(),
      cpuCount: os.cpus().length,
      uptime: `${os.uptime()} seconds`,
      memoryUsage: `${Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)} MB used of ${Math.round(os.totalmem() / 1024 / 1024)} MB`
    }
  });
});

app.get('/brat', async (req, res) => {
  const text = req.query.text;
  const hit = fetchCount();
  
  if (!text) return res.status(400).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: await hit,
    message: "Parameter `text` diperlukan",
    example: "/brat?text=your_text_here"
  });

  try {
    const imageBuffer = await brat(text);
    res.set('Content-Type', 'image/png');
    res.end(imageBuffer);
  } catch (error) {
    console.error('Error in /brat:', error);
    res.status(500).json({
      message: "Error generating brat image",
      error: error.message
    });
  }
});

app.get('/bratvid', async (req, res) => {
  const { text } = req.query;
  const hit = fetchCount();
  
  if (!text) return res.status(400).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: await hit,
    message: "Parameter `text` diperlukan",
    example: "/bratvid?text=your_text_here"
  });

  console.log(`/bratvid : ${text}`);
  
  try {
    const videoBuffer = await bratvid(text);
    res.set('Content-Type', 'video/mp4');
    res.end(videoBuffer);
  } catch (error) {
    console.error('Error in /bratvid:', error);
    res.status(500).json({
      message: "Error generating bratvid",
      error: error.message
    });
  }
});

app.use('*', async (req, res) => {
  const hit = fetchCount();
  return res.status(404).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: await hit,
    message: "Endpoint tidak ditemukan",
    availableEndpoints: [
      "/brat?text=your_text_here",
      "/bratvid?text=your_text_here"
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Temp directory: ${tmpDir}`);
  console.log(`Available endpoints:`);
  console.log(`- GET /brat?text=your_text_here (Image)`);
  console.log(`- GET /bratvid?text=your_text_here (Video)`);
});

// Cleanup functions remain the same...
const closeBrowser = async () => {
  if (browser) {
    console.log('Closing browser...');
    await browser.close();
    console.log('Browser closed');
  }
};

const cleanupTempFiles = () => {
  try {
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      files.forEach(file => {
        const filePath = path.join(tmpDir, file);
        try {
          if (fs.statSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.error('Error removing file:', filePath, err);
        }
      });
      console.log('Temp files cleaned up');
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
};

process.on('SIGINT', async () => {
  console.log('SIGINT received');
  await closeBrowser();
  cleanupTempFiles();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received');
  await closeBrowser();
  cleanupTempFiles();
  process.exit(0);
});

process.on('exit', async () => {
  console.log('Process exiting');
  await closeBrowser();
  cleanupTempFiles();
});
