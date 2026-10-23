# GJBRC Keynote 2026

Quarto reveal.js deck using the GJBRC theme in `_extensions/gjbrc/`.

- Edit `index.qmd`. Slide types and classes are documented in `_extensions/gjbrc/../../gjbrc-revealjs/README.md` (summary: `##` content slide, `#` section slide, `{.comparison}`, `{.team}`, `{.image-copy}`, `{.image-1}`, `{.image-4}`, `{.end}`).
- Preview locally: `quarto preview`
- Render: `quarto render` (output in `_site/`)

## Publishing

Every push to `main` runs `.github/workflows/publish.yml`, which renders the
deck with Quarto and deploys `_site/` to GitHub Pages.

One-time setup on GitHub: repository **Settings > Pages > Source** must be set
to **GitHub Actions**.
