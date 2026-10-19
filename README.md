# Contact Sheet Desk

A local image-selection workbench: import a folder, inspect thumbnails, select and order images, and export printable contact sheets with an auditable source manifest.

## Launch

Install Node.js 22 or newer, then run:

```sh
./launch.sh
```

Open **http://127.0.0.1:4317**. The first launch installs locked npm dependencies (network required); subsequent launches and all image work are local. Set `PORT` if needed; browser recovery is scoped to the host and port.

Click **Try 24 real artworks** for the bundled public-domain Met collection, or **Import folder** for your own images. Import replaces the collection. Uncheck exclusions, move selected images with arrows or position numbers, and configure paper/grid/labels. **Export PDF + manifest** presents separate download links for both artifacts. **Save project** downloads the original image bytes, names, hashes, selection, order and settings as JSON. **Open project** validates and restores it. IndexedDB also recovers the workspace after reload; save a project backup to protect against browser storage eviction.

[Visible workbench](results/workbench.png) · [A4 example](results/demo-A4.pdf) · [Letter example](results/demo-Letter.pdf) · [A4 manifest](results/demo-A4.json) · [Quick guide and limits](public/help.html)

## Supported behavior and limits

- JPEG, PNG, still WebP/GIF, single-page TIFF; inspected by content. Animations, multipage images, SVG, RAW, HEIC and corrupt images are rejected with reasons.
- EXIF orientations 1–8 are applied before layout. Aspect ratios are preserved; images are fitted, never cropped. Transparent pixels are flattened onto white. Sharp/libvips converts to sRGB; this is not a calibrated color-proofing workflow.
- 100 discovered files, 10 MiB per file, 50 MiB total source bytes, 40 million decoded pixels per image. Over-limit collections are refused before replacing the workspace; individual rejected files remain in accounting. Browser pickers may omit inaccessible/hidden files; accounting covers only what they expose.
- Previews/PDF images fit within 1600×1600 pixels and use lossy JPEG quality 90 with 4:4:4 chroma sampling. Portable projects retain unchanged original bytes for accepted files. Rejected inputs retain names/reasons and hashes when read, not their source bytes.
- A4 and Letter, 2–4 columns, 3–5 rows, row-major pagination. 8pt filename labels wrap up to three lines; truncation uses `...`. A unique source ID and hash prefix distinguish duplicate/long names. Full filenames and hashes remain in the manifest. For reliable glyph output, non-ASCII/control characters print as `[U+XXXX]` escapes; the browser/manifest retain original text.
- All imported inputs appear as included, excluded or rejected with a reason in the export manifest. Source IDs are stable within a project (new folder import creates a new project). Full relative paths and SHA-256 hashes identify sources independently of IDs.
- Server listens on loopback, rejects remote Host/cross-origin requests, accepts only browser-submitted bytes, and does not modify source files. Browser data stays in the local origin. No runtime network services or accounts.
- Print PDF at actual size / 100%. Physical printing has **not** been performed. Browser automation covers Chromium on Linux, not every browser or printer. Large projects can consume substantial memory; this is a bounded desktop tool.

## Real demo and reproduction

`demo/images/` contains 24 real works from The Metropolitan Museum of Art's [Open Access collection](https://www.metmuseum.org/hubs/open-access), selected from object IDs starting at 436500. Every retained API record reports `isPublicDomain: true`. `demo/provenance.json` preserves full API records, source URLs, retrieval time, byte lengths and SHA-256 hashes. Images/data are supplied under the museum's CC0 policy. The bundled files are unmodified lower-resolution images returned by the API.

```sh
npm run demo:fetch
```

This verifies existing bytes or downloads missing files from the recorded URLs and checks hashes. It fails if an upstream image changed. The initial selection logic is retained in the script; no account is required. See the [Met API documentation](https://metmuseum.github.io/). Code is MIT licensed; image provenance and font license are separate.

Contact-sheet generation is established; [ImageMagick montage](https://imagemagick.org/script/montage.php) already supports filename-labeled grids. This project adds an interactive local selection/order/recovery workflow and an inspectable PDF/source mapping; no novelty claim is made.

## Verification

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm run verify:pdf
```

If Chromium is installed in a custom directory, set `PLAYWRIGHT_BROWSERS_PATH` for both installation and the browser test. Browser tests start/stop their own ephemeral loopback server; they do not touch your normal saved workspace. They import all 24 real files with the folder picker, exclude one, reorder, reload, export/import the portable project, and download 3-page A4/Letter PDFs. They also exercise explicitly controlled orientation, transparency, animation and filename fixtures. Generated test projects stay ignored under `results/browser/`.

PDF.js independently parses/renders the exports, counts image operations, checks page dimensions, extracted labels and their bounds, verifies manifest order/coverage, and compares every rendered image region against its selected source. EXIF corner placement is separately tested against explicit expectations for all eight orientations. Test inputs are hashed before/after to check source preservation. The artifacts in `results/` are reproducible technical evidence; generated fixture images are clearly synthetic edge cases, not a substitute for the real-image workflow.
