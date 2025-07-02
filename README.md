---
title: Brat
emoji: 💚
colorFrom: lime
colorTo: green
sdk: docker
pinned: false
license: apache-2.0
short_description: brat generator api
---

# BRAT API USING PLAYWRIGHT

Generate Brat-style images and videos using Playwright automation.

## HOW TO INSTALL

```bash
git clone https://github.com/elkhaff/brat-api
cd brat-api
npm install
npx playwright install chromium
node app.js
```

## HOW TO ACCESS API

### Generate Image
```
http://localhost:3000/brat?text=Hello World
```

### Generate Video
```
http://localhost:3000/bratvid?text=Brat Summer
```

### API Info
```
http://localhost:3000/
```

## ENDPOINTS

- `GET /brat?text=your_text` - Returns PNG image
- `GET /bratvid?text=your_text` - Returns MP4 video
- `GET /` - API information

## REQUIREMENTS

- Node.js
- FFmpeg (for video generation)
- Playwright Chromium

---

> 👨‍💻 Original script by [Aqul](https://github.com/zennn08)  
> 🔧 Recode & modded by [Elkaff](https://github.com/elkhaff)
