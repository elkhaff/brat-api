FROM mcr.microsoft.com/playwright:focal

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD 1

WORKDIR /app

# ffmpeg buat nyusun frame jadi video (/bratvid), fontconfig+curl buat install font emoji
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg fontconfig curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Apple Color Emoji (build Linux), biar emoji di teks brat ke-render bukan kotak putih.
# Link lama udah 404, ini ganti ke source yang masih aktif.
RUN mkdir -p /usr/share/fonts/truetype/apple-color-emoji && \
    curl -fL -o /usr/share/fonts/truetype/apple-color-emoji/AppleColorEmoji.ttf \
      "https://github.com/samuelngs/apple-emoji-ttf/releases/download/macos-26-20260613-f1fc560b/AppleColorEmoji-Linux.ttf" && \
    fc-cache -f -v

COPY package*.json ./

RUN npm install

COPY . .

RUN npx playwright install --with-deps

ENV PORT 7860

EXPOSE 7860

CMD ["node", "app.js"]