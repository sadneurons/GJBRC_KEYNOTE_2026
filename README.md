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

`mwn/index.html` is a single self-contained file (CSS, JS and SVG inlined) built by
`python3 mwn/build.py` from `index.src.html`, `mwn.css`, `mwn.js` and `mwn.svg`.
Edit the sources and rebuild; only the built file is copied into `_site/`.
Viewpoints are the `VIEWS` table at the top of `mwn.js`.
