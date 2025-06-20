require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
const tmpDir = os.tmpdir();

app.use(morgan('common'));

// Hit counter
let hit = 0;

// Buat browser instance
let browser;

const launchBrowser = async () => {
  browser = await chromium.launch(); // Browser headless
}

launchBrowser();

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

  // Fill "sas" on <input> #textInput
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
  const tempDir = path.join(tmpDir, 'lib');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const framePaths = [];

  try {
    for (let i = 0; i < words.length; i++) {
      const currentText = words.slice(0, i + 1).join(" ");
      const imageBuffer = await brat(currentText);
      const framePath = path.join(tempDir, `frame${i}.png`);
      fs.writeFileSync(framePath, imageBuffer);
      framePaths.push(framePath);
    }
    
    const fileListPath = path.join(tempDir, "filelist.txt");
    let fileListContent = "";

    for (let i = 0; i < framePaths.length; i++) {
      fileListContent += `file '${framePaths[i]}'\n`;
      fileListContent += `duration 0.7\n`;
    }

    fileListContent += `file '${framePaths[framePaths.length - 1]}'\n`;
    fileListContent += `duration 2\n`;

    fs.writeFileSync(fileListPath, fileListContent);
    const filename = `${crypto.randomUUID()}.mp4`;
    const outputVideoPath = path.join(tmpDir, filename);

    execSync(`ffmpeg -y -f concat -safe 0 -i ${fileListPath} -vf "fps=30" -c:v libx264 -preset ultrafast -pix_fmt yuv420p ${outputVideoPath}`);
    
    const videoBuffer = fs.readFileSync(outputVideoPath);
    
    framePaths.forEach((frame) => {
      if (fs.existsSync(frame)) fs.unlinkSync(frame);
    });
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);

    return videoBuffer;

  } catch (err) {
    console.error(err);
   
    framePaths.forEach((frame) => {
      if (fs.existsSync(frame)) fs.unlinkSync(frame);
    });
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    
    throw err;
  }
};

app.get('/', async (req, res) => {
  return res.status(200).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: hit,
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
  
  if (!text) return res.status(400).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: hit,
    message: "Parameter `text` diperlukan",
    example: "/brat?text=your_text_here"
  });

  try {
    const imageBuffer = await brat(text);
    hit++; // Increment hit counter setelah berhasil
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
  
  if (!text) return res.status(400).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: hit,
    message: "Parameter `text` diperlukan",
    example: "/bratvid?text=your_text_here"
  });

  console.log(`/bratvid : ${text}`);
  
  try {
    const videoBuffer = await bratvid(text);
    hit++; // Increment hit counter setelah berhasil
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
  return res.status(404).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    hit: hit,
    message: "Endpoint tidak ditemukan",
    availableEndpoints: [
      "/brat?text=your_text_here",
      "/bratvid?text=your_text_here"
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`- GET /brat?text=your_text_here (Image)`);
  console.log(`- GET /bratvid?text=your_text_here (Video)`);
});

// Menangani penutupan server
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
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
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
