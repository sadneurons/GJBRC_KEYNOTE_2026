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

## The forking-paths line

`forks.html` draws Maisie's life line (1840 to 2040) as an inline SVG. Put
`<div class="forks" data-stage="N"></div>` in a slide with class `.forks-slide`;
a fragment `<span class="fragment forks-stage" data-stage="N+1"></span>` grows it
on the next click. Stages: 0 the three women before her, 1 Maisie, 2 the
eleven-plus, 3 Ferranti, 4 the mid-life forks, 5 the GP's twelve minutes,
6 the four women, 7 where they live. Years, labels and branch offsets are the
tables at the top of the script. `tools/shoot_deck.py _site/index.html out/`
screenshots every step of the deck in one headless Chrome.

The deck follows `../KEYNOTE_SCRIPT_15min.md`; slide notes in `.note` divs hold
the figures and placeholders still to verify.
