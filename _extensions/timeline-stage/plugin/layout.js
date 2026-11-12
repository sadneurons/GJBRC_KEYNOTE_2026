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
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return round3(+m[1] + (DAYS[+m[2] - 1] + +m[3]) / 365.25);
    if ((m = s.match(/^(\d{4})-(\d{2})$/))) return round3(+m[1] + DAYS[+m[2] - 1] / 365.25);
    var n = Number(s);
    return isNaN(n) ? NaN : n;
  }
  function round3(x) { return Math.round(x * 1000) / 1000; }   // a third of a day: neighbouring dates stay distinct
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
        start: toDecimalYear(L.start), end: L.end == null ? null : toDecimalYear(L.end), endLabel: L['end-label'] || '',
        colour: L.colour || 'primary', band: L.band || null,
        strands: [], children: [], forks: [], events: [], meets: []
      };
      see(line.start); see(line.end);
      index[line.id] = line; lines.push(line.id);
      (L.strands || []).forEach(function (S) {
        var s = { id: S.id, kind: 'strand', line: L.id, parent: L.id, label: S.label || '',
          start: toDecimalYear(S.start), end: S.end == null ? null : toDecimalYear(S.end),
          // lane: which row under the line the strand runs in (1 = nearest); strands that never
          // overlap in time can share one. Default: one row each, in file order.
          lane: S.lane == null ? null : Math.max(1, Math.round(+S.lane)),
          colour: S.colour || line.colour, events: [], forks: [] };
        see(s.start); see(s.end);
        index[s.id] = s; line.strands.push(s.id);
      });
      (L.meets || []).forEach(function (M) { line.meets.push({ a: M[0], b: M[1], year: toDecimalYear(M[2]) }); });
      // fork tree
      function addForks(node, forks) {
        (forks || []).forEach(function (F) {
          var fork = { at: toDecimalYear(F.at), label: F.label || '', children: [], kink: false, emphasis: !!F.emphasis,
            ease: F.ease == null ? null : +F.ease };
          (F.children || []).forEach(function (C) {
            // label names the branch where it leaves the fork; end-label is what its ending says
            var child = { id: C.id, kind: 'branch', line: L.id, parent: node.id, label: C.label || '',
              start: fork.at, end: C.end == null ? null : toDecimalYear(C.end), endLabel: C['end-label'] || '', ease: fork.ease,
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
          b.forks.push({ at: toDecimalYear(K.at), label: K.label || '', children: [bid], kink: true, emphasis: !!K.emphasis,
            ease: K.ease == null ? null : +K.ease });
          b.forks.sort(function (p, q) { return p.at - q.at; });
        });
      });
      (L.events || []).forEach(function (E) {
        var ev = { id: E.id, kind: 'event', line: L.id, parent: E.on || L.id, label: E.label || '',
          year: toDecimalYear(E.year), side: E.side || null, end: !!E.end, lane: E.lane == null ? null : +E.lane,
          // a note and pictures the event can open: `date` as written, `text` in full, `img` one or more paths
          date: E.date == null ? '' : String(E.date), text: E.text || '', planned: !!E.planned,
          img: (E.img == null ? [] : Array.isArray(E.img) ? E.img : String(E.img).split('|'))
            .map(function (v) { return String(v).trim(); }).filter(Boolean) };
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
          if (F.ease != null && !(+F.ease > 0)) err(fp, 'ease "' + F.ease + '" is not a positive number of years');
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

  function strandLaneOf(model, sid, i) { var s = model.index[sid]; return s.lane != null ? s.lane : i + 1; }
  function strandDepth(model, line) {
    var d = 0;
    line.strands.forEach(function (sid, i) { d = Math.max(d, strandLaneOf(model, sid, i)); });
    return d;
  }

  function layout(model, opts) {
    var top = opt(opts, 'top'), bottom = opt(opts, 'bottom'), spread = opt(opts, 'spread');
    var strandGap = opt(opts, 'strandGap');
    var gapPx = opt(opts, 'gap') * (bottom - top);
    var weights = {}, total = 0;
    model.lines.forEach(function (lid) {
      var line = model.index[lid];
      var w = Math.max(leaves(model, lid, []).length, 1 + strandDepth(model, line));
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
      // the line and its strands sit as one group centred in the band; without strands the line
      // runs along the band centre
      var base = band.centre - strandGap * strandDepth(model, line) / 2;
      targets[lid] = base;
      line.strands.forEach(function (sid, i) { targets[sid] = base + strandGap * strandLaneOf(model, sid, i); });
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
    var y = geom.targets[node.line];
    for (var i = 1; i < path.length; i++) {
      var child = model.index[path[i]], parent = model.index[path[i - 1]];
      if (year < child.start) return y;
      y += (geom.targets[child.id] - geom.targets[parent.id]) * smooth((year - child.start) / (child.ease || ease));
    }
    // kinks on every node along the path
    path.forEach(function (pid) {
      var n = model.index[pid], si = siblingIndex(model, pid), ki = 0;
      n.forks.forEach(function (f) {
        if (!f.kink) return;
        var sign = (si + ki) % 2 === 0 ? -1 : 1; ki += 1;
        if (year >= f.at) y += sign * kink * smooth((year - f.at) / (f.ease || ease));
      });
    });
    return y;
  }
  function strandLane(geom, model, sid) { return geom.targets[sid]; }
  // how many years a fork (or kink) takes to open: its own `ease`, else the layout's
  function easeOf(geom, fork) { return (fork && fork.ease) || geom.opts.easeYears; }

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
        // a bare year grows every line to that year and forgets earlier per-id growth
        if (at < 0 && isFinite(yr)) { grow = { '*': yr }; return; }
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
      var now = null;
      if (a.now != null && a.now !== '') {
        now = toDecimalYear(a.now);
        if (!isFinite(now)) { warnings.push('bad now "' + a.now + '"'); now = null; }
      }
      // hold: events kept back on this slide although their line has grown past them
      var hold = new Set();
      if (a.hold) String(a.hold).trim().split(/[\s,]+/).forEach(function (id) {
        if (!id) return;
        if (!model.index[id] || model.index[id].kind !== 'event') warnings.push('unknown event "' + id + '" in hold');
        hold.add(id);
      });
      var state = { view: view, grow: grow, lit: lit, now: now, hold: hold, dim: bool(a.dim, false), colours: bool(a.colours, prev.colours), ends: bool(a.ends, prev.ends), warnings: warnings };
      prev = { view: view, grow: grow, colours: state.colours, ends: state.ends };
      return state;
    });
  }
  // growth for an id: its own value, else its line's, else nothing
  function growFor(state, model, id) {
    if (state.grow[id] != null) return state.grow[id];
    var node = model.index[id];
    if (node && node.line && node.line !== id && state.grow[node.line] != null) return state.grow[node.line];
    if (state.grow['*'] != null) return state.grow['*'];
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
      // a strand runs beside its line, not out of it: lighting one lights it and its events only
      if (n.kind === 'strand') { out.add(id); n.events.forEach(function (e) { out.add(e); }); return; }
      ancestry(model, id).forEach(function (a) { out.add(a); });
      if (n.kind === 'line') {
        n.strands.forEach(function (s) { out.add(s); });
        n.strands.forEach(function (s) { model.index[s].events.forEach(function (e) { out.add(e); }); });
        // the whole tree under the line, with every branch's events
        (function walk(b) {
          out.add(b.id);
          (b.events || []).forEach(function (e) { out.add(e); });
          realChildren(b).forEach(function (c) { walk(model.index[c]); });
        })(n);
      }
      if (n.events) n.events.forEach(function (e) { out.add(e); });
    });
    return out;
  }

  // items: [{ x }] -> same objects with .rank: 0 for the first of a cluster, 1, 2, ... for each
  // later item within `gap` px of the previous one. Used to stack labels that would overlap.
  function jitterRanks(items, opts) {
    var gap = (opts && opts.gap) || 20;
    var order = items.map(function (it, i) { return i; }).sort(function (a, b) { return items[a].x - items[b].x; });
    var lastX = [];   // rank -> x of the last label given that rank
    order.forEach(function (i) {
      var it = items[i], r = 0;
      while (lastX[r] != null && it.x - lastX[r] < gap) r += 1;
      it.rank = r; lastX[r] = it.x;
    });
    return items;
  }

  // ---------------------------------------------------------------- label placement
  function overlap(a, b, pad) { return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad; }
  function anyOverlap(A, B, pad) {
    for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) if (overlap(A[i], B[j], pad)) return true;
    return false;
  }
  // items: [{ boxes: [{x0,y0,x1,y1}], priority, group? }] -> same objects with .keep.
  // Highest priority first; a label is dropped when it leaves `bounds`, touches an `obstacles` box
  // or overlaps a label already kept. Labels of one group never hide each other.
  function placeLabels(items, opts) {
    var pad = opts && opts.pad != null ? opts.pad : 3, bounds = opts && opts.bounds, obstacles = (opts && opts.obstacles) || [];
    var order = items.map(function (it, i) { return i; }).sort(function (a, b) { return (items[b].priority - items[a].priority) || (a - b); });
    var kept = [];
    order.forEach(function (i) {
      var it = items[i], ok = true;
      if (bounds) ok = it.boxes.every(function (b) { return b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1; });
      if (ok && obstacles.length) ok = !anyOverlap(it.boxes, obstacles, pad);
      for (var k = 0; ok && k < kept.length; k++) {
        if (it.group != null && kept[k].group === it.group) continue;
        if (anyOverlap(it.boxes, kept[k].boxes, pad)) ok = false;
      }
      it.keep = ok;
      if (ok) kept.push(it);
    });
    return items;
  }
  // boxes along a 45-degree label: one whose baseline ends at (ex, ey) and hangs down and to the
  // left, or (up) one whose baseline starts at (ex, ey) and rises up and to the right
  function diagBoxes(ex, ey, len, size, step, up) {
    var c = Math.SQRT1_2, h = size * 0.3, half = size / 2, out = [], dir = up ? 1 : -1;
    step = step || size * 0.6;
    for (var t = half; t < len + step; t += step) {
      var tt = Math.min(t, len), cx = ex + dir * tt * c - h * c, cy = ey - dir * tt * c - h * c;
      out.push({ x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half });
      if (tt === len) break;
    }
    return out;
  }
  // 45-degree labels are parallel, so two of them collide when they are close across the slant and
  // overlap along it. items: [{ x, y, len, up }] (the event's point, its label's length, and whether
  // the label rises from the point instead of hanging from it) -> same objects with .rank: how many
  // steps of `shift` px (down and to the right) the label moves to clear the ones before it.
  function stackDiagonal(items, opts) {
    var gap = (opts && opts.gap) || 22, shift = ((opts && opts.shift) || 18) * Math.SQRT2, max = (opts && opts.max) || 5;
    var c = Math.SQRT1_2, placed = [];
    var order = items.map(function (it, i) { return i; }).sort(function (a, b) {
      return (items[a].x + items[a].y) - (items[b].x + items[b].y) || a - b;
    });
    order.forEach(function (i) {
      // the label's near end sits 12.7px straight below its point (above, when it rises): 9 across, 9 along
      var it = items[i], off = 9, u = (it.x + it.y) * c + (it.up ? -off : off), w = (it.x - it.y) * c;
      var w0 = it.up ? w + off : w - off - it.len, w1 = it.up ? w + off + it.len : w - off, k = 0;
      var clash = function (ue) {
        return placed.some(function (p) { return Math.abs(ue - p.u) < gap && w0 < p.w1 + 6 && p.w0 < w1 + 6; });
      };
      while (k < max && clash(u + k * shift)) k += 1;
      it.rank = k;
      placed.push({ u: u + k * shift, w0: w0, w1: w1 });
    });
    return items;
  }

  // years between axis labels so that neighbours sit at least `minPx` apart
  function tickStep(pxPerYear, minPx) {
    var steps = [1, 2, 5, 10, 20, 25, 50, 100], min = minPx || 90;
    for (var i = 0; i < steps.length; i++) if (steps[i] * pxPerYear >= min) return steps[i];
    return 100;
  }

  return { toDecimalYear: toDecimalYear, parseRef: parseRef, normalise: normalise, validate: validate, jitterRanks: jitterRanks,
    easeOf: easeOf, placeLabels: placeLabels, diagBoxes: diagBoxes, stackDiagonal: stackDiagonal, tickStep: tickStep,
    layout: layout, offsetAt: offsetAt, yAt: yAt, smooth: smooth, leaves: leaves, realChildren: realChildren, ancestry: ancestry,
    xScale: xScale, strandY: strandY, yFor: yFor, samplePath: samplePath, textWidth: textWidth, assignLanes: assignLanes,
    resolveStates: resolveStates, growFor: growFor, litSet: litSet };
});
