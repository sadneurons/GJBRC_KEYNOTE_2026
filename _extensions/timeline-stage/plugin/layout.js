/* timeline-stage layout: pure functions. UMD so node tests and the browser share it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StageLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- dates
  var DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  function toDecimalYear(v) {
    if (typeof v === 'number') return v;
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return round2(+m[1] + (DAYS[+m[2] - 1] + +m[3]) / 365.25);
    if ((m = s.match(/^(\d{4})-(\d{2})$/))) return round2(+m[1] + DAYS[+m[2] - 1] / 365.25);
    var n = Number(s);
    return isNaN(n) ? NaN : n;
  }
  function round2(x) { return Math.round(x * 100) / 100; }
  function parseRef(ref) {
    var at = String(ref).lastIndexOf('@');
    return { id: String(ref).slice(0, at), year: toDecimalYear(String(ref).slice(at + 1)) };
  }

  // ---------------------------------------------------------------- normalise
  // model = { span, lines: [lineId...], crossings: [...], index: { id: node } }
  function normalise(raw) {
    var index = {}, lines = [], crossings = [];
    var minY = Infinity, maxY = -Infinity;
    function see(y) { if (isFinite(y)) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }

    (raw.lines || []).forEach(function (L) {
      var line = {
        id: L.id, kind: 'line', line: L.id, parent: null, label: L.label || L.id,
        start: toDecimalYear(L.start), end: L.end == null ? null : toDecimalYear(L.end),
        colour: L.colour || 'primary', band: L.band || null,
        strands: [], children: [], forks: [], events: [], meets: []
      };
      see(line.start); see(line.end);
      index[line.id] = line; lines.push(line.id);
      (L.strands || []).forEach(function (S) {
        var s = { id: S.id, kind: 'strand', line: L.id, parent: L.id, label: S.label || S.id,
          start: toDecimalYear(S.start), end: S.end == null ? null : toDecimalYear(S.end),
          colour: S.colour || line.colour, events: [], forks: [] };
        see(s.start); see(s.end);
        index[s.id] = s; line.strands.push(s.id);
      });
      (L.meets || []).forEach(function (M) { line.meets.push({ a: M[0], b: M[1], year: toDecimalYear(M[2]) }); });
      // fork tree
      function addForks(node, forks) {
        (forks || []).forEach(function (F) {
          var fork = { at: toDecimalYear(F.at), label: F.label || '', children: [], kink: false, emphasis: !!F.emphasis };
          (F.children || []).forEach(function (C) {
            var child = { id: C.id, kind: 'branch', line: L.id, parent: node.id, label: C.label || C.id,
              start: fork.at, end: C.end == null ? null : toDecimalYear(C.end), endLabel: C['end-label'] || C.label || '',
              colour: C.colour || node.colour, children: [], forks: [], events: [] };
            see(child.end);
            index[child.id] = child; node.children.push(child.id); fork.children.push(child.id);
            addForks(child, C.forks);
          });
          node.forks.push(fork);
        });
      }
      addForks(line, L.forks);
      (L['forks-on'] || []).forEach(function (K) {
        (K.branches || []).forEach(function (bid) {
          var b = index[bid];
          if (!b) return;
          b.forks.push({ at: toDecimalYear(K.at), label: K.label || '', children: [bid], kink: true, emphasis: !!K.emphasis });
          b.forks.sort(function (p, q) { return p.at - q.at; });
        });
      });
      (L.events || []).forEach(function (E) {
        var ev = { id: E.id, kind: 'event', line: L.id, parent: E.on || L.id, label: E.label || '',
          year: toDecimalYear(E.year), side: E.side || 'above', end: !!E.end, lane: E.lane == null ? null : +E.lane };
        see(ev.year);
        index[ev.id] = ev; (index[ev.parent] || line).events.push(ev.id);
      });
    });
    (raw.crossings || []).forEach(function (X) {
      var a = parseRef(X.a), b = parseRef(X.b);
      var x = { id: X.id, kind: 'crossing', a: a, b: b, label: X.label || '' };
      index[x.id] = x; crossings.push(x.id);
    });
    var span = raw.span ? raw.span.map(toDecimalYear) : [Math.floor(minY) - 2, Math.ceil(maxY) + 2];
    return { span: span, lines: lines, crossings: crossings, index: index, options: raw.options || {} };
  }

  // ---------------------------------------------------------------- validate
  function validate(raw) {
    var errs = [], ids = {};
    function err(path, message) { errs.push({ path: path, message: message }); }
    function claim(id, path) {
      if (id == null) { err(path, 'missing id'); return; }
      if (ids[id]) err(path, 'duplicate id "' + id + '"'); else ids[id] = path;
    }
    var years = {};  // id -> [start, end|null]
    function date(v, path, key) {
      if (v == null) { err(path, 'missing ' + key); return NaN; }
      var y = toDecimalYear(v);
      if (!isFinite(y)) err(path, key + ' "' + v + '" is not a year or ISO date');
      return y;
    }
    (raw.lines || []).forEach(function (L, i) {
      var p = 'lines[' + i + ']';
      claim(L.id, p);
      date(L.start, p, 'start');
      var ls = toDecimalYear(L.start), le = L.end == null ? null : toDecimalYear(L.end);
      years[L.id] = [ls, le];
      (L.strands || []).forEach(function (S, j) {
        claim(S.id, p + '.strands[' + j + ']');
        years[S.id] = [toDecimalYear(S.start), S.end == null ? null : toDecimalYear(S.end)];
      });
      function walk(node, nodeStart, nodeEnd, path) {
        (node.forks || []).forEach(function (F, k) {
          var fp = path + '.forks[' + k + ']', at = toDecimalYear(F.at);
          if (at < nodeStart) err(fp, 'fork at ' + at + ' is before branch start ' + nodeStart);
          if (nodeEnd != null && at > nodeEnd) err(fp, 'fork at ' + at + ' is after branch end ' + nodeEnd);
          (F.children || []).forEach(function (C, c) {
            var cp = fp + '.children[' + c + ']';
            claim(C.id, cp);
            var ce = C.end == null ? null : toDecimalYear(C.end);
            if (ce != null && ce < at) err(cp, 'end ' + ce + ' is before fork at ' + at);
            years[C.id] = [at, ce];
            walk(C, at, ce, cp);
          });
        });
      }
      walk(L, ls, le, p);
      (L['forks-on'] || []).forEach(function (K, k) {
        (K.branches || []).forEach(function (bid) {
          if (!years[bid]) err(p + '.forks-on[' + k + ']', 'unknown id "' + bid + '"');
        });
      });
      (L.events || []).forEach(function (E, k) {
        var ep = p + '.events[' + k + ']';
        claim(E.id, ep);
        if (E.on && !years[E.on]) err(ep, 'unknown id "' + E.on + '"');
      });
      (L.meets || []).forEach(function (M, k) {
        [M[0], M[1]].forEach(function (sid) { if (!years[sid]) err(p + '.meets[' + k + ']', 'unknown id "' + sid + '"'); });
      });
    });
    (raw.crossings || []).forEach(function (X, i) {
      var p = 'crossings[' + i + ']';
      claim(X.id, p);
      ['a', 'b'].forEach(function (k) {
        var r = parseRef(X[k]);
        if (!years[r.id]) { err(p, 'unknown id "' + r.id + '"'); return; }
        var y = years[r.id];
        if (r.year < y[0] || (y[1] != null && r.year > y[1])) err(p, 'crossing endpoint "' + X[k] + '" is outside that id\'s years');
      });
    });
    return errs;
  }

  // ---------------------------------------------------------------- layout
  var DEFAULTS = { height: 720, top: 90, bottom: 560, easeYears: 3, kink: 6, strandGap: 28, spread: 0.8, gap: 0.06 };
  function opt(opts, k) { return opts && opts[k] != null ? opts[k] : DEFAULTS[k]; }
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  // real (non-kink) children of a node, in file order
  function realChildren(node) {
    var out = [];
    node.forks.forEach(function (f) { if (!f.kink) f.children.forEach(function (c) { out.push(c); }); });
    return out;
  }
  function leaves(model, id, acc) {
    var kids = realChildren(model.index[id]);
    if (!kids.length) acc.push(id); else kids.forEach(function (c) { leaves(model, c, acc); });
    return acc;
  }

  function layout(model, opts) {
    var top = opt(opts, 'top'), bottom = opt(opts, 'bottom'), spread = opt(opts, 'spread');
    var strandGap = opt(opts, 'strandGap');
    var gapPx = opt(opts, 'gap') * (bottom - top);
    var weights = {}, total = 0;
    model.lines.forEach(function (lid) {
      var line = model.index[lid];
      var w = Math.max(leaves(model, lid, []).length, 1 + line.strands.length);
      if (line.band) w = line.band;
      weights[lid] = w; total += w;
    });
    var avail = (bottom - top) - gapPx * Math.max(0, model.lines.length - 1);
    var bands = {}, targets = {}, y = top;
    model.lines.forEach(function (lid) {
      var line = model.index[lid];
      var h = avail * weights[lid] / total;
      var band = { y0: y, y1: y + h, centre: y + h / 2, weight: weights[lid], height: h };
      bands[lid] = band;
      // leaf targets spread evenly across spread*h, centred on the band
      var lv = leaves(model, lid, []), k = lv.length, sh = spread * h;
      lv.forEach(function (id, i) { targets[id] = band.centre - sh / 2 + sh * (i + 0.5) / k; });
      // internal nodes: mean of their leaves
      (function fill(id) {
        var kids = realChildren(model.index[id]);
        if (!kids.length) return targets[id];
        var sum = 0; kids.forEach(function (c) { sum += fill(c); });
        targets[id] = sum / kids.length;
        return targets[id];
      })(lid);
      targets[lid] = band.centre;   // the line itself runs along the band centre
      line.strands.forEach(function (sid, i) { targets[sid] = band.centre + strandGap * (i + 1); });
      y += h + gapPx;
    });
    return { bands: bands, targets: targets, opts: { easeYears: opt(opts, 'easeYears'), kink: opt(opts, 'kink'), strandGap: strandGap } };
  }

  function ancestry(model, id) {
    var path = [], n = model.index[id];
    while (n) { path.unshift(n.id); n = n.parent ? model.index[n.parent] : null; }
    return path;
  }
  function siblingIndex(model, id) {
    var n = model.index[id], p = n.parent ? model.index[n.parent] : null;
    if (!p) return 0;
    var kids = realChildren(p);
    return Math.max(0, kids.indexOf(id));
  }

  // y of a line or branch at a year: eased through each ancestor fork, with kinks
  function offsetAt(geom, model, id, year) {
    var node = model.index[id];
    if (!node) return NaN;
    if (node.kind === 'strand') return strandLane(geom, model, id);
    if (node.kind === 'event') return yAt(geom, model, node.parent + '@' + node.year);
    if (node.end != null) year = Math.min(year, node.end);
    var path = ancestry(model, id), ease = geom.opts.easeYears, kink = geom.opts.kink;
    var y = geom.bands[node.line].centre;
    for (var i = 1; i < path.length; i++) {
      var child = model.index[path[i]], parent = model.index[path[i - 1]];
      if (year < child.start) return y;
      y += (geom.targets[child.id] - geom.targets[parent.id]) * smooth((year - child.start) / ease);
    }
    // kinks on every node along the path
    path.forEach(function (pid) {
      var n = model.index[pid], si = siblingIndex(model, pid), ki = 0;
      n.forks.forEach(function (f) {
        if (!f.kink) return;
        var sign = (si + ki) % 2 === 0 ? -1 : 1; ki += 1;
        if (year >= f.at) y += sign * kink * smooth((year - f.at) / ease);
      });
    });
    return y;
  }
  function strandLane(geom, model, sid) { return geom.targets[sid]; }

  function yAt(geom, model, ref) {
    var r = parseRef(ref);
    return offsetAt(geom, model, r.id, r.year);
  }

  // ---------------------------------------------------------------- paths
  function xScale(view, width, left) {
    return function (year) { return left + (year - view[0]) / (view[1] - view[0]) * width; };
  }
  // strand y with bows towards the strands it meets, damped at wide spans
  function strandY(geom, model, sid, year, opts) {
    var node = model.index[sid], base = geom.targets[sid];
    if (!node || node.kind !== 'strand') return base;
    var line = model.index[node.line], span = (opts && opts.span) || 50, bow = (opts && opts.bow) || 12;
    var y = base;
    line.meets.forEach(function (m) {
      if (m.a !== sid && m.b !== sid) return;
      var d = Math.abs(year - m.year);
      if (d >= 0.8) return;
      var other = m.a === sid ? m.b : m.a;
      var mid = (geom.targets[m.a] + geom.targets[m.b]) / 2;
      var amp = Math.min(Math.abs(mid - base), bow) * (mid > base ? 1 : -1);
      y += amp * smooth(1 - d / 0.8) * Math.min(1, 14 / span);
    });
    return y;
  }
  function yFor(geom, model, id, year, opts) {
    var node = model.index[id];
    return node.kind === 'strand' ? strandY(geom, model, id, year, opts) : offsetAt(geom, model, id, year);
  }
  // SVG path for a line, strand or branch, drawn from its start to min(grow, end)
  function samplePath(geom, model, id, view, grow, x, opts) {
    var node = model.index[id];
    if (!node) return '';
    var start = node.start;
    var end = (opts && opts.end === null) ? model.span[1] : (node.end != null ? node.end : model.span[1]);
    // a node that forks into real children ends where it forks; the children carry on
    (node.forks || []).forEach(function (f) { if (!f.kink) end = Math.min(end, f.at); });
    var stop = Math.min(grow, end, model.span[1]);
    if (!(stop > start)) return '';
    var o = { span: view[1] - view[0], bow: opts && opts.bow };
    var step = Math.max(0.1, (view[1] - view[0]) / 400), pts = [];
    for (var yr = start; yr < stop; yr += step) pts.push(x(yr).toFixed(1) + ',' + yFor(geom, model, id, yr, o).toFixed(1));
    pts.push(x(stop).toFixed(1) + ',' + yFor(geom, model, id, stop, o).toFixed(1));
    return 'M' + pts.join(' L');
  }

  // ---------------------------------------------------------------- labels
  function textWidth(label, fontSize) { return String(label).length * 0.56 * (fontSize || 15); }
  // items: [{ x (left edge), width }] -> same objects with .lane (0..maxLanes-1 or -1 when hidden)
  function assignLanes(items, opts) {
    var gap = (opts && opts.gap != null) ? opts.gap : 8, maxLanes = (opts && opts.maxLanes) || 3;
    var order = items.map(function (it, i) { return i; }).sort(function (a, b) { return items[a].x - items[b].x; });
    var ends = {};   // group -> [lane end x]
    order.forEach(function (i) {
      var it = items[i], grp = it.group == null ? '' : String(it.group), e = ends[grp] || (ends[grp] = []);
      var lane = -1;
      if (it.lane != null && it.lane >= 0) lane = it.lane;             // preset by the author
      else for (var k = 0; k < maxLanes; k++) { if (e[k] == null || e[k] + gap <= it.x) { lane = k; break; } }
      it.lane = lane;
      if (lane >= 0) e[lane] = Math.max(e[lane] || -Infinity, it.x + it.width);
    });
    return items;
  }

  // ---------------------------------------------------------------- slide states
  // sections: [{ attrs: { view, grow, lit, dim, colours, ends } | null }]
  function resolveStates(sections, model) {
    var prev = { view: model.span.slice(), grow: {}, colours: true, ends: true };
    return sections.map(function (sec) {
      if (!sec || !sec.attrs) return null;
      var a = sec.attrs, warnings = [];
      var view = prev.view;
      if (a.view) {
        var v = String(a.view).split('-').map(function (s) { return toDecimalYear(s.trim()); });
        if (v.length === 2 && isFinite(v[0]) && isFinite(v[1]) && v[1] > v[0]) view = v; else warnings.push('bad view "' + a.view + '"');
      }
      var grow = {};
      for (var k in prev.grow) grow[k] = prev.grow[k];
      if (a.grow) String(a.grow).trim().split(/\s+/).forEach(function (tok) {
        if (!tok) return;
        var at = tok.lastIndexOf(':'), id = tok.slice(0, at), yr = toDecimalYear(tok.slice(at + 1));
        if (at < 0 || !isFinite(yr)) { warnings.push('bad grow "' + tok + '"'); return; }
        if (!model.index[id]) warnings.push('unknown id "' + id + '" in grow');
        grow[id] = yr;
      });
      var lit = new Set();
      if (a.lit) String(a.lit).trim().split(/[\s,]+/).forEach(function (id) {
        if (!id) return;
        if (!model.index[id]) warnings.push('unknown id "' + id + '" in lit');
        lit.add(id);
      });
      var bool = function (v, d) { return v == null || v === '' ? d : !/^(false|0|no|off)$/i.test(String(v)); };
      var state = { view: view, grow: grow, lit: lit, dim: bool(a.dim, false), colours: bool(a.colours, prev.colours), ends: bool(a.ends, prev.ends), warnings: warnings };
      prev = { view: view, grow: grow, colours: state.colours, ends: state.ends };
      return state;
    });
  }
  // growth for an id: its own value, else its line's, else nothing
  function growFor(state, model, id) {
    if (state.grow[id] != null) return state.grow[id];
    var node = model.index[id];
    if (node && node.line && node.line !== id && state.grow[node.line] != null) return state.grow[node.line];
    return -Infinity;
  }

  // ---------------------------------------------------------------- lighting
  // a lit id lights its ancestors back to the line start; a lit line lights its strands and events;
  // a lit crossing lights only itself. Returns the full set of lit ids.
  function litSet(model, lit) {
    var out = new Set();
    lit.forEach(function (id) {
      var n = model.index[id];
      if (!n) return;
      if (n.kind === 'crossing') { out.add(id); return; }
      ancestry(model, id).forEach(function (a) { out.add(a); });
      if (n.kind === 'line') {
        n.strands.forEach(function (s) { out.add(s); });
        n.events.forEach(function (e) { out.add(e); });
        n.strands.forEach(function (s) { model.index[s].events.forEach(function (e) { out.add(e); }); });
      }
      if (n.events) n.events.forEach(function (e) { out.add(e); });
    });
    return out;
  }

  return { toDecimalYear: toDecimalYear, parseRef: parseRef, normalise: normalise, validate: validate,
    layout: layout, offsetAt: offsetAt, yAt: yAt, smooth: smooth, leaves: leaves, realChildren: realChildren, ancestry: ancestry,
    xScale: xScale, strandY: strandY, yFor: yFor, samplePath: samplePath, textWidth: textWidth, assignLanes: assignLanes,
    resolveStates: resolveStates, growFor: growFor, litSet: litSet };
});
