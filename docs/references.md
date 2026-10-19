# Implementation references

This is an integration tool, not a novel compression method. Documentation and existing work were inspected on 2026-10-19.

- [Squoosh, GoogleChromeLabs](https://github.com/GoogleChromeLabs/squoosh): an existing interactive image compression application with multiple codecs. Image Desk uses established processing libraries and focuses on a local batch workflow, reconnectable source identities, complete output accounting and responsive packages. No comparative speed or quality advantage is claimed.
- [Sharp autoOrient](https://sharp.pixelplumbing.com/api-operation/#autoorient): apply EXIF rotations and mirroring before resize. Our source records preserve the observed orientation; outputs strip the orientation tag.
- [Sharp resize](https://sharp.pixelplumbing.com/api-resize/): width-only resizing preserves aspect ratio; `withoutEnlargement` adds protection. We explicitly skip requests above oriented source width so the manifest records the decision.
- [Sharp output options](https://sharp.pixelplumbing.com/api-output/): WebP quality controls encoder settings, and the default output pipeline removes metadata and converts to sRGB. JPEG fallback uses an explicitly chosen quality of 85, independent of WebP quality; these settings are not equivalent perceptual scales.
- [WHATWG responsive images](https://html.spec.whatwg.org/dev/images.html): width descriptors identify intrinsic candidate widths, while `sizes` describes layout width. We emit both WebP source candidates and fallback image candidates, and test allowed browser choices under fresh caches at different densities.
- [Pillow ImageOps](https://pillow.readthedocs.io/en/stable/reference/ImageOps.html) and [image format documentation](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html) were also inspected during engine selection. Pillow is not a runtime dependency; Sharp was chosen to keep application and image processing in one Node installation.
- [Met Open Access policy](https://www.metmuseum.org/policies/image-resources) and the [Met Collection API](https://metmuseum.github.io/): acquisition uses public object records and public-domain image URLs. Each source has its own saved API evidence; the acquisition script checks `isPublicDomain` before initial inclusion and pinned hashes thereafter.

The HTML specimen makes no remote resource requests. Its source links expose provenance when deliberately followed. Publishing a package or clearing rights for private uploads remains the user's separate decision.
