# PDF for All

An iLovePDF-style web app with every common PDF tool in one place. Everything runs
**in your browser**: files are never uploaded to a server.

## Tools

| Category | Tools |
| --- | --- |
| Organize | Merge PDF · Split PDF · Remove pages · Extract pages · Organize PDF (reorder, rotate, delete, insert blank pages, combine files) · Scan to PDF (camera) |
| Optimize | Compress PDF (3 levels) · Repair PDF · OCR PDF (searchable text layer, 15+ languages) |
| Convert to PDF | JPG/PNG/WebP to PDF · WORD (.docx) to PDF · POWERPOINT (.pptx) to PDF · EXCEL (.xlsx/.xls/.csv) to PDF · HTML to PDF |
| Convert from PDF | PDF to JPG/PNG (pages or embedded images) · PDF to WORD (editable text or exact layout) · PDF to POWERPOINT · PDF to EXCEL (table detection) · PDF to PDF/A (1b/2b/3b) |
| Edit | Rotate PDF · Add page numbers · Add watermark (text/image, mosaic) · Crop PDF · Edit PDF (text, images, shapes, freehand, highlight, whiteout) |
| Security | Unlock PDF · Protect PDF (AES-256, permissions) · Sign PDF (type/draw/upload signature, initials, date) · Redact PDF (area or text search, flattened permanently) · Compare PDF (text diff + side-by-side) |

Results can be downloaded individually or as a ZIP, and any PDF result can be sent
straight into another tool ("Continue to…").

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build in dist/
npm run preview
```

The build uses relative paths, so `dist/` can be hosted from any static host or sub-path.
`.github/workflows/deploy.yml` publishes it to GitHub Pages on pushes to `main`
(enable Pages with "GitHub Actions" as the source in the repository settings).

## How it works

- [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) – page manipulation, drawing, encryption/decryption, PDF/A
- [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) – rendering and text extraction
- [`tesseract.js`](https://tesseract.projectnaptha.com/) – OCR (English data ships with the app; other languages download on first use)
- `mammoth` (DOCX), `xlsx` (spreadsheets), `jszip` (PPTX parsing), `docx` / `pptxgenjs` (Office output), `html2canvas` (HTML rendering)

Tool definitions live in `src/tools/registry.ts`; processing code is in `src/tools/processors/`.

## Known limitations

Because nothing is sent to a server, a few conversions are approximations compared with a
desktop office suite: Office → PDF output is rendered as page images, PPTX rendering supports
text boxes, pictures and solid fills only, and HTML-from-URL only works for sites that allow
cross-origin requests (save the page and upload the `.html` file otherwise). AI features
(summarize, translate) are not included.
