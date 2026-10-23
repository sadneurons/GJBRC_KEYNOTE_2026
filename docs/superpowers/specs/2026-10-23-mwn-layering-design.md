# Mental Capital diagram: layered build-up for the GJBRC Keynote 2026

Date: 2026-10-23. Status: draft for builder check.

## Intent

The keynote uses the Foresight "Mental Capital through life" diagram (Government
Office for Science, 2008; Crown copyright, OGL). Shown whole it is overwhelming.
The talk needs to build it up piece by piece so the audience sees it assemble,
and needs to light up parts of it by theme while the speaker talks about the
science underneath. Two independent ways of slicing the same diagram are
required:

- **by life stage**: prenatal and early childhood, child, adolescent, adult,
  older adult, plus elements that span the whole life course;
- **by domain**: twelve themes of the underlying science (listed below), each
  linked to the specific Foresight science reviews that underpin it.

The narrative of the talk is being written separately and must not be shaped by
the graphic. The widget therefore exposes the layers as data and leaves the
sequence of reveals entirely to the slides.

## Goals

1. From a slide, show any subset of the diagram's components, additively, in
   any order, with the unshown remainder either hidden or dimmed.
2. Two tag axes on every component, life stage and domain, so a slide can
   build along either axis with one fragment per layer.
3. Every domain layer carries an evidence note: the Foresight reviews behind it
   (codes, titles, local file names) and a one-line claim, editable as plain
   data.
4. Pixel fidelity to the original artwork: every layer is rendered from the
   real PDF, never redrawn.
5. Works in Firefox and Chrome, from a served site (GitHub Pages, quarto
   preview) and from a single file opened from disk.
6. Everything that defines the layering lives in a few editable files, so the
   speaker can retag a component or reword an evidence note without touching
   code.

## Non-goals

- Redrawing the diagram as native SVG with real text. The PDF's text becomes
  outlines in every converter and the layering does not need it.
- Hotspot commentary panels and click-to-navigate (that is "step 2", after the
  narrative exists). This design only has to make that step easy: the
  component list and its tags are the hotspot list.
- Animating individual arrows or figures.
- Supporting Internet Explorer or print.

## Anti-goals (what would make this a failure)

- A build-up that looks like a jigsaw: visible seams where a soft wash is cut
  by a region boundary. Washes must be handled so partial states look designed.
- A layer whose visible pieces don't match its name because a primitive was
  assigned to the wrong region. Mis-tagging must be cheap to spot and fix.
- A slide author having to know coordinates. Slides refer to layers by name.
- Regressing the pan/zoom widget or the Firefox fix.

## Constraints

- Source: `/home/tenebris/Desktop/Keynote/assets/MWN graphic.pdf` (A3, 1190.55
  x 841.89 pt). Its page content, already analysed, is: 144 Form XObjects
  (`/Fm0`..`/Fm143`, each a shaded object: background washes, node ovals,
  arrows, band labels); text drawn as positioned runs (`BT`..`ET`, absolute `Tm`
  plus relative `TD`/`Td`); a few direct paths (lifelong-learning arrow,
  timeline, chart). Nothing is grouped semantically and there are no optional
  content layers. Components must therefore be defined spatially.
- Toolchain available and already used: Python 3 with `pypdf` and Pillow,
  `pdftocairo` (renders with `-transp`), `mutool`, `pdftoppm`, Quarto 1.8,
  reveal.js via the `gjbrc-revealjs` format. No `pikepdf`, no PyMuPDF.
- Vector conversions of this PDF (pdftocairo SVG, Inkscape) render blank in
  Firefox; the widget currently uses a 300 dpi raster. Layers must be rasters
  too.
- The widget (`mwn/`) is a single self-contained HTML file built by
  `mwn/build.py`, embedded in the deck by iframe and driven by `postMessage`
  from reveal fragments via `mwn-bridge.html`. Keep that architecture.
- Sandboxed Flatpak Firefox is the speaker's browser; it can only read a
  single file via the document portal. The built file must remain
  self-contained.
- Do not launch Firefox for testing. Headless Chrome, one instance at a time,
  and librsvg for static checks.
- Size budget: the built `index.html` should stay under about 12 MB. Thirty to
  fifty transparent PNG layers at 300 dpi will not fit uncompressed; see
  "Rendering" for the chosen approach.

## The design

### Components and regions

A **component** is a named rectangle (or union of rectangles) in PDF point
coordinates, with tags. Components are the unit of reveal. They are defined in
`mwn/components.json`:

```json
{
  "id": "adult-stress",
  "label": "Stress (adult)",
  "rects": [[655, 160, 120, 90]],
  "stage": "adult",
  "domains": ["stress-resilience"],
  "crosscut": false
}
```

Rectangles are `[x, y, w, h]` with the PDF's origin convention converted to
top-left (same convention as the widget's `VIEWS` table). A component may list
several rectangles. The widget's existing `VIEWS` table is folded into the same
file as named viewpoints.

Each primitive in the PDF is assigned to **exactly one** component: the first
component in file order whose rectangle contains the primitive's anchor point.
Anchors: a form's bounding box centre; a text run's first glyph origin; a path's
bounding box centre. Primitives whose anchor falls in no component go to a
catch-all component `uncategorised`, which the build reports loudly so the list
can be fixed. Order in the file therefore matters and is a deliberate editing
tool: a small specific region listed before a large general one wins.

Deciding the component list is the builder's job, but it must satisfy these
rules, derived from the diagram:

- Every labelled node or text cluster in the diagram is its own component
  (expect 45 to 70 components). Examples: "Early home experiences", "Disposition
  to learn", "Executive function", "Stress", "Cognitive resilience and coping
  skills", "Cognitive reserve", "Waste of Mental Capital", "Chronic
  inflammation", the figures group for each life stage, the "Technological
  interventions" list.
- The five band labels (Environments, Culture, Mental Capital, People, Biology)
  and the life-course strip (School / Work / Retirement bar, stage boxes,
  Acquisition / Maintenance / Decline) are cross-cutting components.
- The large background washes (full-width band tints) are cross-cutting
  components, one per band. The lifelong-learning arrow and the nutrition /
  sleep / exercise wave are cross-cutting components of their own.

### Tags

- `stage`: one of `prenatal`, `child`, `adolescent`, `adult`, `older`,
  `lifecourse` (spans all). The vertical column boundaries follow the stage
  boxes at the bottom of the diagram.
- `domains`: one or more of the twelve domain ids below. Most components have
  one; a few legitimately have two (for example "Social exclusion" is both
  `mental-health` and `social`).

The twelve domains, with the Foresight science reviews each links to (codes as
in `references/foresight/INDEX.md`):

| id | label | reviews |
| --- | --- | --- |
| `early-development` | Early development and parenting | SR-D8, SR-D13, SR-B4, SR-E17 |
| `learning` | Learning and education | SR-A2, A3, A4, A5, A7, A9, A10, A11, SR-E1 |
| `adolescent-brain` | Adolescent brain, reward and impulsivity | SR-E2, E5, E6, E8, E15 |
| `stress-resilience` | Stress and resilience | SR-E7, E16, E20, SR-C1, C6 |
| `inflammation-physical` | Inflammation, nutrition and physical health | SR-E17, E18, E24, SR-B2 |
| `mental-health` | Mental health and mood | SR-B3, B9, B15, SR-E12, E21, SR-D15 |
| `social` | Social relationships and support | SR-A11, SR-E15, SR-X2 |
| `work` | Work | SR-C1 to C11 |
| `cognitive-ageing` | Cognitive ageing and reserve | SR-E4, E11, E14, E22, SR-B12 |
| `environment-ses` | Environment and socioeconomic gradient | SR-E27, DR-2, SR-X5, SR-B13 |
| `interventions` | Interventions and technology | SR-E9, E10, E22, E25, E29 |
| `genetics` | Genetics and bioscience | SR-B1, B12, SR-D7 |

Domains live in `mwn/domains.json` with id, label, colour (for the eventual
hotspot layer; use the GJBRC palette plus a muted set), the review codes, and
an `evidence` string of one or two sentences, initially a neutral summary of
what the listed reviews cover, for the speaker to rewrite.

### Rendering

Build step `mwn/build_layers.py`:

1. Parse the page content stream (the eight content streams concatenated, as
   already done in the analysis) into a list of primitives with anchors:
   - each `q .. /FmN Do .. Q` group is one primitive; its anchor is the centre
     of the form's `/BBox` transformed by the group's `cm` and the form's
     `/Matrix`;
   - each text run is one primitive, split at every `Tm`, `TD`, `Td`, `T*`
     and `'`/`"` so every run has a computable origin (track the text matrix);
     a run is emitted as its own `BT .. ET` block carrying the current font,
     size, colour and graphics state;
   - each direct path (`m/l/c .. re .. f/S/B`) is one primitive, anchored at
     its bounding box centre.
2. Assign each primitive to a component (rule above). Write
   `mwn/assignments.json` and print a report: component id, primitive count,
   and the text of any text runs, so mis-tagging is visible by reading.
3. For each component, write a one-page PDF containing only its primitives
   (page clip and graphics state preserved, as in the analysis scripts) and
   render it with `pdftocairo -png -transp -r 300` to a transparent PNG.
   Crop each PNG to its non-transparent bounding box and record the offset,
   so most layers are small.
4. Emit `mwn/layers/<id>.png` and `mwn/layers.json` with, per component:
   id, label, stage, domains, crop offset and size in PDF points, and the
   image dimensions.
5. Sanity render: composite every layer at its offset over white and diff
   against the full-page 300 dpi render. Report the fraction of pixels that
   differ by more than a small threshold. Expect near zero; a large number
   means a primitive was lost. Fail the build above 0.5 %.

`mwn/build.py` then inlines the layers (base64 PNG) into the single HTML file
alongside `components.json` and `domains.json`. The current full-page raster is
kept as the "whole" fallback image.

Budget: 300 dpi crops of 50 components sum to roughly the full page's pixel
count plus overlap; at PNG compression ratios seen so far (2.5 MB for the full
page) expect 3 to 5 MB of layers, 4 to 7 MB base64. Inside budget. If it isn't,
the builder may drop layer resolution to 200 dpi before anything else.

### Widget behaviour

The widget replaces its single `<image>` with a stack: one `<image>` per layer
inside the same `viewBox`-wrapped SVG, positioned by its crop offset. The
existing pan/zoom, viewpoints and postMessage API are unchanged. New API:

- `{ type: 'mwn:show', components: [...ids], mode: 'hide' | 'dim' }` sets the
  visible set exactly. Unlisted components are hidden (opacity 0) or dimmed
  (opacity 0.15, configurable). Transition by CSS opacity, 400 ms.
- `{ type: 'mwn:add', components: [...ids] }` / `{ type: 'mwn:remove', ... }`
  adjust the set.
- Selectors are accepted anywhere an id is: `stage:adult`,
  `domain:inflammation-physical`, `crosscut`, `all`, `none`.
- `{ type: 'mwn:ready', views, components, domains }` on load.

The bridge (`mwn-bridge.html`) maps fragment attributes to these messages:

```html
<span class="fragment mwn-layer" data-show="crosscut"></span>
<span class="fragment mwn-layer" data-add="stage:prenatal" data-view="prenatal"></span>
<span class="fragment mwn-layer" data-add="domain:inflammation-physical" data-mode="dim"></span>
```

Stepping backwards restores the previous fragment's state, as the view bridge
already does (the bridge recomputes the cumulative state from the visible
fragments rather than storing history).

Standalone page: a layer panel listing stages and domains as toggle buttons,
plus "all" and "none", so the speaker can explore and so tagging can be checked
visually without the deck.

### Evidence notes

`domains.json` carries the evidence per domain. The standalone page shows the
note and review list for the active domain below the toolbar. The deck does
nothing with it yet (step 2), but the bridge exposes the current note on
`window.MWN_STATE` for a future caption. Review codes link to the local PDFs
when the page is served from the project and to the INDEX otherwise.

### Testing

- Build report readable by eye: text of every run per component.
- Composite-vs-full diff below 0.5 %.
- Headless Chrome script (as used for the view bridge) steps through a test
  slide with stage then domain fragments and asserts the visible layer set
  after each step.
- librsvg render of the assembled layer SVG as a non-Chrome check.

## Answers from the builder check

**Blend modes.** 106 of the forms are painted with `/BM /Multiply` at alphas
from 0.15 to 1.0: band tints, node ovals, most arrows, band-label tabs and
stage boxes. Rendering a Multiply primitive alone and stacking it with
alpha-over compositing would flatten exactly the parts that matter. Decision:
reproduce the blend in the browser. Each component is rendered as up to two
sub-layers, one for its Multiply primitives and one for its Normal primitives,
and the widget draws the Multiply sub-layer with `mix-blend-mode: multiply`
(supported on SVG `<image>` in both Chrome and Firefox). `layers.json` lists
sub-layers with their blend mode; the widget treats a component as the set of
its sub-layers. The step-5 diff gate composites the sub-layers in Python with
multiply emulated for the Multiply stack, in the PDF's drawing order, so the
gate measures what the browser will show. The size budget is checked after
this doubling; drop to 200 dpi first if needed. Firefox cannot be launched for
testing here; verify with Chrome and librsvg, and state in the README that the
multiply path is unverified in Firefox until the speaker opens it.

**Analysis scripts and counts.** The analysis was done in a scratch directory;
its outputs are now in `mwn/analysis/`: `page-content.txt` (the eight content
streams concatenated, in order), the two contact sheets, and the ink-only
render. The resources dictionary has 151 form XObjects; the page draws 144 of
them, which is the number that matters. The content also contains one direct
shading paint (`sh`); treat it as a primitive anchored at the current clip's
centre. The splitting and per-primitive PDF emission used `pypdf` with a
`DecodedStreamObject` replacing `/Contents`, keeping the page clip
(`48 48.936 1094.983 735.954 re W n`) as prefix; the builder rewrites this
properly as `build_layers.py`.

**Initial layer state.** The widget shows all components on load, so existing
view-only slides are unchanged. A slide may declare its starting state on the
iframe: `data-mwn-initial="none"` (or any selector list, e.g. `crosscut`). The
bridge applies it on `slidechanged` and on `mwn:ready`, and the cumulative
fragment state is computed on top of it, so stepping back past the first
fragment returns to the declared initial state, never to "all". `data-mode` is
part of the cumulative state: the most recent visible fragment that sets it
wins; default `hide`.

**Evidence links.** The Foresight PDFs stay out of git and off GitHub Pages
(the speaker's choice). Review codes therefore always link to the National
Archives copy recorded in `references/manifest.csv` (original URL, resolved
through the UK Government Web Archive), plus the local file name as text for
anyone with the repo. No environment detection.

## Operational rule for the builder

Never launch Firefox from this environment and never run two browsers at once:
doing so hung this machine twice. Headless Chrome, one instance, a fresh
profile, and only when a static check (librsvg, Python compositing) cannot
answer the question.

## Decided by the author (not up for the builder)

- Spatial assignment with first-match-wins ordering, over any attempt to
  recover grouping from the PDF.
- Rasters from the real PDF, 300 dpi, transparent, cropped.
- Twelve domains as listed; all of them ship.
- Single self-contained HTML, iframe plus postMessage, unchanged.
- Washes are cross-cutting band components and are never cut by stage.

## Left to the builder

- The exact component list and rectangles (within the rules above).
- Text-run splitting details and how to carry graphics state into isolated
  runs.
- Dim opacity, transition timing, panel layout.
- Whether to keep the full-page raster as fallback or composite it from
  layers on load.
- Initial evidence sentences (neutral, from the review titles and abstracts).
