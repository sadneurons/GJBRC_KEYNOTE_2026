/* timeline-stage: reveal.js plugin. One SVG behind every slide, driven by slide attributes. */
(function () {
  'use strict';
  var L = window.StageLayout;
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function show(node, on) { node.style.visibility = on ? 'visible' : 'hidden'; node.style.opacity = on ? '' : '0'; }
  function colourOf(token) {
    if (!token) return 'var(--stage-primary)';
    if (/^(primary|accent|highlight|muted|ink)$/.test(token)) return 'var(--stage-' + token + ')';
    return token;
  }
  // tie-break between the labels of one moment: the fork's own label first, the ending last
  var RANK = { fork: 0.05, tag: 0.04, kink: 0.03, event: 0.02, end: 0.01, cross: 0 };
  var LIFT = 10;   // a label's baseline sits this far above its line

  function Stage(reveal) {
    var dataEl = document.getElementById('stage-data');
    if (!dataEl) { console.warn('timeline-stage: no #stage-data'); return; }
    var raw = JSON.parse(dataEl.textContent);
    L.validate(raw).forEach(function (e) { console.warn('timeline-stage: ' + e.path + ': ' + e.message); });
    var model = L.normalise(raw), O = model.options || {};
    var cfg = reveal.getConfig(), W = cfg.width || 1280, H = cfg.height || 720;
    // lengths in options are fractions of the slide when <= 1, pixels otherwise
    function len(v, dflt, size) { v = v == null ? dflt : +v; return v <= 1 ? v * size : v; }
    var LEFT = len(O.left, 0.05, W), RIGHT = len(O.right, 0.05, W), AXIS_Y = len(O.axis, 0.872, H);
    var lo = { height: H, top: len(O.top, 0.278, H), bottom: len(O.bottom, 0.828, H) };
    ['easeYears', 'kink', 'strandGap', 'spread', 'gap'].forEach(function (k) { if (O[k] != null) lo[k] = +O[k]; });
    var geom = L.layout(model, lo);
    var angled = O.eventLabels !== 'horizontal';

    // ---------------------------------------------------------------- DOM
    var root = document.createElement('div'); root.className = 'stage';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'stage-svg', 'aria-hidden': 'true' }); root.appendChild(svg);
    var g = {};
    ['axis', 'cursor', 'lines', 'crossings', 'nodes', 'events', 'ends', 'labels', 'names'].forEach(function (k) {
      g[k] = el('g', { class: 'st-' + k }); svg.appendChild(g[k]);
    });
    function label(cls, text) { var t = el('text', { class: 'st-label ' + cls }, text); g.labels.appendChild(t); return t; }

    g.axis.appendChild(el('line', { class: 'st-axisline', y1: AXIS_Y, y2: AXIS_Y, x1: LEFT, x2: W - RIGHT }));
    var ticks = [];
    for (var yr = Math.ceil(model.span[0]); yr <= Math.floor(model.span[1]); yr++) {
      var tk = el('line', { class: 'st-tick', y1: AXIS_Y }), tl = el('text', { class: 'st-year', y: AXIS_Y + 26, 'text-anchor': 'middle' }, yr);
      g.axis.appendChild(tk); g.axis.appendChild(tl); ticks.push({ yr: yr, t: tk, l: tl });
    }
    var cursor = el('line', { class: 'st-now', y1: lo.top - 8, y2: AXIS_Y + 10 }); g.cursor.appendChild(cursor);

    function allBranches(lid) {
      var out = [];
      (function walk(id) { L.realChildren(model.index[id]).forEach(function (c) { out.push(c); walk(c); }); })(lid);
      return out;
    }
    var paths = {}, names = {}, strandTags = [];
    model.lines.forEach(function (lid) {
      var line = model.index[lid], branches = allBranches(lid);
      // the name sits above the highest thing in the band, clear of that line's own labels
      var topY = geom.targets[lid];
      branches.forEach(function (b) { topY = Math.min(topY, geom.targets[b]); });
      var nm = el('text', { class: 'st-linename', x: LEFT, y: topY - (branches.length ? 32 : 22) }, line.label);
      nm.style.fill = colourOf(line.colour);
      names[lid] = nm; g.names.appendChild(nm);
      [lid].concat(line.strands).concat(branches).forEach(function (id) {
        var node = model.index[id];
        var p = el('path', { class: 'st-path st-' + node.kind, 'data-id': id, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        p.style.stroke = colourOf(node.colour);
        paths[id] = p; g.lines.appendChild(p);
      });
      line.strands.forEach(function (sid) {
        var s = model.index[sid];
        if (!s.label) return;
        var t = label('st-strandname', s.label); t.style.fill = colourOf(s.colour);
        strandTags.push({ node: s, el: t });
      });
    });

    var events = [];
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if (n.kind !== 'event') return;
      var dot = el('circle', { class: 'st-eventdot' + (n.end ? ' st-terminal' : '') + (n.planned ? ' st-planned' : ''), r: n.end || n.planned ? 5.5 : 4.5, 'data-id': id });
      var col = colourOf((model.index[n.parent] || model.index[n.line]).colour);
      if (n.end) dot.style.stroke = col; else if (!n.planned) dot.style.fill = col;
      var leader = el('line', { class: 'st-leader' });
      // a ring marks an event that opens pictures when clicked
      var ring = n.img.length ? el('circle', { class: 'st-eventring', r: 10 }) : null;
      if (ring) { ring.style.stroke = n.planned ? '' : col; g.events.appendChild(ring); }
      g.events.appendChild(leader); g.events.appendChild(dot);
      events.push({ node: n, dot: dot, ring: ring, leader: leader, el: label('st-eventlabel', n.label), pop: !!(n.img.length || n.text) });
    });

    // real forks: a node on the owner, the fork's label before it, a tag on every named child
    var forks = [], kinks = [], seenKinks = {};
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if (n.kind !== 'line' && n.kind !== 'branch') return;
      n.forks.forEach(function (f) {
        if (f.kink) {
          // a shared kink (forks-on) is one moment: a node on every branch, labelled once
          var key = f.at + '|' + f.label, k = seenKinks[key];
          if (!k) {
            k = seenKinks[key] = { fork: f, owners: [], el: f.label ? label('st-kinklabel' + (f.emphasis ? ' st-emphasis' : ''), f.label) : null };
            kinks.push(k);
          }
          var kn = el('circle', { class: 'st-node st-kinknode', r: 4.5 }); g.nodes.appendChild(kn);
          k.owners.push({ owner: n, node: kn });
          return;
        }
        var ring = f.emphasis ? el('circle', { class: 'st-ring', r: 13 }) : null;
        if (ring) g.nodes.appendChild(ring);
        var node = el('circle', { class: 'st-node' + (f.emphasis ? ' st-emphasis' : ''), r: f.emphasis ? 8 : 6.5 }); g.nodes.appendChild(node);
        var entry = { owner: n, fork: f, node: node, ring: ring, tags: [],
          el: f.label ? label('st-forklabel' + (f.emphasis ? ' st-emphasis' : ''), f.label) : null };
        f.children.forEach(function (cid) {
          var c = model.index[cid];
          if (!c.label) return;
          var t = label('st-tag', c.label);
          if (c.colour !== model.index[c.line].colour) { t.style.fill = colourOf(c.colour); t.classList.add('st-coloured'); }
          entry.tags.push({ child: c, el: t });
        });
        forks.push(entry);
      });
    });

    var crossings = [];
    model.crossings.forEach(function (cid) {
      var c = model.index[cid];
      var ln = el('line', { class: 'st-crossline' }), mk = el('circle', { r: 8, class: 'st-crossmark' });
      g.crossings.appendChild(ln); g.crossings.appendChild(mk);
      crossings.push({ node: c, line: ln, mark: mk, el: c.label ? label('st-crosslabel', c.label) : null });
    });

    var ends = [];
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if ((n.kind !== 'branch' && n.kind !== 'line') || n.end == null) return;
      var c = el('circle', { class: 'st-terminal st-endmark', r: 5.5 });
      g.ends.appendChild(c);
      var t = n.endLabel ? label('st-endlabel', n.endLabel) : null;
      ends.push({ node: n, mark: c, el: t });
    });

    // ---------------------------------------------------------------- text metrics
    var widths = new WeakMap(), sizes = {};
    function tw(t) {
      var w = widths.get(t);
      if (w == null) {
        try { w = t.getComputedTextLength(); } catch (e) { w = 0; }
        if (w > 0) widths.set(t, w); else w = L.textWidth(t.textContent, 17);
      }
      return w;
    }
    function fs(t) {
      var k = t.getAttribute('class');
      if (sizes[k] == null) sizes[k] = parseFloat(getComputedStyle(t).fontSize) || 17;
      return sizes[k];
    }

    // ---------------------------------------------------------------- state
    var sections = Array.prototype.slice.call(document.querySelectorAll('.reveal .slides section'));
    var states = L.resolveStates(sections.map(function (s) {
      if (!s.classList.contains('stage')) return { attrs: null };
      var d = s.dataset;
      return { attrs: { view: d.view, grow: d.grow, lit: d.lit, dim: d.dim, colours: d.colours, ends: d.ends, now: d.now, hold: d.hold } };
    }), model);
    states.forEach(function (st, i) { if (st) st.warnings.forEach(function (w) { console.warn('timeline-stage: slide ' + (i + 1) + ': ' + w); }); });

    var cur = null;
    function draw(view, grow, flags, nowX) {
      var x = L.xScale(view, W - LEFT - RIGHT, LEFT), span = view[1] - view[0], ppy = (W - LEFT - RIGHT) / span;
      var inView = function (y) { return y >= view[0] - 0.02 && y <= view[1] + 0.02; };
      var gf = function (id) {
        if (grow[id] != null) return grow[id];
        var n = model.index[id];
        if (n && n.kind === 'event') return gf(n.parent);
        if (n && n.line && n.line !== id && grow[n.line] != null) return grow[n.line];
        return -Infinity;
      };
      var now = flags.now, items = [], obstacles = [];
      // is this element lit? (light() has already marked the ghosts)
      var lit = function (e) { return !e.classList.contains('is-dim'); };
      function item(e, kind, year, on, boxes, extra) {
        var it = { el: e, kind: kind, year: year, on: on && lit(e), boxes: boxes };
        if (extra) for (var k in extra) it[k] = extra[k];
        items.push(it);
        return it;
      }
      // the markers of forks are kept clear: a label that would sit on one gives way
      function around(cx, cy, r) { return { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }; }
      // a horizontal label: anchor 'start' | 'end' | 'middle' at (tx, baseline ty)
      function place(t, tx, ty, anchor) {
        t.setAttribute('x', tx); t.setAttribute('y', ty); t.setAttribute('text-anchor', anchor); t.removeAttribute('transform');
        var w = tw(t), s = fs(t), x0 = anchor === 'end' ? tx - w : anchor === 'middle' ? tx - w / 2 : tx;
        return [{ x0: x0, y0: ty - s * 0.82, x1: x0 + w, y1: ty + s * 0.24 }];
      }

      // ---- axis
      var step = L.tickStep(ppy), nowYear = now != null && Math.abs(now - Math.round(now)) < 0.011 ? Math.round(now) : null;
      ticks.forEach(function (k) {
        var on = inView(k.yr), major = k.yr % step === 0, isNow = nowYear === k.yr, px = x(k.yr);
        k.t.setAttribute('x1', px); k.t.setAttribute('x2', px); k.t.setAttribute('y2', AXIS_Y + (major ? 9 : 5));
        k.t.style.opacity = !on ? 0 : major ? 0.75 : ppy >= 12 ? 0.35 : 0;
        // the label next to a labelled "now" gives way when the two would touch
        var crowded = nowYear != null && !isNow && Math.abs(k.yr - nowYear) * ppy < 46;
        k.l.setAttribute('x', px); k.l.style.opacity = on && (isNow || (major && !crowded)) ? 1 : 0;
        k.l.classList.toggle('is-now', isNow);
      });
      var cOn = now != null && nowX != null && nowX >= LEFT - 1 && nowX <= W - RIGHT + 1;
      cursor.style.opacity = cOn ? '' : '0';
      if (nowX != null) { cursor.setAttribute('x1', nowX); cursor.setAttribute('x2', nowX); }

      // ---- lines
      model.lines.forEach(function (lid) {
        var on = gf(lid) > model.index[lid].start;
        show(names[lid], on);
        if (on) { var nb = names[lid].getBBox(); obstacles.push({ x0: nb.x, y0: nb.y, x1: nb.x + nb.width, y1: nb.y + nb.height }); }
      });
      Object.keys(paths).forEach(function (id) {
        var node = model.index[id];
        paths[id].setAttribute('d', L.samplePath(geom, model, id, view, gf(id), x, { end: flags.ends ? undefined : null }));
        paths[id].style.stroke = colourOf(flags.colours || node.kind !== 'branch' ? node.colour : model.index[node.line].colour);
      });
      strandTags.forEach(function (s) {
        var n = s.node, stop = Math.min(gf(n.id), n.end == null ? Infinity : n.end);
        var on = stop > n.start + 0.02 && stop > view[0] && n.start < view[1];
        var tx = Math.max(x(n.start) + 10, LEFT + 2), yr = Math.max(n.start, view[0]) + 0.5;
        var boxes = place(s.el, tx, L.strandY(geom, model, n.id, yr, { span: span }) - 13, 'start');
        on = on && x(Math.min(stop, view[1] + span)) > tx + 12;
        item(s.el, 'name', n.start, on, boxes, { fixed: true });
      });

      // ---- events
      var shown = [];
      events.forEach(function (e) {
        var n = e.node, on = gf(n.parent) >= n.year - 0.002 && inView(n.year) && !(flags.hold && flags.hold.has(n.id));
        e.px = x(n.year); e.py = L.yFor(geom, model, n.parent, n.year, { span: span }); e.on = on;
        show(e.dot, on);
        e.dot.setAttribute('cx', e.px); e.dot.setAttribute('cy', e.py);
        if (e.ring) { show(e.ring, on); e.ring.setAttribute('cx', e.px); e.ring.setAttribute('cy', e.py); }
        e.live = on && lit(e.el);
        if (e.live) shown.push({ x: e.px, y: e.py, len: tw(e.el), e: e, up: n.side === 'above' });
      });
      if (angled) {
        // labels hang below-left of the event at 45 degrees, ending at it (side: above rises to the
        // upper right instead); events closer than a label's thickness stack in parallel, each with a leader
        L.stackDiagonal(shown, { gap: 23, shift: 18 });
        var rankOf = new Map(); shown.forEach(function (s) { rankOf.set(s.e, s.rank || 0); });
        events.forEach(function (e) {
          var t = e.el, k = rankOf.get(e) || 0, up = e.node.side === 'above', s = fs(t);
          var ax = e.px + k * 18, ay = e.py + k * 18;
          t.setAttribute('text-anchor', up ? 'start' : 'end');
          t.setAttribute('x', ax + (up ? 9 : -9)); t.setAttribute('y', ay + (up ? -9 : 9));
          t.setAttribute('transform', 'rotate(-45 ' + ax + ' ' + ay + ')');
          e.leader.setAttribute('x1', e.px); e.leader.setAttribute('y1', e.py); e.leader.setAttribute('x2', ax); e.leader.setAttribute('y2', ay + (up ? -9 : 9));
          var it = item(t, 'event', e.node.year, e.on, L.diagBoxes(ax, ay + (up ? -12.7 : 12.7), tw(t), s + 2, 0, up), { group: up ? 'ev-up' : 'ev-down' });
          it.leader = e.leader; it.rank = k;
        });
      } else {
        var lanes = { above: [], below: [] };
        events.forEach(function (e) {
          var n = e.node, t = e.el, right = e.px > W - 300, w = tw(t);
          e.leader.style.opacity = 0;
          if (e.on && lit(t)) lanes[n.side === 'below' ? 'below' : 'above'].push({ x: right ? e.px - 10 - w : e.px + 8, width: w, e: e, right: right, group: n.parent, lane: n.lane });
          else item(t, 'event', n.year, false, []);
        });
        ['above', 'below'].forEach(function (side) {
          L.assignLanes(lanes[side], { gap: 10, maxLanes: 3 }).forEach(function (it) {
            var e = it.e, ty = side === 'below' ? e.py + 24 + 20 * Math.max(0, it.lane) : e.py - 12 - 20 * Math.max(0, it.lane);
            item(e.el, 'event', e.node.year, it.lane >= 0, place(e.el, e.px + (it.right ? -10 : 8), ty, it.right ? 'end' : 'start'), { group: 'ev-' + side });
          });
        });
      }

      // ---- forks: node, label on the incoming line, a tag above each child once it has opened
      forks.forEach(function (f) {
        var at = f.fork.at, ease = L.easeOf(geom, f.fork), on = gf(f.owner.id) >= at && inView(at);
        var fx = x(at), fy = L.offsetAt(geom, model, f.owner.id, at);
        show(f.node, on); f.node.setAttribute('cx', fx); f.node.setAttribute('cy', fy);
        if (f.ring) { show(f.ring, on); f.ring.setAttribute('cx', fx); f.ring.setAttribute('cy', fy); }
        if (on) obstacles.push(around(fx, fy, f.fork.emphasis ? 10 : 5));
        if (f.el) item(f.el, 'fork', at, on, place(f.el, fx - (f.fork.emphasis ? 19 : 13), fy - LIFT, 'end'));
        f.tags.forEach(function (t) {
          var open = at + ease;
          item(t.el, 'tag', at, on && gf(t.child.id) >= at + ease * 0.6,
            place(t.el, x(open) + 4, L.offsetAt(geom, model, t.child.id, open) - LIFT, 'start'));
        });
      });
      kinks.forEach(function (k) {
        var at = k.fork.at, ease = L.easeOf(geom, k.fork), first = null;
        k.owners.forEach(function (o) {
          var n = o.owner, on = gf(n.id) >= at && inView(at) && at >= n.start && (n.end == null || at <= n.end);
          show(o.node, on);
          var ky = L.offsetAt(geom, model, n.id, at);
          o.node.setAttribute('cx', x(at)); o.node.setAttribute('cy', ky);
          if (on) obstacles.push(around(x(at), ky, 4));
          if (on && !first && lit(o.node)) first = o;
        });
        if (k.el) {
          var o = first || k.owners[0];
          item(k.el, 'kink', at, !!first, place(k.el, x(at) + 11, L.offsetAt(geom, model, o.owner.id, at + ease) - LIFT, 'start'));
        }
      });

      // ---- crossings
      crossings.forEach(function (c) {
        var n = c.node, on = gf(n.a.id) >= n.a.year - 0.1 && gf(n.b.id) >= n.b.year - 0.1 && Math.max(n.a.year, n.b.year) >= view[0] - 0.5 && Math.min(n.a.year, n.b.year) <= view[1] + 0.5;
        show(c.line, on); show(c.mark, on);
        var ax = x(n.a.year), bx = x(n.b.year), ay = L.yFor(geom, model, n.a.id, n.a.year, { span: span }), by = L.yFor(geom, model, n.b.id, n.b.year, { span: span });
        c.line.setAttribute('x1', ax); c.line.setAttribute('y1', ay); c.line.setAttribute('x2', bx); c.line.setAttribute('y2', by);
        var mx = (ax + bx) / 2, my = (ay + by) / 2, right = mx > W - 340;
        c.mark.setAttribute('cx', mx); c.mark.setAttribute('cy', my);
        if (c.el) item(c.el, 'cross', Math.max(n.a.year, n.b.year), on, place(c.el, mx + (right ? -16 : 16), my + 5, right ? 'end' : 'start'));
      });

      // ---- endings: a ring where the branch stops, its end-label beside it
      ends.forEach(function (e) {
        var n = e.node, on = flags.ends && gf(n.id) >= n.end - 1e-6 && inView(n.end);
        var ex = x(n.end), ey = L.offsetAt(geom, model, n.id, n.end);
        show(e.mark, on); e.mark.setAttribute('cx', ex); e.mark.setAttribute('cy', ey);
        e.mark.style.stroke = colourOf(flags.colours ? n.colour : model.index[n.line].colour);
        if (!e.el) return;
        var tight = ex + 14 + tw(e.el) > W - RIGHT + 30;
        item(e.el, 'end', n.end, on, tight ? place(e.el, ex - 12, ey - LIFT, 'end') : place(e.el, ex + 14, ey + fs(e.el) * 0.34, 'start'));
      });

      // ---- keep the labels that fit; the moment nearest "now" wins, older labels give way
      var frontier = -Infinity;
      Object.keys(grow).forEach(function (id) { if (isFinite(grow[id])) frontier = Math.max(frontier, Math.min(grow[id], view[1])); });
      var ref = now != null ? now : frontier;
      var live = items.filter(function (it) { return it.on; });
      live.forEach(function (it) { it.priority = it.fixed ? 1e6 : -Math.abs(it.year - ref) + (RANK[it.kind] || 0); });
      L.placeLabels(live, { pad: 3, bounds: { x0: 6, y0: 6, x1: W - 6, y1: AXIS_Y - 5 }, obstacles: obstacles });
      items.forEach(function (it) {
        var vis = it.on && it.keep;
        it.el.classList.toggle('is-off', !vis);
        it.el.classList.toggle('is-past', vis && now != null && !it.fixed && it.year < now - 0.75);
        if (it.leader) it.leader.style.opacity = vis && it.rank > 0 ? '' : '0';
      });
    }

    // ---------------------------------------------------------------- lighting
    var litTargets = [];   // [{ el, ids }] : an element is lit if any of its ids is lit
    function lt(e, ids) { if (e) litTargets.push({ el: e, ids: ids }); }
    Object.keys(paths).forEach(function (id) { lt(paths[id], [id]); });
    model.lines.forEach(function (lid) { lt(names[lid], [lid]); });
    strandTags.forEach(function (s) { lt(s.el, [s.node.id]); });
    events.forEach(function (e) { var ids = [e.node.id, e.node.parent]; lt(e.dot, ids); lt(e.ring, ids); lt(e.leader, ids); lt(e.el, ids); });
    forks.forEach(function (f) {
      var ids = [f.owner.id].concat(f.fork.children);
      lt(f.node, ids); lt(f.ring, ids); lt(f.el, ids);
      f.tags.forEach(function (t) { lt(t.el, [t.child.id]); });
    });
    kinks.forEach(function (k) {
      k.owners.forEach(function (o) { lt(o.node, [o.owner.id]); });
      lt(k.el, k.owners.map(function (o) { return o.owner.id; }));
    });
    crossings.forEach(function (c) { lt(c.line, [c.node.id]); lt(c.mark, [c.node.id]); lt(c.el, [c.node.id]); });
    ends.forEach(function (e) { lt(e.mark, [e.node.id]); lt(e.el, [e.node.id]); });
    function light(state) {
      var known = new Set(Array.from(state.lit).filter(function (id) { return !!model.index[id]; }));
      var lit = known.size ? L.litSet(model, known) : null;
      litTargets.forEach(function (t) {
        var on = !lit || t.ids.some(function (id) { return lit.has(id); });
        t.el.classList.toggle('is-dim', !on);
      });
      return lit;
    }

    // ---------------------------------------------------------------- overlays
    // plates and covers: a paragraph holding several pictures becomes a row of equal height;
    // paragraphs are marked as media or text so the stylesheet needs no :has()
    var MEDIA = 'img, video, iframe, svg, canvas';
    sections.forEach(function (sec) {
      if (!sec.classList.contains('stage')) return;
      sec.querySelectorAll('.plate, .cover, .pin').forEach(function (box) {
        Array.prototype.forEach.call(box.children, function (child) {
          var media = child.matches(MEDIA) ? [child] : Array.prototype.slice.call(child.querySelectorAll(MEDIA));
          if (!media.length) { child.classList.add('st-text'); return; }
          child.classList.add('st-media');
          if (media.length < 2) return;
          child.classList.add('st-row');
          media.forEach(function (m) {
            var set = function () {
              var w = m.naturalWidth || m.videoWidth, h = m.naturalHeight || m.videoHeight;
              if (w && h) m.style.flex = (w / h).toFixed(4) + ' 1 0';
            };
            set(); m.addEventListener('load', set); m.addEventListener('loadedmetadata', set);
          });
        });
      });
    });
    document.querySelectorAll('.reveal .slides section.stage blockquote p').forEach(function (p) {
      if (/^[\u201c\u2018"']/.test(p.textContent.trim())) p.classList.add('st-hang');
    });
    // ---------------------------------------------------------------- popups
    // An event with `img` or `text` opens a picture card when its marker is clicked. The stage sits
    // behind the slide, so the click is matched to the nearest live marker by position.
    var revealEl = reveal.getRevealElement ? reveal.getRevealElement() : document.querySelector('.reveal');
    var pop = document.createElement('div'); pop.className = 'st-popup'; pop.setAttribute('aria-hidden', 'true');
    pop.innerHTML = '<figure><div class="st-popup-images"></div><figcaption><strong></strong><span></span></figcaption></figure>';
    var popImages = pop.querySelector('.st-popup-images'), popDate = pop.querySelector('strong'), popText = pop.querySelector('span');
    var onStage = false;
    function popOpen() { return pop.classList.contains('open'); }
    function closePop() { pop.classList.remove('open'); pop.setAttribute('aria-hidden', 'true'); }
    function openPop(e) {
      var n = e.node;
      while (popImages.firstChild) popImages.removeChild(popImages.firstChild);
      var imgs = n.img.map(function (src) {
        var im = document.createElement('img'); im.alt = n.text || n.label;
        popImages.appendChild(im);
        return im;
      });
      // one height for every picture on the card: as tall as fits the slide's width and height
      var fit = function () {
        var sum = 0, ready = imgs.every(function (im) { return im.naturalWidth > 0; });
        if (!ready) return;
        imgs.forEach(function (im) { sum += im.naturalWidth / im.naturalHeight; });
        var h = Math.min(H * 0.68, (W * 0.9 - 14 * (imgs.length - 1)) / sum);
        imgs.forEach(function (im) { im.style.height = h.toFixed(1) + 'px'; });
      };
      imgs.forEach(function (im, i) { im.addEventListener('load', fit); im.src = n.img[i]; });
      fit();
      popImages.style.display = n.img.length ? '' : 'none';
      popDate.textContent = n.date ? n.date + (/[.!?]$/.test(n.date) ? ' ' : '. ') : '';
      popText.textContent = n.text || n.label;
      pop.classList.add('open'); pop.setAttribute('aria-hidden', 'false');
    }
    function eventAt(ev) {
      if (!onStage || !cur || cur.dim) return null;
      var best = null, bd = Infinity;
      events.forEach(function (e) {
        if (!e.pop || !e.live) return;
        var r = e.dot.getBoundingClientRect(), d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
        if (d <= Math.max(14, r.width * 1.8) && d < bd) { best = e; bd = d; }
      });
      return best;
    }
    document.addEventListener('click', function (ev) {
      if (popOpen()) { closePop(); return; }
      var e = eventAt(ev);
      if (e) openPop(e);
    });
    // any key closes the card without also moving the slide
    document.addEventListener('keydown', function (ev) {
      if (!popOpen()) return;
      closePop(); ev.stopImmediatePropagation(); ev.preventDefault();
    }, true);
    var hot = false, moveRaf = null;
    document.addEventListener('mousemove', function (ev) {
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(function () {
        moveRaf = null;
        var h = !popOpen() && !!eventAt(ev);
        if (h !== hot) { hot = h; revealEl.classList.toggle('st-hot', h); }
      });
    });

    function placePins(section, state) {
      var x = L.xScale(state.view, W - LEFT - RIGHT, LEFT);
      section.querySelectorAll('.pin[data-year]').forEach(function (pin) {
        var yr = L.toDecimalYear(pin.dataset.year), px = x(yr), w = pin.offsetWidth || 360, left;
        if (pin.classList.contains('align-left')) left = px - w - 24;
        else if (pin.classList.contains('align-right')) left = px + 24;
        else left = px - w / 2;
        pin.style.left = Math.max(20, Math.min(W - 20 - w, left)) + 'px';
      });
    }

    // ---------------------------------------------------------------- transitions
    var anim = null, raf = null;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function snapshot(state) {
      var grow = {};
      Object.keys(paths).forEach(function (id) { grow[id] = L.growFor(state, model, id); });
      return { v0: state.view[0], v1: state.view[1], grow: grow, now: state.now };
    }
    function nowXOf(a) { return a.now == null ? null : L.xScale([a.v0, a.v1], W - LEFT - RIGHT, LEFT)(a.now); }
    function apply(state, instant) {
      cur = state;
      var flags = { colours: state.colours, ends: state.ends, lit: light(state), now: state.now, hold: state.hold };
      root.classList.toggle('is-dim', !!state.dim);
      var target = snapshot(state);
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (instant || still || !anim) {
        anim = target;
        draw([anim.v0, anim.v1], anim.grow, flags, nowXOf(anim));
        return;
      }
      var from = { v0: anim.v0, v1: anim.v1, grow: {}, now: anim.now };
      Object.keys(target.grow).forEach(function (id) { from.grow[id] = isFinite(anim.grow[id]) ? anim.grow[id] : (isFinite(target.grow[id]) ? model.index[id].start : -Infinity); });
      var t0 = performance.now(), ms = 900;
      var step = function (nowMs) {
        var t = Math.min(1, (nowMs - t0) / ms), e = L.smooth(t), a = { v0: from.v0 + (target.v0 - from.v0) * e, v1: from.v1 + (target.v1 - from.v1) * e, grow: {} };
        Object.keys(target.grow).forEach(function (id) {
          var f = from.grow[id], gr = target.grow[id];
          a.grow[id] = (isFinite(f) && isFinite(gr)) ? f + (gr - f) * e : (isFinite(gr) ? (t < 1 ? model.index[id].start + (gr - model.index[id].start) * e : gr) : -Infinity);
        });
        // the cursor slides from the last moment to this one
        a.now = target.now == null ? null : (from.now == null ? target.now : from.now + (target.now - from.now) * e);
        anim = a;
        draw([a.v0, a.v1], a.grow, flags, nowXOf(a));
        if (t < 1) raf = requestAnimationFrame(step); else { raf = null; anim = target; }
      };
      raf = requestAnimationFrame(step);
    }
    var first = true;
    function update(instant) {
      var sec = reveal.getCurrentSlide(), idx = sections.indexOf(sec);
      var st = idx >= 0 ? states[idx] : null;
      root.style.opacity = st ? 1 : 0;
      onStage = !!st;
      closePop();
      if (!st) root.classList.remove('is-dim');
      if (st) { apply(st, first || instant === true); placePins(sec, st); }
      first = false;
    }
    function redraw() { if (cur) { widths = new WeakMap(); sizes = {}; apply(cur, true); } }
    reveal.on('overviewshown', function () { update(true); });
    var slides = document.querySelector('.reveal .slides');
    slides.insertBefore(root, slides.firstChild);
    slides.appendChild(pop);
    reveal.on('slidechanged', function () { update(false); });
    reveal.on('ready', function () { update(true); });
    if (reveal.isReady()) update(true);
    // widths were measured with fallback fonts if the web fonts had not arrived yet
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    window.TimelineStageDebug = { model: model, geom: geom, states: states, current: function () { return cur; }, redraw: redraw };
  }

  window.TimelineStage = {
    id: 'timeline-stage',
    init: function (reveal) {
      // the data block is included after the body, so it may not exist yet when reveal initialises plugins
      if (document.getElementById('stage-data')) Stage(reveal);
      else if (document.readyState === 'complete') Stage(reveal);
      else window.addEventListener('load', function () { Stage(reveal); });
    }
  };
})();
