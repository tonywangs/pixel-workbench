# Animation Frame Desk

Assemble local PNG/JPEG frames, adjust their order and timing, preview playback,
and export a lossless animated WebP with a standalone viewer and an audit manifest.
Original files stay unchanged. No account or external service is needed.

## Launch

Install Node.js 22 or newer, then run this from the checkout:

```sh
npm start
```

The launcher installs pinned runtime dependencies if missing (network needed on
first launch), then serves **http://127.0.0.1:4317**. Open that address in a modern
desktop browser. Stop with Ctrl+C. After dependency installation, normal use and
the included sample work offline. Tested with Chromium 141 on Linux; other
browsers and operating systems are not yet validated. Node/sharp must support
your platform. This is a local desktop service, not a hosted multi-user app.

## Try the complete workflow

1. Click **Load real artwork demo**, or **Import frames** and select the sixteen
   PNGs in `samples/frames`. The demo is [Cuzco's CC0 explosion](docs/artwork.md),
   explicitly extracted from a 4×4 sprite sheet.
2. Inspect thumbnails. Use arrows to order occurrences, Copy to duplicate, × to
   remove, and Undo to restore. Set each duration in milliseconds and Total plays
   (0 forever, 1 once, up to 65535). Play starts at frame one; Pause stops; arrows step.
3. Reload to recover the same sequence, identities, durations, and originals.
   **Save portable project** is the durable backup; **Open project** restores it.
   **Save source references** omits original bytes; reopen and **Reconnect
   originals** using exact matching files. Renamed files are accepted by hash;
   different bytes are rejected. Identical-content occurrences remain distinct.
4. Click **Export lossless WebP + specimen + manifest**, then download **all three**
   links. `animation.webp` is the playable animation, `playback.html` is an embedded
   viewer you can open directly from disk, and `manifest.json` records the ordered
   occurrences, source hashes, transformations, timing, encoder versions and
   output hashes. Export completion means encoded, not independently verified.
5. Open the downloaded `playback.html` in a separate browser window. For exact
   pixel/timeline validation, save the portable project too and run the verifier below.

The committed [sample viewer](samples/playback.html) opens directly from disk,
and [sample WebP](samples/animation.webp) is also playable. The editor footer
links to the sample viewer. [Executed browser screenshot](results/browser-workflow.png)
shows the real workflow. [Policies and checker design](docs/design.md) explain
normalization and timing; [artwork provenance](samples/provenance.json) records inputs.

## Verification

Developer checks need Playwright Chromium and Python 3 with Pillow 12.0.0:

```sh
npm ci
PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright npx playwright install chromium
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-check.txt
npm test
npm run test:browser
```

On Linux, Chromium also needs its system shared libraries; Playwright reports
missing ones explicitly. The Python venv command requires your system's venv/pip
support. Windows users can set `PYTHON` to their environment's Python executable
and `PLAYWRIGHT_BROWSERS_PATH` to the browser installation path.

To check an export while `npm start` is running in another terminal:

```sh
npm run verify -- /path/to/animation-project.json /path/to/animation.webp /path/to/manifest.json /path/to/playback.html
```

Without arguments, `npm run verify` checks the committed sample. Pillow separately
decodes originals and WebP, applies orientation and padding, and compares displayed
timelines. PNG comparisons are exact; JPEG normalization permits at most three
RGB levels of decoder rounding. Chromium separately opens/decodes the animation;
a standalone RIFF parser checks encoded milliseconds and loop metadata. A
nonzero exit means verification failed. See `results/browser-verification.json`
for actual real-artwork execution evidence, and `results/tests.log` for test output.
Tests use separate browser profiles and do not alter your normal saved project.

## Limits

- 120 occurrences; 2048 pixels per side; 32 million total canvas pixels; 8 MiB per
  source; 24 MiB unique originals; 36 MiB request/project file. Durations are
  integers from 1 to 60000 ms. Inputs outside limits fail explicitly.
- Single-frame, 8-bit RGB/grayscale PNG and JPEG only. Animated input, CMYK,
  high-bit-depth images and unsupported formats are rejected. No drawing,
  cropping, audio, GIF export, or sprite-sheet importer (the sample extraction
  script is separate).
- Maximum oriented dimensions determine the transparent canvas; top-left padding,
  no scaling. EXIF orientation applies once; profiles convert to sRGB. Transparent
  RGB is zeroed. Export metadata is stripped; original source bytes are retained.
- Browser preview and image viewers may skip or clamp short frames. Encoded
  timing remains exact. WebCodecs may round semi-transparent RGB internally;
  Pillow performs the exact exported-pixel check.
- Use one editor tab at a time. Autosave depends on browser storage quota and the
  same origin/profile; clearing site data removes it. Undo lasts twenty edits in
  the current session. Save a portable backup before closing or changing ports.
- Large projects require several in-memory copies and may use hundreds of MiB.
  Resource limits bound pixels, not peak process memory. Only one image operation
  runs at a time. The local server must stay running for import, recovery and export.
- The manifest is separate; it does not hash itself. Failed export exposes no
  partial download set. Downloading only one of the three links is incomplete.
