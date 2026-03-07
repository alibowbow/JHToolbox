# JH Toolbox

Browser-only utility tools for PDF, image, video, audio, OCR, data, and web workflows.

## Features

- Client-side processing for uploads, conversions, extraction, and export
- No server upload pipeline
- WebAssembly-backed tools where needed, including `ffmpeg.wasm`
- Static export support via `next.config.mjs` with `output: "export"`
- Responsive UI for desktop and mobile
- Drag-and-drop uploads with local processing and instant download

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Lucide Icons
- Framer Motion
- `pdf-lib` / `pdfjs-dist`
- `browser-image-compression` / `pica` / `fabric`
- `tesseract.js`
- `@ffmpeg/ffmpeg`
- `jszip` / `papaparse` / `xlsx` / `fast-xml-parser`
- `html2canvas` / `qrcode`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The static export output is written to `out/`.

## Deployment Targets

- Vercel
- Netlify
- Cloudflare Pages
- Firebase Hosting

## Routes

- `/`
- `/tools`
- `/tools/pdf`
- `/tools/image`
- `/tools/ocr`
- `/tools/video`
- `/tools/audio`
- `/tools/file`
- `/tools/web`

## Notes

- Some web-based tools such as URL capture or CMS detection can still be constrained by browser CORS rules.
- OCR and FFmpeg tools may take longer on first run because browser assets and WASM bundles need to load.
