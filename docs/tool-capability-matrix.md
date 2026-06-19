# Tool Capability Matrix

Generated from `lib/tool-registry.ts` by `scripts/gen-capability-matrix.mjs`. Do not edit by hand.

- Browsable tools: **100**
- Network-required tools: **3** (every other tool processes locally in the browser)
- Tools with an automated (Playwright) spec: **27**

> Columns derived from source are authoritative. `Cancellable` is `no` for every
> tool today because the processor API does not yet accept an `AbortSignal`
> (tracked as a P1 in `audit-findings.md`). Exact output MIME, memory grade,
> per-tool maturity, and known-loss notes require per-tool runtime verification
> that is **not yet complete for all 100 tools**; those are tracked in the audit
> rather than guessed here.

| Tool ID | Name | Category | Input | Input mode | Processing | Engine | Cancellable | External provider | Automated test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pdf-merge | PDF Merge | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| pdf-split | PDF Split | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-rearrange | PDF Rearrange | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| pdf-rotate | PDF Rotate | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-delete-page | PDF Delete Page | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-add-page-numbers | PDF Page Number | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-watermark | PDF Watermark | pdf | .pdf,.png,.jpg,.jpeg,.webp | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-redact | PDF Redact | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-extract-images | Render PDF Pages | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-compress | Optimize PDF Structure | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-to-png | PDF to PNG | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| pdf-to-jpg | PDF to JPG | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-to-webp | PDF to WEBP | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| image-to-pdf | Image to PDF | pdf | .png,.jpg,.jpeg,.webp,.gif,.tif,.tiff | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-to-word | PDF to Word | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| pdf-to-excel | PDF Text to Workbook | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| word-to-pdf | Word to PDF | pdf | .docx | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| powerpoint-to-pdf | PowerPoint to PDF | pdf | .pptx | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| excel-to-pdf | Excel to PDF | pdf | .xls,.xlsx | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| html-to-pdf | HTML to PDF | pdf | .html,.htm | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| edit-pdf | Edit PDF | pdf | .pdf,.png,.jpg,.jpeg,.webp | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| pdf-sign | Add Visual Signature | pdf | .pdf,.png,.jpg,.jpeg,.webp | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-repair | Rebuild Parseable PDF | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-compare | Compare PDF | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| pdf-to-pdfa | PDF to PDF/A | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | none |
| pdf-to-hwpx | PDF to HWPX | pdf | .pdf | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| hwpx-to-pdf | HWPX to PDF | pdf | .hwpx | file | local | pdf-lib / pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| image-resize | Resize Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | yes (e2e) |
| image-compress | Compress Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-crop | Crop Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | yes (e2e) |
| image-flip | Flip Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-rotate | Rotate Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-pixelate | Pixelate Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-add-text | Add Text to Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-add-border | Add Border | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-split | Image Split | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-combine | Combine Images | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-collage | Collage Maker | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-background-transparent | Remove Solid-Color Background | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-blur-background | Blur Image | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-upscale | High-quality Enlarge | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-watermark | Image Watermark | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-color-palette-extract | Image Color Palette Extract | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| image-auto-enhance | Image Auto Enhance | image | image/* | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| png-jpg | PNG to JPG | image | .png | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| jpg-png | JPG to PNG | image | .jpg,.jpeg | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| png-webp | PNG to WEBP | image | .png | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| webp-png | WEBP to PNG | image | .webp | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| webp-jpg | WEBP to JPG | image | .webp | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| jpg-webp | JPG to WEBP | image | .jpg,.jpeg | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| gif-jpg | GIF First Frame to JPG | image | .gif | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| gif-png | GIF First Frame to PNG | image | .gif | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| tiff-jpg | TIFF to JPG | image | .tif,.tiff | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| tiff-png | TIFF to PNG | image | .tif,.tiff | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| svg-png | SVG to PNG | image | .svg | file | local | Canvas / browser-image-compression | no (tracked: P1 cancellation) | none | none |
| ocr-image-to-text | Image to Text | ocr | image/* | file | local | tesseract.js + pdf.js | no (tracked: P1 cancellation) | none | none |
| ocr-pdf-to-text | PDF to Text | ocr | .pdf | file | local | tesseract.js + pdf.js | no (tracked: P1 cancellation) | none | yes (e2e) |
| mute-video | Mute Video | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| extract-audio | Extract Audio | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| video-compress | Video Compress | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| video-speed-change | Video Speed Change | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| video-trim | Video Trim | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | yes (e2e) |
| video-crop | Video Crop | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | yes (e2e) |
| video-resize | Video Resize | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| video-watermark | Video Watermark | video | video/*,.png,.jpg,.jpeg,.webp | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| video-reverse | Video Reverse | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| video-thumbnail-generator | Video Thumbnail Generator | video | video/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| video-convert | Video Converter | video | .mp4,.webm,.mov,.avi,.m4v,.mkv,.gif | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | yes (e2e) |
| images-to-gif | Images to GIF | video | image/* | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| gif-speed-change | GIF Speed Change | video | .gif | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| gif-reverse | GIF Reverse | video | .gif | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| gif-frame-extract | GIF Frame Extract | video | .gif | file | local | ffmpeg.wasm | no (tracked: P1 cancellation) | none | none |
| audio-convert | Audio Converter | audio | .mp3,.wav,.m4a,.aac,.webm,.mp4,.ogg,.flac | file | local | ffmpeg.wasm / WebAudio | no (tracked: P1 cancellation) | none | yes (e2e) |
| audio-cut | Audio Cutter | audio | .mp3,.wav,.m4a,.aac,.webm,.ogg,.flac | file | local | ffmpeg.wasm / WebAudio | no (tracked: P1 cancellation) | none | yes (e2e) |
| audio-merge | Audio Merge | audio | .mp3,.wav,.m4a,.aac,.webm,.ogg,.flac | file | local | ffmpeg.wasm / WebAudio | no (tracked: P1 cancellation) | none | yes (e2e) |
| audio-fade | Audio Fade In / Fade Out | audio | .mp3,.wav,.m4a,.aac,.webm,.ogg,.flac | file | local | ffmpeg.wasm / WebAudio | no (tracked: P1 cancellation) | none | yes (e2e) |
| audio-speed-change | Audio Speed Change | audio | .mp3,.wav,.m4a,.aac,.webm,.ogg,.flac | file | local | ffmpeg.wasm / WebAudio | no (tracked: P1 cancellation) | none | yes (e2e) |
| audio-pitch-change | Audio Pitch Change | audio | .mp3,.wav,.m4a,.aac,.webm,.ogg,.flac | file | local | ffmpeg.wasm / WebAudio | no (tracked: P1 cancellation) | none | yes (e2e) |
| screen-recorder | Screen Recorder | screen | any | capture | local | MediaRecorder / getDisplayMedia | no (tracked: P1 cancellation) | none | yes (e2e) |
| screen-audio-recorder | Screen + Audio Recorder | screen | any | capture | local | MediaRecorder / getDisplayMedia | no (tracked: P1 cancellation) | none | none |
| screen-mic-recorder | Screen + Mic Recorder | screen | any | capture | local | MediaRecorder / getDisplayMedia | no (tracked: P1 cancellation) | none | none |
| screen-camera-recorder | Screen + Camera Recorder | screen | any | capture | local | MediaRecorder / getDisplayMedia | no (tracked: P1 cancellation) | none | none |
| webcam-recorder | Webcam Recorder | screen | any | capture | local | MediaRecorder / getDisplayMedia | no (tracked: P1 cancellation) | none | none |
| audio-recorder | Audio Recorder | audio | any | capture | local | ffmpeg.wasm / WebAudio | no (tracked: P1 cancellation) | none | yes (e2e) |
| screenshot-capture | Screenshot Capture | screen | any | capture | local | MediaRecorder / getDisplayMedia | no (tracked: P1 cancellation) | none | yes (e2e) |
| csv-json | CSV to JSON | file | .csv | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| json-csv | JSON to CSV | file | .json | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| excel-csv | Excel to CSV | file | .xls,.xlsx | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| csv-excel | CSV to Excel | file | .csv | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| xml-json | XML to JSON | file | .xml | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| json-xml | JSON to XML | file | .json | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| xml-csv | XML to CSV | file | .xml | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| split-csv | Split CSV | file | .csv | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| create-zip | Create ZIP | file | any | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| extract-zip | Extract ZIP | file | .zip | file | local | papaparse / jszip | no (tracked: P1 cancellation) | none | none |
| qr-generator | QR Code Generator | web | any | url | local | external provider (fetch) | no (tracked: P1 cancellation) | none | none |
| url-image | Webpage to Image | web | any | url | network-required | external provider (fetch) | no (tracked: P1 cancellation) | Microlink, thum.io, images.weserv.nl | yes (e2e) |
| url-pdf | URL Full Page to PDF | web | any | url | network-required | external provider (fetch) | no (tracked: P1 cancellation) | Microlink, thum.io, images.weserv.nl | none |
| detect-cms | Detect CMS | web | any | url | network-required | external provider (fetch) | no (tracked: P1 cancellation) | r.jina.ai (CORS mirror fallback) | yes (e2e) |
| image-metadata | Image Metadata Viewer | web | image/* | file | local | external provider (fetch) | no (tracked: P1 cancellation) | none | none |
