---
title: Brat Generator API
emoji: 💚
colorFrom: lime
colorTo: green
sdk: docker
pinned: false
license: apache-2.0
short_description: Generate Brat-style images and videos with custom text
---

# 🎨 BRAT Generator API

A powerful API for generating Brat-style images and animated videos using Playwright automation. Create trendy chartreuse green graphics with custom text in the iconic Brat aesthetic.

## ✨ Features

- 🖼️ **Image Generation**: Create static Brat-style images
- 🎬 **Video Generation**: Generate animated videos with text reveal effect
- 🚀 **Fast Performance**: Optimized with browser reuse and efficient processing
- 🔧 **Easy Integration**: Simple REST API endpoints
- 📊 **Usage Analytics**: Built-in hit counter
- 🧹 **Auto Cleanup**: Automatic temporary file management

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/elkhaff/brat-api
cd brat-api
npm install
npx playwright install chromium
```

### Running the Server

```bash
# Development
npm start

# Production
NODE_ENV=production npm start
```

The server will start on `http://localhost:3000`

## 📡 API Endpoints

### 🏠 Root Endpoint
```
GET /
```
Returns API information, usage statistics, and system runtime details.

### 🖼️ Generate Brat Image
```
GET /brat?text=your_text_here
```

**Parameters:**
- `text` (required): The text to display in Brat style

**Response:** PNG image file

**Example:**
```bash
curl "http://localhost:3000/brat?text=Hello%20World" -o brat.png
```

### 🎬 Generate Brat Video
```
GET /bratvid?text=your_text_here
```

**Parameters:**
- `text` (required): The text to animate in Brat style

**Response:** MP4 video file with text reveal animation

**Example:**
```bash
curl "http://localhost:3000/bratvid?text=Brat%20Summer" -o brat.mp4
```

## 🌐 Usage Examples

### HTML Integration
```html
<img src="http://localhost:3000/brat?text=Brat%20Energy" alt="Brat Image">
<video controls>
  <source src="http://localhost:3000/bratvid?text=Club%20Classics" type="video/mp4">
</video>
```

### JavaScript/Fetch API
```javascript
// Generate image
const response = await fetch('/brat?text=Custom Text');
const imageBlob = await response.blob();
const imageUrl = URL.createObjectURL(imageBlob);

// Generate video
const videoResponse = await fetch('/bratvid?text=Animated Text');
const videoBlob = await videoResponse.blob();
const videoUrl = URL.createObjectURL(videoBlob);
```

### Python Requests
```python
import requests

# Download image
response = requests.get('http://localhost:3000/brat?text=Python Brat')
with open('brat.png', 'wb') as f:
    f.write(response.content)

# Download video
video_response = requests.get('http://localhost:3000/bratvid?text=Python Video')
with open('brat.mp4', 'wb') as f:
    f.write(video_response.content)
```

## 🐳 Docker Deployment

### Build and Run
```bash
docker build -t brat-api .
docker run -p 3000:3000 brat-api
```

### Docker Compose
```yaml
version: '3.8'
services:
  brat-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
```

## ⚙️ Configuration

### Environment Variables
```bash
PORT=3000                    # Server port (default: 3000)
NODE_ENV=production         # Environment mode
```

### Dependencies
- **Express**: Web framework
- **Playwright**: Browser automation
- **FFmpeg**: Video processing (required for video generation)
- **Morgan**: HTTP request logging
- **Axios**: HTTP client for analytics

## 🔧 Technical Details

### Image Generation
- Uses Playwright to automate browser interactions
- Captures screenshots of styled text elements
- Returns PNG format images
- Resolution: 500x500 pixels

### Video Generation
- Creates frame-by-frame text reveal animation
- Uses FFmpeg for video compilation
- Frame rate: 30 FPS
- Format: MP4 with H.264 encoding
- Each word appears with 0.7s duration
- Final frame holds for 2s

### Performance Optimizations
- Browser instance reuse
- Temporary file cleanup
- Efficient memory management
- System temp directory usage

## 🛠️ Development

### Project Structure
```
brat-api/
├── app.js              # Main application file
├── site/
│   └── index.html      # Brat generator HTML template
├── package.json        # Dependencies and scripts
├── Dockerfile         # Docker configuration
└── README.md          # This file
```

### Adding Features
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🐛 Troubleshooting

### Common Issues

**Permission Errors:**
- Ensure FFmpeg is installed and accessible
- Check write permissions for temp directory

**Browser Launch Failures:**
- Install Playwright browsers: `npx playwright install`
- For Docker: Use official Playwright base image

**Video Generation Errors:**
- Verify FFmpeg installation
- Check available disk space
- Ensure proper codec support

### Debug Mode
```bash
DEBUG=* npm start
```

## 📊 API Response Examples

### Success Response (Root)
```json
{
  "author": "@elkaff",
  "repository": {
    "github": "https://github.com/elkhaff/brat-api"
  },
  "hit": 1337,
  "endpoints": {
    "brat": "/brat?text=your_text_here",
    "bratvid": "/bratvid?text=your_text_here"
  },
  "message": "Brat Generator API - Image and Video generation",
  "runtime": {
    "os": "Linux",
    "platform": "linux",
    "architecture": "x64",
    "cpuCount": 4,
    "uptime": "3600 seconds",
    "memoryUsage": "256 MB used of 1024 MB"
  }
}
```

### Error Response
```json
{
  "author": "@elkaff",
  "repository": {
    "github": "https://github.com/elkhaff/brat-api"
  },
  "hit": 1337,
  "message": "Parameter `text` diperlukan",
  "example": "/brat?text=your_text_here"
}
```

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Charli XCX's "Brat" album aesthetic
- Built with Playwright for reliable browser automation
- FFmpeg for high-quality video processing

## 🔗 Links

- **Repository**: https://github.com/elkhaff/brat-api
- **Issues**: https://github.com/elkhaff/brat-api/issues
- **Discussions**: https://github.com/elkhaff/brat-api/discussions

---

Made with 💚 by [@elkaff](https://github.com/elkhaff)
