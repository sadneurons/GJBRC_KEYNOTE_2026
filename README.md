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

## The stage: one drawing behind every slide

`timeline.yml` holds two lines on one axis, 1946 to 2045. The machine's line starts with the
Baby in 1948 and carries three strands: Jefferson, Turing and, from 2015, the Manchester Brain
Health Centre. Maisie's line starts the same day and forks. The `timeline-stage` extension
draws the file once behind every slide and animates between slides. Each slide says where the
story has got to on its heading:

```
## 1960: the eleven-plus {.stage view="1955-1970" grow="1964.8" now="1960" lit="maisie"}
```

- `view` is the years shown, `grow` how far the lines are drawn, `now` the moment the slide is
  about, and `lit` what is lit; everything else becomes a ghost without labels. The heading text
  is not shown: it names the slide in the outline and the URL.
- `::: {.caption}` is the words, top left; a bold lead-in is set as the date. `::: {.plate}` is
  the picture or document, in a column on the right. `::: {.cover}` is something large over a
  dimmed stage (`dim="true"`).
- The Centre's points, 2015 to 2026, came from the Roche Dublin deck. Each has a short label on
  the line and its full text, date and pictures in `timeline.yml`; clicking a point opens them,
  and a ring marks the points with pictures. The pictures are in `images/bhc/`.
- The stage slides use the theme's dark slide: colours and fonts are the `--stage-*` variables
  in `_extensions/gjbrc/gjbrc.template.scss`.

The full reference for the timeline file and the slide attributes is `../timeline-stage/README.md`.
`python3 tools/shoot_deck.py _site/index.html out/` screenshots every slide in one headless
Chromium. The earlier slide-by-slide deck is on the `deck-v1` branch.
