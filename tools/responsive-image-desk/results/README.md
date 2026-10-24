# Reproducible validation

Verified locally on 2026-10-19 using Node.js 24.20.0, Sharp 0.35.5 and Playwright 1.58.2 / Chromium 145. The sample uses WebP quality 78 and widths 160, 320, 480 and 960 pixels. JPEG fallback quality is 85.

| Observation | Result |
|---|---:|
| Real CC0 source photographs of artworks | 12 |
| Requested variant outcomes (4 widths × 2 formats × 12) | 96 |
| Exported and independently decoded variants | 70 |
| Skipped requests above source width | 26 |
| Processing failures | 0 |
| Encoded output bytes, excluding HTML/manifest | 2,086,911 |
| Real variants larger than their respective source | 0 |
| Fresh viewport/density combinations | 6 |

Every exported file's SHA-256, byte count, format signature and independently decoded dimensions matched its manifest. Aspect ratio differed by at most one pixel from width-based rounding. Each output's downsampled pixels matched its own source more closely than any of the other 11 originals. All original file hashes remained unchanged. These are integrity/correspondence checks, **not** perceived-quality measurements or a general compression benchmark. Total package bytes include many resolutions and formats and must not be presented as a single-image saving.

Seven Node tests passed for configuration validation, invalid/truncated/unsupported input, alpha and duplicate-name output, all EXIF orientations, explicit failed outcomes for mismatched sources, honest size-increase reporting on a tiny synthetic input, and valid two-frame APNG rejection. The APNG control exposed that the library silently reads a static first frame; the application now rejects the animation control chunk before decoding.

The browser suite exercises the real batch workflow, actual WebP comparison, configuration, selection persistence, reload, portable project save/open, missing and corrupt stored sources, same-name wrong-byte rejection, repair by exact-original reimport, export and specimen reopening. A separate decoder test reads all 70 sample outputs with Chromium rather than Sharp. Labeled synthetic browser controls test EXIF 1–8 with asymmetric colored corners, alpha, same-name different originals and small-source skips. Resource-loading checks run fresh contexts at 375, 800 and 1440 CSS pixels with device scale factors 1 and 2. Each currentSrc belonged to the declared candidate set and loaded without remote requests. Nine browser tests passed together after processing/recovery fixes; two subsequent focused checks also passed, verifying every ZIP image hash/byte count and direct local-file opening without remote requests.

The visible screenshot uses WebP quality 67 to demonstrate changing the setting; it therefore has different export bytes from the quality-78 committed sample. Its numbers are actual UI output, not the sample's benchmark result.

Limits: the corpus is museum web-large JPEGs, not original camera RAW/high-resolution photographs. The real corpus has no alpha or unusual EXIF orientation; those cases are explicitly synthetic controls. Browser validation covers Chromium only. Neither the tests nor encoder settings establish subjective visual quality, archival suitability, or color-proof accuracy. Review your actual images at their intended display sizes.

Reproduce with commands in the main README. Test-generated source copies and packages are isolated under `.work/browser-tests/`; they are not publication artifacts.
