# GJBRC Keynote 2026

Quarto reveal.js deck using the GJBRC theme in `_extensions/gjbrc/`.

- Edit `index.qmd`. Slide types and classes are documented in `_extensions/gjbrc/../../gjbrc-revealjs/README.md` (summary: `##` content slide, `#` section slide, `{.comparison}`, `{.team}`, `{.image-copy}`, `{.image-1}`, `{.image-4}`, `{.end}`).
- Preview locally: `quarto preview` (use this rather than double-clicking `_site/index.html`: a sandboxed browser opened via the document portal sees only that one file, not the reveal.js libraries or the diagram widget)
- Render: `quarto render` (output in `_site/`)

## Publishing

Every push to `main` runs `.github/workflows/publish.yml`, which renders the
deck with Quarto and deploys `_site/` to GitHub Pages.

One-time setup on GitHub: repository **Settings > Pages > Source** must be set
to **GitHub Actions**.

## Mental Capital diagram widget

`mwn/index.html` is a single self-contained file built by `python3 mwn/build.py` from
`index.src.html`, `mwn.css`, `mwn.js` and `mwn.png` (a 300 dpi render of the Foresight PDF,
made with `pdftoppm -r 300`). A bitmap is used deliberately: vector conversions of this PDF
render blank in Firefox and most non-Chrome viewers.
Edit the sources and rebuild; only the built file is copied into `_site/`.
Viewpoints are the `VIEWS` table at the top of `mwn.js`.

## The stage: one diagram behind every slide

`stage.html` draws two lines on one axis, 1946 to 2045: the machine's line (the Baby,
1948, with Jefferson's and Turing's strands) and Maisie's line (9 June 1949), which forks
into four women. Their crossings (June 1949, Ferranti 1965, the clinic 2026) are drawn as
gold ties between the lines. The stage sits behind every slide and animates between
states; each slide declares its state on the heading:

```
## Title {.on-stage data-stage="4" data-machine="7" data-view="1946-1975" data-lit="x1965,b77"}
```

- `data-stage` 0..8: Maisie's line (born, to 1960, fork 1960, fork 1965, mid-life forks,
  fork 2026, endpoints, places). `data-machine` 0..8: the machine's line.
- `data-view="y0-y1"` zooms time; the vertical layout never changes.
- `data-lit` lights branches (`b68 b77 b84 b91`) and crossings (`x1949 x1965 x2026`);
  everything else dims. `data-dim="1"` fades the whole stage behind a large panel.
- Overlays: `<div class="pin below|above|mid [wide] [left|right]" data-year="1965">` is
  pinned to a year; `<div class="cover [dark]">` is a large panel. Do not name a class
  `callout`: Quarto rewrites those.

All years, labels and branch offsets are the tables at the top of `stage.html`.
`tools/shoot_deck.py _site/index.html out/` screenshots every slide in one headless Chrome.
The previous slide-by-slide deck is on the `deck-v1` branch.
