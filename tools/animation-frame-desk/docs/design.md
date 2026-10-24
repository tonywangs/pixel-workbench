# Format and existing work

This is a small local frame assembler, not a new animation technique.
[Aseprite's animation documentation](https://www.aseprite.org/docs/animation/)
already describes timeline ordering, duplication, per-frame duration, and
preview. [GIMP's animation tutorial](https://www.gimp.org/tutorials/Simple_Animations/)
is another established frame/layer workflow. These tools have much broader
editing capabilities. This desk focuses on assembling existing files, retaining
original bytes and occurrence identity, and checking the exported timeline.
Primary references inspected October 22, 2026.

The encoder follows the [WebP RIFF container specification](https://developers.google.com/speed/webp/docs/riff_container):
VP8X advertises animation and alpha, ANIM records loop count, and each ANMF
contains one full-canvas lossless VP8L image. Positions are zero; no-blend replaces
the complete canvas, including transparent clears. Durations are integer
milliseconds. Zero loop count means infinite playback; positive values count
total plays. A full-canvas encoder is intentionally less compact than an encoder
that minimizes rectangles or merges duplicate frames.

Canvas dimensions are the maximum oriented width and height. Every source is
placed at top left with transparent padding; there is no scaling. EXIF orientation
is applied once. Embedded color profiles are converted to sRGB; untagged inputs
are assumed sRGB. Only 8-bit RGB/grayscale single-frame PNG and JPEG are accepted.
The normalized representation is straight RGBA. RGB channels underneath zero
alpha are canonicalized to zero. Original source bytes and metadata remain
unchanged inside portable projects; exported pixels have no source metadata.
Lossless means lossless **normalized pixels**, not recovery of original JPEG
compression or pre-conversion color values.

Each occurrence has its own ID even when its source SHA-256 matches another
occurrence. Portable projects embed originals; reference projects need exact-hash
reconnection. Reload uses IndexedDB in the same origin and browser profile.
Undo retains twenty edits in memory, not across restart. Failed imports are
atomic; failed exports show an error and expose no successful download set.

The independent checker uses Pillow to decode WebP and originals, apply EXIF
orientation, convert embedded profiles, and pad the common canvas. It does not
import the exporter or sharp. It checks original and output hashes, independent
source appearance, dimensions, occurrence IDs, ordered piecewise-constant pixel
timelines, total duration and loop count. PNG pixels must match exactly; JPEG RGB
allows at most three levels of decoder rounding per channel (alpha remains exact).
This bounded JPEG tolerance is not a guarantee for every profile. A mismatch
fails verification explicitly. Decoded WebP pixels must also match the export
manifest's exact normalized hashes. Chromium WebCodecs separately checks that the
output decodes with matching dimensions and temporal order. Chromium can round
semi-transparent RGB through premultiplication; its raw hashes are therefore not
the oracle for exact straight-alpha pixels.

An independent RIFF parser reads encoded durations because browsers may clamp
very short frames. Decoder timestamps are checked for contiguous temporal order;
the exact encoded durations drive timeline comparison. Consecutive identical
frames may be merged by other encoders without failing the comparison. The
checker and exporter can share underlying libwebp algorithms through their
respective platforms; this is independent integration/checking code, not a
claim of a clean-room WebP codec. Browser preview uses requestAnimationFrame and
may skip frames; hiding the tab pauses it. The saved file's timing is independent
of preview scheduling.
