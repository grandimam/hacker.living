# README animation

`docs/assets/pipeline.gif` is a 8-second, 960 × 528 looping illustration of the pipeline. Its cards are schematic examples, not quotations or measured processing times. Codex is the active extraction/research runtime; Claude is labeled as an optional classification adapter. The live website serves saved results; the animation does not imply continuous ingestion.

The still alternative is `docs/assets/pipeline-poster.png`. Both retain source attribution and draft status. The GIF is embedded as a normal repository image, with alt text and a still-image link. GIFs cannot respond to a reduced-motion preference; use the still image for a motion-free view.

## Regenerate

With Python 3 and Pillow installed:

```sh
python3 scripts/render-readme.py
```

The renderer uses Arial/Georgia on macOS or DejaVu Sans/Serif on Linux. It writes the GIF, the still alternative, and a local three-frame review sheet (`pipeline-preview.png`). The review sheet is not required in the repository. No network calls or model credentials are needed to render the assets.
