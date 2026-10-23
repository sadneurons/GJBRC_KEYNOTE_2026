/* Mental Capital through life: pan/zoom widget with named viewpoints.
 *
 * Standalone:   open index.html; drag to pan, wheel to zoom, buttons or keys for viewpoints.
 * In a deck:    load in an <iframe src="mwn/index.html?embed=1"> and drive it with
 *               frame.contentWindow.postMessage({ type: 'mwn:view', name: 'stress' }, '*')
 *               or { type: 'mwn:viewbox', x, y, w, h }  or  { type: 'mwn:zoom', factor }.
 *               The widget replies with { type: 'mwn:ready', views: [...] } once loaded.
 *
 * Viewpoints are rectangles in the diagram's own coordinate space (PDF points,
 * 1190.55 x 841.89; the picture itself is a 300 dpi raster inlined by build.py). Edit VIEWS to add or tune them. `pad` is extra margin in points.
 */
(() => {
  'use strict';

  const FULL = { x: 0, y: 0, w: 1190.55, h: 841.89 };
  const MIN_W = 80;                  // deepest zoom
  const MAX_W = FULL.w * 1.6;        // furthest zoom-out
  const EASE_MS = 650;

  // name -> { label, group, x, y, w, h }
  const VIEWS = {
    whole:        { label: 'Whole',           group: 'misc',   x: 45,  y: 45,  w: 1100, h: 760 },

    // horizontal bands (full width)
    environments: { label: 'Environments',    group: 'bands',  x: 45,  y: 50,  w: 1100, h: 100 },
    culture:      { label: 'Culture',         group: 'bands',  x: 45,  y: 140, w: 1100, h: 90  },
    mental:       { label: 'Mental Capital',  group: 'bands',  x: 45,  y: 215, w: 1100, h: 200 },
    people:       { label: 'People',          group: 'bands',  x: 45,  y: 405, w: 1100, h: 105 },
    biology:      { label: 'Biology',         group: 'bands',  x: 45,  y: 505, w: 1100, h: 200 },
    lifecourse:   { label: 'Life course',     group: 'bands',  x: 45,  y: 695, w: 1100, h: 100 },

    // life-stage columns. Limited to the Culture..People rows so a 16:9 stage
    // actually zooms in; use the band views (or the lower/upper variants) for the rest.
    prenatal:     { label: 'Prenatal & early childhood', group: 'stages', x: 70,  y: 140, w: 200, h: 380 },
    child:        { label: 'Child',           group: 'stages', x: 250, y: 140, w: 150, h: 380 },
    adolescent:   { label: 'Adolescent',      group: 'stages', x: 385, y: 140, w: 170, h: 380 },
    adult:        { label: 'Adult',           group: 'stages', x: 640, y: 140, w: 270, h: 380 },
    older:        { label: 'Older adults',    group: 'stages', x: 880, y: 140, w: 270, h: 380 },
    // lower rows of each stage (Biology + life course), for the bridge or buttons if wanted
    'prenatal-bio':   { label: 'Prenatal (biology)',   group: 'hidden', x: 70,  y: 500, w: 220, h: 300 },
    'child-bio':      { label: 'Child (biology)',      group: 'hidden', x: 250, y: 500, w: 170, h: 300 },
    'adolescent-bio': { label: 'Adolescent (biology)', group: 'hidden', x: 385, y: 500, w: 240, h: 300 },
    'adult-bio':      { label: 'Adult (biology)',      group: 'hidden', x: 640, y: 500, w: 270, h: 300 },
    'older-bio':      { label: 'Older adults (biology)', group: 'hidden', x: 880, y: 500, w: 270, h: 300 },
  };

  const stage = document.getElementById('stage');
  const host = document.getElementById('host');
  const loading = document.getElementById('loading');
  const params = new URLSearchParams(location.search);
  const embedded = params.has('embed');
  if (embedded) document.body.classList.add('embedded');
  if (params.has('toolbar')) document.body.classList.add('show-toolbar');

  let svg = null;
  let box = { ...FULL };             // current viewBox
  let anim = null;
  let activeName = 'whole';

  // ---------------------------------------------------------------- geometry
  function aspect() {
    const r = stage.getBoundingClientRect();
    return r.width / Math.max(1, r.height);
  }
  // Expand a rectangle to the stage's aspect ratio, keeping it centred.
  function fitRect(r, pad = 10) {
    let x = r.x - pad, y = r.y - pad, w = r.w + 2 * pad, h = r.h + 2 * pad;
    const a = aspect();
    if (w / h < a) { const nw = h * a; x -= (nw - w) / 2; w = nw; }
    else           { const nh = w / a; y -= (nh - h) / 2; h = nh; }
    // keep the view inside the diagram where it fits, so edge columns stay on screen
    if (w <= FULL.w) x = Math.min(Math.max(x, 0), FULL.w - w);
    if (h <= FULL.h) y = Math.min(Math.max(y, 0), FULL.h - h);
    return { x, y, w, h };
  }
  function clampBox(b) {
    const a = aspect();
    let w = Math.min(Math.max(b.w, MIN_W), MAX_W);
    let h = w / a;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  function apply(b) {
    box = b;
    if (svg) svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  }
  function animateTo(target, ms = EASE_MS) {
    if (anim) cancelAnimationFrame(anim);
    const from = { ...box }, t0 = performance.now();
    const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = now => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      apply({
        x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e,
      });
      if (t < 1) anim = requestAnimationFrame(step); else anim = null;
    };
    anim = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- public ops
  function goTo(name, ms) {
    const v = VIEWS[name];
    if (!v) return false;
    activeName = name;
    markActive(name);
    animateTo(clampBox(fitRect(v)), ms);
    return true;
  }
  function goToBox(r, ms) {
    activeName = null; markActive(null);
    animateTo(clampBox(fitRect(r, 0)), ms);
  }
  function zoomBy(factor, px, py) {
    // px, py: zoom centre in stage pixels (defaults to centre)
    const rect = stage.getBoundingClientRect();
    const fx = px == null ? .5 : (px - rect.left) / rect.width;
    const fy = py == null ? .5 : (py - rect.top) / rect.height;
    const ax = box.x + box.w * fx, ay = box.y + box.h * fy;
    let w = Math.min(Math.max(box.w / factor, MIN_W), MAX_W);
    const h = w / aspect();
    activeName = null; markActive(null);
    apply({ x: ax - w * fx, y: ay - h * fy, w, h });
  }

  // ---------------------------------------------------------------- toolbar
  const groups = { bands: document.getElementById('views-bands'), stages: document.getElementById('views-stages') };
  for (const [name, v] of Object.entries(VIEWS)) {
    if (!groups[v.group]) continue;
    const b = document.createElement('button');
    b.textContent = v.label; b.dataset.view = name;
    groups[v.group].appendChild(b);
  }
  document.querySelectorAll('#toolbar [data-view]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.view)));
  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.4));
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.4));
  function markActive(name) {
    document.querySelectorAll('#toolbar [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  }

  // ---------------------------------------------------------------- pointer
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, box: { ...box } };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
    if (anim) { cancelAnimationFrame(anim); anim = null; }
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const rect = stage.getBoundingClientRect();
    const sx = box.w / rect.width, sy = box.h / rect.height;
    activeName = null; markActive(null);
    apply({ ...box, x: drag.box.x - (e.clientX - drag.x) * sx, y: drag.box.y - (e.clientY - drag.y) * sy });
  });
  const endDrag = () => { drag = null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
  stage.addEventListener('dblclick', e => zoomBy(1.8, e.clientX, e.clientY));

  // keys: 0 whole, + / - zoom, b1-b6 bands?, digits 1-5 life stages, Esc whole
  const stageKeys = ['prenatal', 'child', 'adolescent', 'adult', 'older'];
  window.addEventListener('keydown', e => {
    if (e.key === '0' || e.key === 'Escape') goTo('whole');
    else if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.4);
    else if (/^[1-5]$/.test(e.key)) goTo(stageKeys[+e.key - 1]);
  });

  // ---------------------------------------------------------------- messages
  window.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'mwn:view') goTo(m.name, m.ms);
    else if (m.type === 'mwn:viewbox') goToBox({ x: m.x, y: m.y, w: m.w, h: m.h }, m.ms);
    else if (m.type === 'mwn:zoom') zoomBy(m.factor || 1.4);
  });

  // ---------------------------------------------------------------- resize
  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (activeName) apply(clampBox(fitRect(VIEWS[activeName]))); else apply(clampBox(box));
    }, 60);
  }).observe(stage);

  // ---------------------------------------------------------------- load
  // build.py inlines the diagram as window.MWN_SVG (a viewBox-wrapped PNG).
  const load = window.MWN_SVG
    ? Promise.resolve(window.MWN_SVG)
    : Promise.reject(new Error('index.html must be built with build.py'));
  load.then(text => {
    host.innerHTML = text;
    svg = host.querySelector('svg');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const start = VIEWS[params.get('view')] ? params.get('view') : 'whole';
    activeName = start;
    apply(clampBox(fitRect(VIEWS[start])));
    markActive(start);
    loading.classList.add('hidden');
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'mwn:ready', views: Object.keys(VIEWS) }, '*');
    }
  }).catch(err => { loading.textContent = 'Could not load diagram: ' + err; });

  window.MWN = { goTo, goToBox, zoomBy, views: VIEWS };
})();
