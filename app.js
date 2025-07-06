require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const tmpDir = os.tmpdir();

app.use(morgan('common'));

// Buat browser instance
let browser;

const launchBrowser = async () => {
  browser = await chromium.launch(); // Browser headless
}

launchBrowser();

async function getStats() {
  try {
    return (await axios.get("https://api.counterapi.dev/v1/elkaff/brat/up")).data?.count || 0;
  } catch {
    return 0;
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
  const count = await getStats();

  return res.status(200).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    stats: count
  });
});

app.get('/brat', async (req, res) => {
  const text = req.query.text;

  if (!text) {
    return res.status(400).json({
      message: "Parameter text diperlukan"
    });
  }

  try {
    const imageBuffer = await brat(text);
    await getStats();

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

  if (!text) {
    return res.status(400).json({
      message: "Parameter text diperlukan"
    });
  }

  try {
    const videoBuffer = await bratvid(text);
    await getStats();

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
  const count = await getStats();

  return res.status(404).json({
    author: '@elkaff',
    repository: {
      github: 'https://github.com/elkhaff/brat-api'
    },
    stats: count
  });
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
