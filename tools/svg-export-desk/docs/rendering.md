# static-shapes-v1

Accepted UTF-8 XML has an `svg` root in the SVG namespace. Allowed elements are `svg` (root only), `g`, `defs`, `title`, `desc`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `clipPath`, `linearGradient`, `radialGradient`, and `stop`. Allowed presentation/geometry attributes are explicitly enumerated in `src/policy.js`. Unknown elements and attributes fail inspection. Class/id metadata is inert because stylesheets are forbidden. No `use` expansion, raster images, filter effects, masks, markers, pattern paint, CSS, nested SVG viewport, fonts, animation, scripting or external references are supported. DTD/entity declarations and non-XML processing instructions are rejected. No automatic resource fetch occurs.

Paint and clipping references must be a bare `url(#id)` referring to a defined gradient or clipPath of the right type. Duplicate IDs, unresolved references, and nested resource references fail. Geometry and paint interpretation within the subset is delegated to resvg; this is not a complete SVG grammar validator. Malformed geometry that a renderer tolerates may render partially: inspect the PNG. For exact authoring validation, use a dedicated SVG validator.

## Viewport

Positive `viewBox` width/height and finite coordinates are required if a viewBox is present. Explicit root width/height define the viewport even if their ratio differs from viewBox. Missing both dimensions use viewBox dimensions; one missing dimension is inferred using the viewBox ratio. With no viewBox, both dimensions are required. Unitless lengths and px, in, cm, mm, pt and pc are accepted for root dimensions at 96 dpi. Percentages, relative/font units and dimensions exceeding one million CSS pixels are rejected. `preserveAspectRatio` supports `none` and the nine alignments with optional `meet`/`slice`; absence uses SVG's centered meet default. The root viewport clips artwork; this tool exports the viewport, not the painted bounding box.

Requested width is an integer pixel count. Height is `max(1, round(width * intrinsicHeight / intrinsicWidth))`; the PNG header must agree or that variant fails. resvg scales the normalized intrinsic viewport to that width. For nonintegral output heights this introduces normal pixel-grid rounding. Default currentColor is black; callers cannot inherit host-page CSS. Transparent background retains source alpha; solid #RRGGBB is composited behind the source. No color-profile transformations are requested.

## Completion and persistence

Invalid source files remain visible with reasons; they can be selected to receive explicit failed variant records. Output limits are per requested variant, and each variant appears in the manifest even on render failure. Invalid batch envelopes (empty batch, >24 sources, >48 variants, request >9 MiB) fail as a whole before rendering. Individual files are untouched. Source IDs include an index and content hash; filenames additionally include variant index, so duplicate source names and widths cannot collide.

Saved state contains schema version, names, SHA-256 identities, selections, requested widths and background. A fresh reattachment restores only matching hashes. Unmatched bytes get fresh defaults. Export/import carries no source bytes; ZIP packages carry originals separately. Browser settings are scoped to the local origin, including its port.
