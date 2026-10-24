# Sample artwork and reproducibility

The sample is **explosion**, by **Cuzco**, published December 2, 2010 on
[OpenGameArt](https://opengameart.org/content/explosion), offered there under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The source page was checked on October 22, 2026. Its Author field identifies
Cuzco and its License(s) field links CC0. The author describes customizing
output from Cliff Harris's Explosion Generator in Photoshop. This is existing,
authored artwork, not a newly generated test sequence or a novelty claim.

The source is a **sprite sheet**, not sixteen independent upstream PNGs.
`scripts/sample.mjs` extracts sixteen 64×64 tiles from a 256×256 PNG, left to
right then top to bottom. The source page describes sixteen 64×64 images.
The PNG attachment supplies transparency. No interpolation or extra frames
are introduced. The demo's timing is our choice: 80 ms per frame, with a
500 ms final hold; it is not claimed to be an upstream timing specification.

The upstream site offers no immutable revision URL. We pin the downloaded
bytes by SHA-256, not merely a mutable URL. `samples/provenance.json` records
the source URL, digest, extraction rectangles, per-file hashes and exact
extractor versions. `samples/source/license-evidence.json` retains the relevant
license fields and digest of the fetched page (not its user comments).

Reacquire without overwriting the pinned source until its hash matches:

```sh
curl -fL https://opengameart.org/sites/default/files/exp2_0.png -o /tmp/exp2_0.png
printf '%s  %s\n' f4144fb0839d070a608d44c1a12a4e62529a158386ec2db29921608c06fd7cdb /tmp/exp2_0.png | sha256sum -c -
cp /tmp/exp2_0.png samples/source/exp2_0.png
npm ci
npm run sample
npm test
```

If the digest changes, stop and inspect the upstream change. Do not update the
pinned digest silently. Runtime dependency versions are pinned in the lockfile.
Extraction can depend on platform-specific codec versions; the test explicitly
checks the committed sample's byte reproducibility in the current environment.
