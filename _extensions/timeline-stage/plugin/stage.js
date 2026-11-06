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

  function Stage(reveal) {
    var dataEl = document.getElementById('stage-data');
    if (!dataEl) { console.warn('timeline-stage: no #stage-data'); return; }
    var raw = JSON.parse(dataEl.textContent);
    L.validate(raw).forEach(function (e) { console.warn('timeline-stage: ' + e.path + ': ' + e.message); });
    var model = L.normalise(raw);
    var cfg = reveal.getConfig(), W = cfg.width || 1280, H = cfg.height || 720;
    var LEFT = 0.055 * W, RIGHT = 0.055 * W, AXIS_Y = 0.84 * H;
    var geom = L.layout(model, { height: H, top: 0.12 * H, bottom: 0.78 * H });

    // ---------------------------------------------------------------- DOM
    var root = document.createElement('div'); root.className = 'stage';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'stage-svg' }); root.appendChild(svg);
    var g = {}; ['axis', 'names', 'lines', 'forks', 'events', 'crossings', 'ends'].forEach(function (k) { g[k] = el('g', { class: 'st-' + k }); svg.appendChild(g[k]); });

    var axisLine = el('line', { class: 'st-axisline', y1: AXIS_Y, y2: AXIS_Y, x1: LEFT, x2: W - RIGHT }); g.axis.appendChild(axisLine);
    var ticks = [];
    for (var yr = Math.ceil(model.span[0]); yr <= Math.floor(model.span[1]); yr++) {
      var t = el('line', { class: 'st-tick', y1: AXIS_Y - 6, y2: AXIS_Y + 6 }), l = el('text', { class: 'st-year', y: AXIS_Y + 26, 'text-anchor': 'middle' }, yr);
      g.axis.appendChild(t); g.axis.appendChild(l); ticks.push({ yr: yr, t: t, l: l });
    }
    var paths = {}, names = {};
    model.lines.forEach(function (lid) {
      var line = model.index[lid];
      names[lid] = el('text', { class: 'st-linename', x: LEFT, y: geom.bands[lid].y0 + 18 }, line.label); g.names.appendChild(names[lid]);
      [lid].concat(line.strands).concat(L.leaves(model, lid, []).length ? allBranches(model, lid) : []).forEach(function (id) {
        var node = model.index[id];
        var p = el('path', { class: 'st-path st-' + node.kind, 'data-id': id, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        p.style.stroke = colourOf(node.colour);
        paths[id] = p; g.lines.appendChild(p);
      });
    });
    function allBranches(model, lid) {
      var out = [];
      (function walk(id) { L.realChildren(model.index[id]).forEach(function (c) { out.push(c); walk(c); }); })(lid);
      return out;
    }
    var events = [];
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if (n.kind !== 'event') return;
      var ge = el('g', { class: 'st-event', 'data-id': id });
      ge.appendChild(el('circle', { r: n.end ? 6 : 5 })); ge.appendChild(el('text', { class: 'st-eventlabel' }, n.label));
      events.push({ node: n, g: ge }); g.events.appendChild(ge);
    });
    var forks = [], seenKinks = {};
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if (n.kind !== 'line' && n.kind !== 'branch') return;
      n.forks.forEach(function (f, i) {
        if (!f.label) return;
        // a shared kink (forks-on) is labelled once, on the first branch that carries it
        if (f.kink) {
          var key = f.at + '|' + f.label;
          if (seenKinks[key]) { seenKinks[key].owners.push(n); return; }
          seenKinks[key] = { owners: [n] };
        }
        var gf = el('g', { class: 'st-fork' + (f.emphasis ? ' st-emphasis' : '') + (f.kink ? ' st-kink' : ''), 'data-id': id + '#' + i });
        gf.appendChild(el('line', {})); gf.appendChild(el('text', { class: 'st-forklabel', 'text-anchor': 'middle' }, f.label));
        var entry = { owner: n, fork: f, g: gf, owners: f.kink ? seenKinks[f.at + '|' + f.label].owners : [n] };
        forks.push(entry); g.forks.appendChild(gf);
      });
    });
    var crossings = [];
    model.crossings.forEach(function (cid) {
      var c = model.index[cid], gc = el('g', { class: 'st-crossing', 'data-id': cid });
      gc.appendChild(el('line', { class: 'st-crossline' })); gc.appendChild(el('circle', { r: 9, class: 'st-crossmark' })); gc.appendChild(el('text', { class: 'st-crosslabel' }, c.label));
      crossings.push({ node: c, g: gc }); g.crossings.appendChild(gc);
    });
    var ends = [];
    Object.keys(model.index).forEach(function (id) {
      var n = model.index[id];
      if ((n.kind !== 'branch' && n.kind !== 'line') || n.end == null) return;
      var ge = el('g', { class: 'st-end', 'data-id': id });
      var c = el('circle', { r: 8 }); c.style.fill = colourOf(n.colour);
      ge.appendChild(c); ge.appendChild(el('text', { class: 'st-endlabel' }, n.endLabel || n.label));
      ends.push({ node: n, g: ge }); g.ends.appendChild(ge);
    });

    // ---------------------------------------------------------------- state
    var sections = Array.prototype.slice.call(document.querySelectorAll('.reveal .slides section'));
    var states = L.resolveStates(sections.map(function (s) {
      if (!s.classList.contains('stage')) return { attrs: null };
      var d = s.dataset;
      return { attrs: { view: d.view, grow: d.grow, lit: d.lit, dim: d.dim, colours: d.colours, ends: d.ends } };
    }), model);
    states.forEach(function (st, i) { if (st) st.warnings.forEach(function (w) { console.warn('timeline-stage: slide ' + (i + 1) + ': ' + w); }); });

    var cur = null;
    function draw(view, grow, flags) {
      var x = L.xScale(view, W - LEFT - RIGHT, LEFT), span = view[1] - view[0];
      var every = span > 60 ? 10 : span > 15 ? 5 : span > 8 ? 2 : 1;
      ticks.forEach(function (k) {
        var on = k.yr % every === 0 && k.yr >= view[0] && k.yr <= view[1];
        k.t.style.opacity = on ? 1 : 0; k.l.style.opacity = on ? 1 : 0;
        k.t.setAttribute('x1', x(k.yr)); k.t.setAttribute('x2', x(k.yr)); k.l.setAttribute('x', x(k.yr));
      });
      var gf = function (id) {
        if (grow[id] != null) return grow[id];
        var n = model.index[id];
        if (n && n.kind === 'event') return gf(n.parent);
        if (n && n.line && n.line !== id && grow[n.line] != null) return grow[n.line];
        return -Infinity;
      };
      model.lines.forEach(function (lid) { show(names[lid], gf(lid) > model.index[lid].start); });
      Object.keys(paths).forEach(function (id) {
        var node = model.index[id];
        paths[id].setAttribute('d', L.samplePath(geom, model, id, view, gf(id), x, { end: flags.ends ? undefined : null }));
        paths[id].style.stroke = colourOf(flags.colours || node.kind !== 'branch' ? node.colour : model.index[node.line].colour);
      });
      var evItems = { above: [], below: [] };
      events.forEach(function (e) {
        var n = e.node, on = gf(n.parent) >= n.year - 0.05 && n.year >= view[0] - 0.5 && n.year <= view[1] + 0.5;
        show(e.g, on);
        var px = x(n.year), py = L.yFor(geom, model, n.parent, n.year, { span: span });
        e.g.firstChild.setAttribute('cx', px); e.g.firstChild.setAttribute('cy', py);
        var t = e.g.lastChild, right = px > W - 300, w = L.textWidth(n.label, 14);
        t.setAttribute('x', px + (right ? -10 : 8)); t.setAttribute('text-anchor', right ? 'end' : 'start');
        e.px = px; e.py = py;
        if (on) evItems[n.side === 'below' ? 'below' : 'above'].push({ x: right ? px - 10 - w : px + 8, width: w, e: e });
      });
      ['above', 'below'].forEach(function (side) {
        L.assignLanes(evItems[side], { gap: 10, maxLanes: 3 }).forEach(function (it) {
          var t = it.e.g.lastChild, lane = it.lane;
          t.style.opacity = lane < 0 ? 0 : 1;
          t.setAttribute('y', side === 'below' ? it.e.py + 22 + 16 * Math.max(0, lane) : it.e.py - 12 - 16 * Math.max(0, lane));
        });
      });
      forks.forEach(function (f) {
        var on = f.owners.some(function (o) { return gf(o.id) >= f.fork.at; }) && f.fork.at >= view[0] - 0.5 && f.fork.at <= view[1] + 0.5;
        show(f.g, on);
        var fx = x(f.fork.at), ys = [];
        f.owners.forEach(function (o) {
          ys.push(L.offsetAt(geom, model, o.id, f.fork.at));
          if (!f.fork.kink) f.fork.children.forEach(function (c) { ys.push(L.offsetAt(geom, model, c, f.fork.at + geom.opts.easeYears)); });
        });
        var yTop = Math.min.apply(null, ys) - 8;
        f.fx = fx; f.yTop = yTop;
        var tx = f.g.lastChild, anchor = fx > W - 160 ? 'end' : fx < LEFT + 100 ? 'start' : 'middle', w = L.textWidth(f.fork.label, 15);
        tx.setAttribute('x', fx); tx.setAttribute('text-anchor', anchor);
        f.item = { x: anchor === 'middle' ? fx - w / 2 : anchor === 'end' ? fx - w : fx, width: w, f: f, on: on };
      });
      L.assignLanes(forks.filter(function (f) { return f.item && f.item.on; }).map(function (f) { return f.item; }), { gap: 10, maxLanes: 4 });
      forks.forEach(function (f) {
        var lane = f.item ? f.item.lane : 0, lift = 24 + 22 * Math.max(0, lane);
        var ln = f.g.firstChild, tx = f.g.lastChild;
        ln.setAttribute('x1', f.fx); ln.setAttribute('x2', f.fx); ln.setAttribute('y1', f.yTop - lift); ln.setAttribute('y2', f.yTop + 4);
        tx.setAttribute('y', f.yTop - lift - 6);
        tx.style.opacity = lane < 0 ? 0 : 1;
      });
      crossings.forEach(function (c) {
        var n = c.node, on = gf(n.a.id) >= n.a.year - 0.1 && gf(n.b.id) >= n.b.year - 0.1 && n.a.year >= view[0] - 0.5 && n.a.year <= view[1] + 0.5;
        show(c.g, on);
        var ax = x(n.a.year), bx = x(n.b.year), ay = L.yFor(geom, model, n.a.id, n.a.year, { span: span }), by = L.yFor(geom, model, n.b.id, n.b.year, { span: span });
        var ln = c.g.childNodes[0], mk = c.g.childNodes[1], tx = c.g.childNodes[2];
        ln.setAttribute('x1', ax); ln.setAttribute('y1', ay); ln.setAttribute('x2', bx); ln.setAttribute('y2', by);
        var mx = (ax + bx) / 2, my = (ay + by) / 2;
        mk.setAttribute('cx', mx); mk.setAttribute('cy', my);
        tx.setAttribute('x', mx + (mx > W - 340 ? -16 : 16)); tx.setAttribute('y', my + 5); tx.setAttribute('text-anchor', mx > W - 340 ? 'end' : 'start');
        tx.style.opacity = (span <= 60 || (flags.lit && flags.lit.has(n.id))) ? 1 : 0;
      });
      ends.forEach(function (e, ei) {
        var n = e.node, on = flags.ends && gf(n.id) >= n.end - 0.5 && n.end >= view[0] && n.end <= view[1] + 0.5;
        show(e.g, on);
        var ex = x(n.end), ey = L.offsetAt(geom, model, n.id, n.end), tight = ex > W - 230;
        e.g.firstChild.setAttribute('cx', ex); e.g.firstChild.setAttribute('cy', ey);
        var t = e.g.lastChild; t.setAttribute('x', ex + (tight ? -14 : 14)); t.setAttribute('text-anchor', tight ? 'end' : 'start'); t.setAttribute('y', tight ? (ei % 2 ? ey + 24 : ey - 14) : ey + 5);
      });
    }
    // ---------------------------------------------------------------- lighting
    var litTargets = [];   // [{ el, ids }] : element is lit if any of its ids is lit
    Object.keys(paths).forEach(function (id) { litTargets.push({ el: paths[id], ids: [id] }); });
    events.forEach(function (e) { litTargets.push({ el: e.g, ids: [e.node.id, e.node.parent] }); });
    forks.forEach(function (f) { litTargets.push({ el: f.g, ids: f.owners.map(function (o) { return o.id; }).concat(f.fork.children) }); });
    crossings.forEach(function (c) { litTargets.push({ el: c.g, ids: [c.node.id] }); });
    ends.forEach(function (e) { litTargets.push({ el: e.g, ids: [e.node.id] }); });
    function light(state) {
      var known = new Set(Array.from(state.lit).filter(function (id) { return !!model.index[id]; }));
      var lit = known.size ? L.litSet(model, known) : null;
      litTargets.forEach(function (t) {
        var on = !lit || t.ids.some(function (id) { return lit.has(id); });
        t.el.classList.toggle('is-dim', !on);
      });
      return lit;
    }

    // ---------------------------------------------------------------- pins
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
    function snapshot(state) {
      var grow = {};
      Object.keys(paths).forEach(function (id) { grow[id] = L.growFor(state, model, id); });
      return { v0: state.view[0], v1: state.view[1], grow: grow };
    }
    function frameState(a, flags) {
      // rebuild a grow map from the tweened per-id values
      return { view: [a.v0, a.v1], grow: a.grow, flags: flags };
    }
    function apply(state, instant) {
      cur = state;
      var flags = { colours: state.colours, ends: state.ends, lit: light(state) };
      root.classList.toggle('is-dim', !!state.dim);
      var target = snapshot(state);
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (instant || !anim) {
        anim = target;
        draw([anim.v0, anim.v1], anim.grow, flags);
        return;
      }
      var from = { v0: anim.v0, v1: anim.v1, grow: {} };
      Object.keys(target.grow).forEach(function (id) { from.grow[id] = isFinite(anim.grow[id]) ? anim.grow[id] : (isFinite(target.grow[id]) ? model.index[id].start : -Infinity); });
      var t0 = performance.now(), ms = 800;
      var step = function (now) {
        var t = Math.min(1, (now - t0) / ms), e = L.smooth(t), a = { v0: from.v0 + (target.v0 - from.v0) * e, v1: from.v1 + (target.v1 - from.v1) * e, grow: {} };
        Object.keys(target.grow).forEach(function (id) {
          var f = from.grow[id], g = target.grow[id];
          a.grow[id] = (isFinite(f) && isFinite(g)) ? f + (g - f) * e : (isFinite(g) ? (t < 1 ? model.index[id].start + (g - model.index[id].start) * e : g) : -Infinity);
        });
        anim = a;
        draw([a.v0, a.v1], a.grow, flags);
        if (t < 1) raf = requestAnimationFrame(step); else raf = null;
      };
      raf = requestAnimationFrame(step);
    }
    var first = true;
    function update(instant) {
      var sec = reveal.getCurrentSlide(), idx = sections.indexOf(sec);
      var st = idx >= 0 ? states[idx] : null;
      root.style.opacity = st ? 1 : 0;
      if (st) { apply(st, first || instant === true); placePins(sec, st); }
      first = false;
    }
    reveal.on('overviewshown', function () { update(true); });
    var slides = document.querySelector('.reveal .slides');
    slides.insertBefore(root, slides.firstChild);
    reveal.on('slidechanged', function () { update(false); });
    reveal.on('ready', function () { update(true); });
    if (reveal.isReady()) update(true);
    window.TimelineStageDebug = { model: model, geom: geom, states: states, current: function () { return cur; } };
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
