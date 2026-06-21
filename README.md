---
title: Bart
emoji: 🏢
colorFrom: gray
colorTo: yellow
sdk: docker
pinned: false
license: apache-2.0
short_description: bart
---

# BRAT API USING PLAYWRIGHT

## HOW TO INSTALL

```bash
git clone https://github.com/zennn08/brat-api
cd brat-api
npx playwright install
npm install
node app.js
```

## HOW TO ACCESS API

Gambar:
```
http://localhost:3000/img?text=Hi!
```

Video (teks muncul kata per kata):
```
http://localhost:3000/vid?text=brat+summer
```

Semua query param opsional, ada default-nya kalau gak diisi:

| Param | Default | Keterangan |
|---|---|---|
| `text` | `brat` | teks yang ditampilkan (gak ada batasan panjang) |
| `background` | `#ffffff` | hex warna background |
| `color` | `#000000` | hex warna teks |
| `speed` *(khusus `/vid`)* | `500` | ms jeda tiap kata muncul (200-2000) |
| `hold` *(khusus `/vid`)* | `1200` | ms nahan frame terakhir (0-5000) |

Hit `/` buat liat info & dokumentasi endpoint.

> `/vid` butuh `ffmpeg` terpasang di environment (sudah otomatis di-install lewat Dockerfile).

## CACHE

Request dengan kombinasi parameter yang sama (text/background/color/dst) di-hash pakai SHA256 dan disimpan di folder `/cache`. Request berikutnya dengan parameter identik langsung diambil dari cache (response header `X-Cache: HIT`) tanpa perlu generate ulang. Cache otomatis kadaluarsa setelah 1 bulan (dibersihkan otomatis tiap 6 jam).

## EMOJI FONT

Dockerfile sudah otomatis install [Apple Color Emoji (Linux build)](https://github.com/samuelngs/apple-emoji-ttf) saat build image, supaya emoji di teks brat ke-render dengan benar.
