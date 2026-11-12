-- timeline-stage: Quarto filter.
-- Reads timeline.yml, converts dates to decimal years, embeds it as JSON,
-- marks `.stage` slides, and turns `.caption` / `.plate` / `.cover` / `.pin` divs into overlays.

local DATE_KEYS = { start = true, ["end"] = true, year = true, at = true }

-- "1949-06-09" -> 1949.438 ; "1949-06" -> 1949.413 ; "1949" / 1949 -> 1949
local function to_decimal_year(v)
  if type(v) == "number" then return v end
  local s = tostring(v)
  local y, m, d = s:match("^(%d%d%d%d)%-(%d%d)%-(%d%d)$")
  if not y then y, m = s:match("^(%d%d%d%d)%-(%d%d)$"); d = m and "0" or nil end
  if not y then
    local n = tonumber(s)
    return n
  end
  local days = { 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334 }
  local doy = days[tonumber(m)] + tonumber(d)
  local dec = tonumber(y) + doy / 365.25
  return math.floor(dec * 1000 + 0.5) / 1000
end

local function meta_to_lua(v)
  local t = pandoc.utils.type(v)
  if t == "boolean" then return v end
  if t == "List" then
    local out = {}
    for i, x in ipairs(v) do out[i] = meta_to_lua(x) end
    return out
  end
  if t == "Meta" or t == "table" then
    local out = {}
    for k, x in pairs(v) do out[k] = meta_to_lua(x) end
    return out
  end
  -- Inlines / Blocks / string
  local s = pandoc.utils.stringify(v)
  local n = tonumber(s)
  if n ~= nil and s:match("^%-?%d+%.?%d*$") then return n end
  return s
end

local function convert_dates(node, key)
  if type(node) ~= "table" then
    if key and DATE_KEYS[key] and (type(node) == "string" or type(node) == "number") then
      local y = to_decimal_year(node)
      if y == nil then return "INVALID:" .. tostring(node) end
      return y
    end
    return node
  end
  local is_list = #node > 0
  for k, v in pairs(node) do
    if is_list and key == "span" then
      node[k] = to_decimal_year(v)
    elseif is_list and key == "meets" and type(v) == "table" and #v == 3 then
      v[3] = to_decimal_year(v[3])
    elseif (k == "a" or k == "b") and type(v) == "string" and v:find("@") then
      local id, yr = v:match("^(.-)@(.+)$")
      node[k] = id .. "@" .. tostring(to_decimal_year(yr))
    else
      node[k] = convert_dates(v, is_list and key or k)
    end
  end
  return node
end

local function read_timeline(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("a"); f:close()
  local doc = pandoc.read("---\n" .. text .. "\n---\n", "markdown")
  local data = meta_to_lua(doc.meta)
  return convert_dates(data, nil)
end

-- Validation: the same five rules as layout.js validate(); messages name the path and id.
local function validate(data)
  local errs, ids, years = {}, {}, {}
  local function err(path, msg) errs[#errs + 1] = path .. ": " .. msg end
  local function claim(id, path)
    if id == nil then err(path, "missing id"); return end
    if ids[id] then err(path, 'duplicate id "' .. id .. '"') else ids[id] = path end
  end
  local function parse_ref(ref)
    local id, yr = tostring(ref):match("^(.-)@(.+)$")
    return id, tonumber(yr)
  end
  -- a date that failed to parse arrives as "INVALID:<text>"; a missing one as nil
  local function date(v, path, key, required)
    if v == nil then
      if required then err(path, "missing " .. key) end
      return nil
    end
    if type(v) == "string" then
      local bad = v:match("^INVALID:(.*)$")
      err(path, key .. ' "' .. (bad or v) .. '" is not a year or ISO date')
      return nil
    end
    return v
  end
  for i, L in ipairs(data.lines or {}) do
    local p = "lines[" .. (i - 1) .. "]"
    claim(L.id, p)
    local ls, le = date(L.start, p, "start", true), date(L["end"], p, "end")
    years[L.id] = { ls or -math.huge, le }
    for j, S in ipairs(L.strands or {}) do
      local sp = p .. ".strands[" .. (j - 1) .. "]"
      claim(S.id, sp)
      years[S.id] = { date(S.start, sp, "start", true) or -math.huge, date(S["end"], sp, "end") }
    end
    local function walk(node, nstart, nend, path)
      for k, F in ipairs(node.forks or {}) do
        local fp = path .. ".forks[" .. (k - 1) .. "]"
        local at = date(F.at, fp, "at", true)
        if at then
          if at < nstart then err(fp, "fork at " .. at .. " is before branch start " .. nstart) end
          if nend ~= nil and at > nend then err(fp, "fork at " .. at .. " is after branch end " .. nend) end
        end
        if F.ease ~= nil and not (type(F.ease) == "number" and F.ease > 0) then
          err(fp, 'ease "' .. tostring(F.ease) .. '" is not a positive number of years')
        end
        for c, C in ipairs(F.children or {}) do
          local cp = fp .. ".children[" .. (c - 1) .. "]"
          claim(C.id, cp)
          local ce = date(C["end"], cp, "end")
          if at and ce ~= nil and ce < at then err(cp, "end " .. ce .. " is before fork at " .. at) end
          years[C.id] = { at or nstart, ce }
          walk(C, at or nstart, ce, cp)
        end
      end
    end
    walk(L, ls or -math.huge, le, p)
    for k, K in ipairs(L["forks-on"] or {}) do
      date(K.at, p .. ".forks-on[" .. (k - 1) .. "]", "at", true)
      for _, bid in ipairs(K.branches or {}) do
        if not years[bid] then err(p .. ".forks-on[" .. (k - 1) .. "]", 'unknown id "' .. bid .. '"') end
      end
    end
    for k, E in ipairs(L.events or {}) do
      local ep = p .. ".events[" .. (k - 1) .. "]"
      claim(E.id, ep)
      date(E.year, ep, "year", true)
      if E.on and not years[E.on] then err(ep, 'unknown id "' .. E.on .. '"') end
    end
    for k, M in ipairs(L.meets or {}) do
      for _, sid in ipairs({ M[1], M[2] }) do
        if not years[sid] then err(p .. ".meets[" .. (k - 1) .. "]", 'unknown id "' .. tostring(sid) .. '"') end
      end
    end
  end
  for i, X in ipairs(data.crossings or {}) do
    local p = "crossings[" .. (i - 1) .. "]"
    claim(X.id, p)
    for _, k in ipairs({ "a", "b" }) do
      local id, yr = parse_ref(X[k])
      if not id or not years[id] then
        err(p, 'unknown id "' .. tostring(id) .. '"')
      elseif yr == nil then
        err(p, 'crossing endpoint "' .. tostring(X[k]) .. '" is not a year or ISO date')
      else
        local y = years[id]
        if yr < y[1] or (y[2] ~= nil and yr > y[2]) then err(p, 'crossing endpoint "' .. tostring(X[k]) .. '" is outside that id\'s years') end
      end
    end
  end
  return errs
end

local embedded = false

local function Meta(meta)
  if embedded then return end
  local path = "timeline.yml"
  if meta.stage and meta.stage.timeline then path = pandoc.utils.stringify(meta.stage.timeline) end
  local data = read_timeline(path)
  if not data then
    quarto.log.error("timeline-stage: cannot read " .. path)
    os.exit(1)
  end
  local errs = validate(data)
  if #errs > 0 then
    for _, e in ipairs(errs) do quarto.log.error("timeline-stage: " .. e) end
    os.exit(1)
  end
  local json = pandoc.json.encode(data)
  quarto.doc.include_text("after-body",
    '<script type="application/json" id="stage-data">' .. json .. "</script>")
  embedded = true
end

local function Header(h)
  if h.classes:includes("stage") then
    h.attributes["transition"] = "none"
  end
  return h
end

local OVERLAYS = { "pin", "cover", "plate", "caption" }

local function Div(d)
  local kind = nil
  for _, k in ipairs(OVERLAYS) do
    if d.classes:includes(k) then kind = k; break end
  end
  if not kind then return d end
  local classes = pandoc.List({ kind })
  for _, c in ipairs(d.classes) do if c ~= kind then classes:insert(c) end end
  local attrs, style = {}, d.attributes["style"] or ""
  for k, v in pairs(d.attributes) do
    if k == "width" and tonumber(v) then
      -- a number is a width in slide pixels
      style = "width:" .. v .. "px;" .. style
    elseif k == "top" and tonumber(v) then
      style = "top:" .. v .. "px;" .. style
    elseif k == "side" or k == "tone" or k == "width" or k == "align" then
      classes:insert(k .. "-" .. v)
    elseif k ~= "style" then
      attrs[k] = v
    end
  end
  if style ~= "" then attrs["style"] = style end
  d.classes = classes
  d.attributes = attrs
  return d
end

return {
  { Meta = Meta },
  { Header = Header, Div = Div },
}
