# Mental Capital diagram layering: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Foresight "Mental Capital through life" diagram into named, tagged components rendered from the real PDF, and let reveal.js slides build it up by life stage or by science domain.

**Architecture:** A Python pipeline parses the PDF page's content stream into primitives with anchors and blend modes, assigns each to a component by position (first matching rectangle in `components.json` wins), writes one PDF per component sub-layer and renders it to a cropped transparent PNG; `build.py` inlines the PNGs and JSON into the single-file widget. The widget stacks the PNGs as `<image>` elements inside its existing viewBox SVG (Multiply sub-layers with `mix-blend-mode: multiply`) and exposes show/add/remove messages; the reveal bridge maps fragment attributes to those messages.

**Tech Stack:** Python 3.14, pypdf 6.9, Pillow, numpy, pytest 9; pdftocairo (poppler); vanilla JS in a single HTML file; reveal.js via Quarto 1.8.

**Spec:** `docs/superpowers/specs/2026-10-23-mwn-layering-design.md`

## Global Constraints

- Source PDF: `/home/tenebris/Desktop/Keynote/assets/MWN graphic.pdf`, page 1, 1190.55 x 841.89 pt. Page clip `48 48.936 1094.983 735.954 re W n`.
- Coordinates in `components.json` are PDF points, top-left origin (`y_top = 841.89 - y_pdf`), `[x, y, w, h]`; same convention as the existing `VIEWS` table.
- Every primitive goes to exactly one component; unmatched primitives go to `uncategorised`; the build prints a per-component report including the text of every text run.
- Rendering: `pdftocairo -png -transp -r 300`. Fallback 200 dpi only if the built `index.html` exceeds 12 MB.
- Fidelity gate: emulated composite vs full-page render, pixels differing by more than 24/255 in any channel must be below 0.5 % of page pixels.
- The widget stays one self-contained file built by `mwn/build.py`; iframe plus `postMessage`; existing `mwn:view`, `mwn:viewbox`, `mwn:zoom`, `mwn:ready` keep working. Default state on load: all components visible.
- Twelve domains, ids exactly: `early-development`, `learning`, `adolescent-brain`, `stress-resilience`, `inflammation-physical`, `mental-health`, `social`, `work`, `cognitive-ageing`, `environment-ses`, `interventions`, `genetics`. Stage ids exactly: `prenatal`, `child`, `adolescent`, `adult`, `older`, `lifecourse`.
- Review links point at the National Archives URL built from `references/manifest.csv` (`https://webarchive.nationalarchives.gov.uk/ukgwa/20081105202033/<original_url>`), never at local files.
- Never launch Firefox. At most one headless Chrome at a time, fresh `--user-data-dir` under `~/snap/chromium/common/`, closed with DevTools `Browser.close`. Prefer static checks.
- Commit after every task with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.

## Review Focus

1. A text run that starts with `TD`/`Td` after a `Tm` in a previous run: the origin must be the accumulated matrix, not the last `Tm`. Test in Task 1.
2. A component whose rectangles overlap another's: first in file order must win, and the report must make the overlap visible. Test in Task 3.
3. A Multiply sub-layer drawn on its own must not darken a hidden component's area: once hidden, opacity 0 must remove it from the blend. Test in Task 7 (CDP step reads computed opacity and the pixel under a hidden oval).
4. Stepping backwards past the first fragment must return to the iframe's `data-mwn-initial` state, not to "all". Test in Task 8.
5. An unknown selector in a fragment (`domain:typo`) must leave state unchanged and log a warning, not blank the diagram. Test in Task 6.

---

## File structure

- `mwn/pdfprims.py`: parse the page into primitives (forms, text runs, paths, shadings) with anchors, blend mode and emit-able source. One responsibility: PDF in, primitive list out.
- `mwn/assign.py`: load `components.json`, convert rectangles to PDF coordinates, assign primitives, write `assignments.json` and the text report.
- `mwn/build_layers.py`: per-component sub-layer PDFs, rendering, cropping, `layers.json`, the fidelity gate. CLI entry point.
- `mwn/components.json`: components (with `rects`, `stage`, `domains`, `crosscut`) and `views`.
- `mwn/domains.json`: twelve domains with `label`, `colour`, `reviews`, `evidence`.
- `mwn/layers/*.png`, `mwn/layers.json`, `mwn/assignments.json`: build outputs (committed, so the deck builds without poppler).
- `mwn/build.py` (modify): inline layers and JSON.
- `mwn/mwn.js`, `mwn/index.src.html`, `mwn/mwn.css` (modify): layer stack, API, panel.
- `mwn-bridge.html` (modify): layer fragments and initial state.
- `tests/test_pdfprims.py`, `tests/test_assign.py`, `tests/test_build_layers.py`: pytest.
- `tools/check_widget.py`: single-instance headless Chrome CDP check (from the earlier ad-hoc script), used in Tasks 7 and 8.
- `index.qmd` (modify): a build-up test slide.

---

### Task 1: Primitive parser

**Files:**
- Create: `mwn/pdfprims.py`
- Test: `tests/test_pdfprims.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass
  class Prim:
      kind: str            # "form" | "text" | "path" | "shading"
      index: int           # drawing order, 0-based
      anchor: tuple[float, float]   # PDF coordinates (y up)
      bbox: tuple[float, float, float, float]  # x0, y0, x1, y1, PDF coords
      blend: str           # "Normal" | "Multiply"
      alpha: float         # ca from the ExtGState in force, 1.0 if none
      ops: str             # content-stream text that draws this primitive alone, including the q/Q, cm, gs, and for text the BT/ET with full text state
      text: str            # concatenated literal text for kind == "text", else ""
  def load_page(pdf_path: str) -> "Page"      # Page has .reader (pypdf), .content (str), .xobjects (dict name -> {bbox, matrix}), .extgstates (dict name -> {bm, ca})
  def parse_primitives(page: "Page") -> list[Prim]
  def write_subset_pdf(page: "Page", prims: list[Prim], out_path: str) -> None   # page clip prefix + prims' ops in index order, as the new /Contents
  ```

- [ ] **Step 1: Write failing tests**

```python
from mwn.pdfprims import load_page, parse_primitives, write_subset_pdf
PDF = "/home/tenebris/Desktop/Keynote/assets/MWN graphic.pdf"

def test_counts():
    prims = parse_primitives(load_page(PDF))
    kinds = {k: sum(p.kind == k for p in prims) for k in ("form", "text", "path", "shading")}
    assert kinds["form"] == 144
    assert kinds["shading"] == 1
    assert kinds["text"] >= 280          # at least one run per Tm
    assert kinds["path"] >= 20

def test_form_anchor_and_blend():
    prims = parse_primitives(load_page(PDF))
    fm23 = next(p for p in prims if p.kind == "form" and "/Fm23 Do" in p.ops)
    # BBox [365.687 594.292 549.252 415.354], identity matrix, no cm
    assert abs(fm23.anchor[0] - 457.47) < 0.1 and abs(fm23.anchor[1] - 504.82) < 0.1
    assert fm23.blend in ("Normal", "Multiply")
    multiply = [p for p in prims if p.blend == "Multiply"]
    assert 90 <= len(multiply) <= 120

def test_text_run_origin_after_td():
    prims = parse_primitives(load_page(PDF))
    later = next(p for p in prims if p.text.startswith("Later lif"))
    assert abs(later.anchor[0] - 852.55) < 0.1 and abs(later.anchor[1] - 184.49) < 0.1
    accel = next(p for p in prims if p.text.startswith("Accelerated ageing"))
    assert abs(accel.anchor[1] - 176.22) < 0.1
    chronic = next(p for p in prims if p.text.startswith("Chronic diseases"))
    # 0 -1.198 TD at size 6.9048 => y = 176.2155 - 1.198*6.9048
    assert abs(chronic.anchor[1] - (176.2155 - 1.198 * 6.9048)) < 0.05

def test_subset_pdf_renders(tmp_path):
    page = load_page(PDF); prims = parse_primitives(page)
    one = [p for p in prims if p.text.startswith("Later lif")]
    out = tmp_path / "one.pdf"; write_subset_pdf(page, one, str(out))
    import subprocess; subprocess.run(["pdftocairo", "-png", "-transp", "-r", "72", "-singlefile", str(out), str(tmp_path / "one")], check=True)
    from PIL import Image; bb = Image.open(tmp_path / "one.png").getbbox()
    assert bb is not None and 840 < bb[0] < 870 and 650 < bb[1] < 665   # x≈852pt, y_top≈842-184=658
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tenebris/Desktop/Keynote/GJBRC_KEYNOTE_2026 && python3 -m pytest tests/test_pdfprims.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'mwn.pdfprims'` (add an empty `mwn/__init__.py` and `tests/__init__.py` as part of this task).

- [ ] **Step 3: Implement `load_page`, `parse_primitives`, `write_subset_pdf` in `mwn/pdfprims.py`**

Approach decisions the signature does not fix:
- Concatenate the eight `/Contents` streams with `\n` (pypdf `page["/Contents"]` is an array; decode each).
- Tokenise line by line as the stream is already one operator per line; keep a graphics-state stack with CTM (6-tuple), current `gs` name, fill colour op string, and a text state (`Tf` name+size, `Tc`, `Tw`, `Tz`, `TL`, `Ts`, `Tr`, `Tm`, line matrix).
- A form primitive is the `q … /FmN Do … Q` group; anchor = centre of `/BBox` transformed by `/Matrix` then the CTM at the `Do`. Blend/alpha from the ExtGState named by the group's `gs` (`/BM`, `/ca`).
- Text: inside `BT…ET`, a run is each `TJ`/`Tj`/`'`/`"` operator; its anchor is the current text matrix translated by CTM; after each run advance `Tm` by the run's displacement (approximate: glyph count × 0.5 × size × Tz is acceptable because anchors only need the run origin). `TD` sets `TL = -ty`; `T*` applies `TL`. The run's `ops` is `q <gs> <colour> BT <Tf> <Tc Tw Tz TL Ts Tr> <absolute Tm> <operator line> ET Q`.
- Path: accumulate `m/l/c/v/y/h/re` segments until a painting operator (`f`, `f*`, `S`, `B`, `b`, `n` with `W`); bbox from all control points under CTM; `n` after `W` is a clip, not a primitive, but is kept in the enclosing group's state. `sh` is a shading primitive anchored at the current clip bbox centre.
- `write_subset_pdf`: body = `q 48 48.936 1094.983 735.954 re W n\n` + ops of prims in `index` order + `\nQ`; replace `/Contents` with a `DecodedStreamObject` via `PdfWriter.append` as in the analysis.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_pdfprims.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add mwn/__init__.py mwn/pdfprims.py tests/__init__.py tests/test_pdfprims.py
git commit -m "Parse the Mental Capital PDF page into anchored primitives"
```

### Task 2: Domains and components data

**Files:**
- Create: `mwn/domains.json`, `mwn/components.json`
- Test: `tests/test_assign.py` (schema tests only; assignment tests come in Task 3)

**Interfaces:**
- Produces `domains.json`: `{"domains": [{"id", "label", "colour", "reviews": ["SR-E17", …], "evidence": "…"}]}` with exactly the twelve ids and the review codes from the spec table.
- Produces `components.json`: `{"components": [{"id", "label", "rects": [[x,y,w,h], …], "stage", "domains": [...], "crosscut": bool}], "views": {<the current VIEWS table from mwn.js, same keys and values>}}`.

- [ ] **Step 1: Write failing schema tests**

```python
import json
DOMAINS = {"early-development","learning","adolescent-brain","stress-resilience","inflammation-physical","mental-health","social","work","cognitive-ageing","environment-ses","interventions","genetics"}
STAGES = {"prenatal","child","adolescent","adult","older","lifecourse"}

def test_domains_file():
    d = json.load(open("mwn/domains.json"))["domains"]
    assert {x["id"] for x in d} == DOMAINS
    assert all(x["reviews"] and x["evidence"] and x["colour"].startswith("#") for x in d)

def test_components_file():
    c = json.load(open("mwn/components.json"))
    comps = c["components"]
    assert 45 <= len(comps) <= 80
    ids = [x["id"] for x in comps]; assert len(ids) == len(set(ids))
    for x in comps:
        assert x["stage"] in STAGES and set(x["domains"]) <= DOMAINS and x["rects"]
        assert all(len(r) == 4 and r[2] > 0 and r[3] > 0 for r in x["rects"])
    assert {"environments-wash","culture-wash","mental-capital-wash","people-wash","biology-wash","lifelong-learning-arrow","nutrition-wave","life-course-strip"} <= set(ids)
    assert set(c["views"]) >= {"whole","mental","adult","older","prenatal"}
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest tests/test_assign.py -v` — Expected: FAIL, files missing.

- [ ] **Step 3: Write `mwn/domains.json`**

Colours: GJBRC purple `#462072`, teal `#00e6cb`, gold `#fbb109` plus nine muted tones chosen by the implementer, all distinct. Evidence sentences: one or two neutral sentences per domain summarising what the listed reviews cover, taken from the titles in `references/foresight/INDEX.md` (and the PDFs' abstracts where on disk).

- [ ] **Step 4: Write `mwn/components.json`**

Derive rectangles from `mwn/analysis/ink-only.png` (1191 x 842 px, 1 px = 1 pt, top-left origin) and the forms contact sheets. Required components beyond the eight cross-cutting ids above: one per labelled node or text cluster in the diagram, including at least: `genetic-endowment`, `parents-figures`, `maternal-influences`, `pregnant-mother`, `foetal-programming`, `early-home-experiences`, `parenting-skills`, `knowledge-attitudes`, `early-stress-exposure`, `early-development`, `teachers-figures`, `disposition-to-learn`, `early-school-experiences`, `learning-environment`, `nutrition-quality`, `childhood-biology`, `childhood-trauma`, `executive-function`, `self-esteem-social-cognition`, `functional-literacy`, `peers-mentors-figures`, `peer-influence`, `reward-circuits`, `substance-onset-note`, `self-controlled`, `impulsivity`, `social-engagement`, `social-maladjustment`, `permissive-environments`, `drug-alcohol-abuse`, `social-exclusion`, `socioeconomic-status`, `learning-attention-memory`, `genetic-vulnerability`, `chronic-inflammation`, `work-environment`, `work-life-balance`, `life-events`, `stress`, `stigmatisation`, `cognitive-resilience`, `coworkers-figures`, `social-support`, `stress-diseases`, `adult-biology`, `hpa-axis`, `anxiety-depression`, `chronic-illness`, `active-coping`, `age-related-challenges`, `cognitive-reserve`, `waste-of-mental-capital`, `physical-activity-list`, `living-longer`, `older-figures`, `social-supports`, `technological-interventions`, `later-life-biology`, `bioscience`, `brain-atrophy`, `understanding-lifecourse`, `working-longer`, `community-environment`, `socioeconomic-gradient`, `social-valuation-parenting`, `social-valuation-teachers`, `media-environments`, `built-environment`, `transport`, `band-labels`, `stage-boxes`. Each gets `stage` by column and `domains` by the spec's twelve; `crosscut: true` for washes, band labels, strips, arrow, wave. Put small specific components before large ones.

- [ ] **Step 5: Run tests, expect 2 passed, commit**

```bash
git add mwn/domains.json mwn/components.json tests/test_assign.py
git commit -m "Add domain and component definitions for the diagram layering"
```

### Task 3: Assignment and report

**Files:**
- Create: `mwn/assign.py`
- Modify: `tests/test_assign.py`

**Interfaces:**
- Consumes `Prim` list from Task 1 and `components.json`.
- Produces:
  ```python
  def load_components(path: str) -> list[dict]       # rects converted to PDF coords: (x0, y0, x1, y1) y-up
  def assign(prims: list[Prim], comps: list[dict]) -> dict[str, list[int]]   # component id -> prim indices, in file order, plus "uncategorised"
  def report(prims, assignment) -> str                # one block per component: id, counts by kind, every text run's text; "OVERLAP" lines listing rectangles that intersect an earlier component's
  ```
  `assign.py` as a script writes `mwn/assignments.json` (`{"components": {id: [indices]}, "uncategorised": [indices]}`) and prints the report.

- [ ] **Step 1: Write failing tests**

```python
from mwn.pdfprims import load_page, parse_primitives
from mwn.assign import load_components, assign, report

def test_first_match_wins():
    comps = [{"id":"small","rects":[[10,10,20,20]],"stage":"child","domains":["learning"],"crosscut":False},
             {"id":"big","rects":[[0,0,100,100]],"stage":"child","domains":["learning"],"crosscut":False}]
    from mwn.assign import _to_pdf_rects; comps = _to_pdf_rects(comps)
    class P: pass
    p = P(); p.anchor = (15, 841.89-15); p.index = 0
    assert assign([p], comps)["small"] == [0]

def test_every_prim_assigned_once_and_few_uncategorised():
    prims = parse_primitives(load_page(PDF)); comps = load_components("mwn/components.json")
    a = assign(prims, comps)
    all_idx = sorted(i for v in a.values() for i in v)
    assert all_idx == list(range(len(prims)))
    assert len(a["uncategorised"]) <= 3

def test_known_text_lands():
    prims = parse_primitives(load_page(PDF)); comps = load_components("mwn/components.json"); a = assign(prims, comps)
    by_id = {p.index: p for p in prims}
    def comp_of(prefix): return next(k for k, v in a.items() if any(by_id[i].text.startswith(prefix) for i in v))
    assert comp_of("Chronic inflammation") == "chronic-inflammation"
    assert comp_of("Cognitive reserve") == "cognitive-reserve"
    assert comp_of("Later lif") == "later-life-biology"

def test_report_lists_text_and_overlaps():
    prims = parse_primitives(load_page(PDF)); comps = load_components("mwn/components.json")
    r = report(prims, assign(prims, comps))
    assert "chronic-inflammation" in r and "Chronic inflammation" in r
```

- [ ] **Step 2: Run, expect failures (`mwn.assign` missing)**

- [ ] **Step 3: Implement `mwn/assign.py`** with `_to_pdf_rects(comps)` converting `[x,y,w,h]` top-left to `(x0,y0,x1,y1)` y-up, `assign` iterating prims and components in order, and `report`. Script `__main__` writes `assignments.json` and prints the report.

- [ ] **Step 4: Run tests; iterate `components.json` rectangles until `test_known_text_lands` and the uncategorised bound pass. Read the full report once and fix obvious mis-tags.** Expected: 6 passed in the file.

- [ ] **Step 5: Commit**

```bash
git add mwn/assign.py mwn/assignments.json mwn/components.json tests/test_assign.py
git commit -m "Assign diagram primitives to components by position, with a readable report"
```

### Task 4: Layer rendering and fidelity gate

**Files:**
- Create: `mwn/build_layers.py`, `mwn/layers/`, `mwn/layers.json`
- Test: `tests/test_build_layers.py`

**Interfaces:**
- Consumes Tasks 1 and 3.
- Produces `mwn/layers.json`:
  ```json
  {"dpi": 300, "page": [1190.55, 841.89],
   "components": [{"id": "stress", "label": "Stress", "stage": "adult", "domains": ["stress-resilience"], "crosscut": false, "order": 57,
                   "layers": [{"file": "stress-multiply.png", "blend": "Multiply", "x": 640.2, "y": 150.1, "w": 120.4, "h": 88.0, "px": [502, 367]},
                              {"file": "stress-normal.png", "blend": "Normal", ...}]}]}
  ```
  `x, y, w, h` in PDF points, top-left origin; `px` image size. `order` = index of the component's first primitive (stacking order). Components with no primitives are listed with empty `layers`.
  ```python
  def render_component(page, prims, comp_id, out_dir, dpi=300) -> list[dict]   # writes up to two PNGs, returns layer dicts
  def composite(layers_json, layers_dir, dpi) -> "PIL.Image"                    # emulated browser composite over white, in `order`, multiply for Multiply layers
  def fidelity(composite_img, full_render_img, threshold=24) -> float           # fraction of pixels differing > threshold in any channel
  ```
  CLI: `python3 -m mwn.build_layers [--dpi 300]` runs everything, prints the report and the fidelity fraction, exits 1 above 0.005.

- [ ] **Step 1: Write failing tests**

```python
def test_render_component_splits_by_blend(tmp_path):
    page = load_page(PDF); prims = parse_primitives(page); a = assign(prims, load_components("mwn/components.json"))
    layers = render_component(page, [prims[i] for i in a["stress"]], "stress", tmp_path, dpi=72)
    assert {l["blend"] for l in layers} <= {"Normal", "Multiply"} and 1 <= len(layers) <= 2
    for l in layers:
        im = Image.open(tmp_path / l["file"]); assert im.mode == "RGBA" and im.size == tuple(l["px"]) and im.getbbox() == (0, 0, *im.size)

def test_multiply_emulation():
    from mwn.build_layers import _blend_multiply
    import numpy as np
    dst = np.full((1,1,3), 200, np.uint8); src = np.full((1,1,4), (100,100,100,255), np.uint8)
    assert tuple(_blend_multiply(dst, src)[0,0]) == (78, 78, 78)   # 200*100/255

def test_fidelity_gate_on_full_build(tmp_path):
    from mwn.build_layers import build_all
    frac = build_all(out_dir=tmp_path, dpi=72)
    assert frac < 0.005
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement `mwn/build_layers.py`**: group a component's prims by `blend`, `write_subset_pdf` per group, `pdftocairo -png -transp -r <dpi> -singlefile`, crop to `getbbox()`, convert the crop box to points. `composite` paints each layer at its offset over a white canvas in `order`; Normal via alpha-over, Multiply via `_blend_multiply` then alpha-over. Full render for the gate: `pdftocairo -png -r <dpi>` of the original. `build_all` returns the fidelity fraction and writes `layers.json`.

- [ ] **Step 4: Run tests at 72 dpi; expect 3 passed. Then run the CLI at 300 dpi; expect `fidelity 0.00xx` below 0.005 and `mwn/layers/` populated. Note total size of `mwn/layers/`.**

- [ ] **Step 5: Commit**

```bash
git add mwn/build_layers.py mwn/layers mwn/layers.json tests/test_build_layers.py
git commit -m "Render each diagram component to transparent layers with a fidelity gate"
```

### Task 5: Inline layers into the widget build

**Files:**
- Modify: `mwn/build.py`
- Test: `tests/test_build_layers.py` (add one test)

**Interfaces:**
- Produces in the built HTML: `window.MWN_DATA = {"layers": <layers.json with each layer's "file" replaced by "data": "data:image/png;base64,…">, "components": <components.json>, "domains": <domains.json>, "whole": "data:image/png;base64,…"}`; `window.MWN_SVG` is removed.

- [ ] **Step 1: Write failing test**

```python
def test_build_inlines_layers():
    import subprocess, re, os
    subprocess.run(["python3", "mwn/build.py"], check=True)
    html = open("mwn/index.html").read()
    assert "window.MWN_DATA" in html and "window.MWN_SVG" not in html
    assert html.count("data:image/png;base64,") >= 40
    assert os.path.getsize("mwn/index.html") < 12_000_000
```

- [ ] **Step 2: Run, expect failure. Step 3: Implement in `build.py` (escape `</` as before). Step 4: Run, expect pass; if size fails, rerun `build_layers` at 200 dpi and update the Global Constraints note in README. Step 5: Commit** `git commit -m "Inline component layers and metadata into the widget"`.

### Task 6: Widget layer stack and API

**Files:**
- Modify: `mwn/mwn.js`, `mwn/index.src.html`, `mwn/mwn.css`
- Test: `tests/test_widget_static.py` (node-free static checks) and manual librsvg check

**Interfaces:**
- Consumes `window.MWN_DATA`.
- Produces in-page API `window.MWN`: `show(selectors: string[], mode?: "hide"|"dim")`, `add(selectors)`, `remove(selectors)`, `resolve(selector: string) -> string[]` (ids), `state() -> {visible: string[], mode: string}`; messages `mwn:show {components, mode}`, `mwn:add {components}`, `mwn:remove {components}`, `mwn:state` (reply `{type:'mwn:state', visible, mode}`); `mwn:ready` now `{type, views, components: [ids], domains: [ids]}`. Selector grammar: an id, `stage:<id>`, `domain:<id>`, `crosscut`, `all`, `none`. Unknown selector: `console.warn` and resolves to `[]` without changing state. Dim opacity 0.15; transition `opacity .4s`.
- DOM: inside the viewBox SVG, one `<g class="layer" data-component="<id>" style="opacity">` per component in `order`, containing one `<image>` per sub-layer with `style="mix-blend-mode: multiply"` on Multiply layers, positioned at its `x, y, w, h`.
- Panel (standalone only): stage buttons, domain buttons, `All`, `None`, toggle `Dim`; active domain's `evidence` and review links shown below the toolbar.

- [ ] **Step 1: Write a static test**

```python
def test_widget_source_contracts():
    js = open("mwn/mwn.js").read()
    for s in ("mwn:show", "mwn:add", "mwn:remove", "mwn:state", "stage:", "domain:", "crosscut", "mix-blend-mode", "console.warn"):
        assert s in js
    html = open("mwn/index.src.html").read(); assert 'id="layers-panel"' in html and 'id="evidence"' in html
```

- [ ] **Step 2: Run, expect failure. Step 3: Implement.** Load path: build the SVG from `MWN_DATA` (no `innerHTML` of a huge string), then the existing `apply/fit` logic unchanged. Keep `MWN_DATA.whole` for a `?whole=1` debug mode only.

- [ ] **Step 4: Static render check.** Write `tools/extract_svg.py` that rebuilds the layer SVG from `layers.json` and `mwn/layers/*.png` as a standalone file and run `rsvg-convert -w 1200 -o /tmp/claude-1000/…/scratchpad/mwn/layers-rsvg.png`; view it and compare with `mwn/mwn.png`. (librsvg honours `mix-blend-mode`; if it does not, compare the Normal layers only and note it.) Expected: visually the full diagram.

- [ ] **Step 5: Run `python3 mwn/build.py`, then one headless Chrome run (single instance, fresh profile) of `mwn/index.html?view=whole` to a screenshot; view it. Expected: full diagram, panel below. Commit** `git commit -m "Widget: component layer stack with show/add/remove API and layer panel"`.

### Task 7: CDP check tool and widget behaviour test

**Files:**
- Create: `tools/check_widget.py` (adapted from the earlier scratch `cdp_test.py`: args `url`, `out_dir`, `port`, `profile`; runs a list of JS expressions and prints results; `Browser.close` at the end; uses `websockets`)
- Test: run it once, by hand, single instance

- [ ] **Step 1: Write the tool** with a `--script` option taking a JSON list of `{"eval": "...", "sleep": 1.0, "shot": "name.png"}` steps.

- [ ] **Step 2: Run against the standalone widget**: steps `MWN.show(["none"])`, `MWN.add(["stage:prenatal"])`, `MWN.add(["domain:inflammation-physical"], )`, `MWN.show(["all"], "dim")`, `MWN.show(["stress"])`, and after the last: eval `getComputedStyle(document.querySelector('[data-component="cognitive-reserve"]')).opacity` and read the pixel colour under the hidden "Cognitive reserve" oval via a canvas draw of the SVG (or simply assert the opacity is `0`). Expected printed: visible sets of the right sizes, opacity `0`, screenshots showing only the requested parts.

- [ ] **Step 3: Commit** `git commit -m "Add single-instance headless Chrome check tool for the widget"`.

### Task 8: Reveal bridge and build-up slide

**Files:**
- Modify: `mwn-bridge.html`, `index.qmd`, `README.md`

**Interfaces:**
- Fragments: `<span class="fragment mwn-layer" data-show="…" | data-add="…" | data-remove="…" [data-mode="hide|dim"] [data-view="…"]>`; selectors comma-separated. Iframe: `data-mwn-initial="none|all|<selectors>"` (default `all`).
- Bridge computes state = initial, then applies each visible `.mwn-layer` fragment in document order, on `fragmentshown`, `fragmenthidden`, `slidechanged`, and `mwn:ready`; sends one `mwn:show {components: resolved…, mode}` per change (the widget resolves selectors; the bridge only concatenates). `data-view` still sends `mwn:view`. `window.MWN_STATE` mirrors the last state and the active domain's evidence (from `MWN_DATA.domains`, requested via `mwn:state`).

- [ ] **Step 1: Add the test slide to `index.qmd`** after the existing diagram slide:

```markdown
## Building the picture {.white .no-logo}

<iframe class="mwn-frame" data-src="mwn/index.html?embed=1" data-preload data-mwn-initial="crosscut"></iframe>
<span class="fragment mwn-layer" data-add="stage:prenatal" data-view="prenatal"></span>
<span class="fragment mwn-layer" data-add="stage:child,stage:adolescent" data-view="adolescent"></span>
<span class="fragment mwn-layer" data-add="stage:adult,stage:older" data-view="whole"></span>
<span class="fragment mwn-layer" data-show="crosscut,domain:inflammation-physical" data-mode="dim"></span>
<span class="fragment mwn-layer" data-show="all"></span>
```

- [ ] **Step 2: Implement the bridge.** - [ ] **Step 3: `quarto render`; run `tools/check_widget.py` once against `_site/index.html#/2/3`** with steps `Reveal.next()` x5 then `Reveal.prev()` x5, evaluating after each `document.querySelector('iframe.mwn-frame').contentWindow.MWN.state().visible.length`. Expected: counts rise over the first three steps, drop at the dim step (visible = crosscut + inflammation components), reach the total at step five, and after five `prev` return to the crosscut-only count (not the total).

- [ ] **Step 4: README**: document the fragment attributes, `data-mwn-initial`, the build commands (`python3 -m mwn.build_layers && python3 mwn/build.py`), and that the Multiply path is unverified in Firefox until the speaker opens it. **Commit** `git commit -m "Bridge reveal fragments to diagram layers; add build-up test slide"`.

### Task 9: Whole-branch verification

- [ ] Run `python3 -m pytest -q` (expect all passed), `python3 -m mwn.build_layers` (fidelity below 0.005), `python3 mwn/build.py` (size under 12 MB), `quarto render` (no errors), one headless Chrome screenshot of slides `#/2/2` and `#/2/3`; view both. Commit any fixes. Then request a fresh reviewer on the branch.
