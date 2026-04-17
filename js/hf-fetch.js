const _cache = {};

// sessionStorage TTLs (ms): index is small + changes often; meta/summary are run-scoped + stable.
const _SS_TTL = {
  "index.json": 60 * 1000,           // 1 minute — picks up new runs quickly
  _default: 10 * 60 * 1000,          // 10 minutes for everything else
};

function _ssKey(path) { return `va:${path}`; }

function _ssGet(path) {
  try {
    const raw = sessionStorage.getItem(_ssKey(path));
    if (!raw) return null;
    const { t, data } = JSON.parse(raw);
    const ttl = _SS_TTL[path] ?? _SS_TTL._default;
    if (Date.now() - t > ttl) {
      sessionStorage.removeItem(_ssKey(path));
      return null;
    }
    return data;
  } catch { return null; }
}

function _ssSet(path, data) {
  try {
    sessionStorage.setItem(_ssKey(path), JSON.stringify({ t: Date.now(), data }));
  } catch {
    // quota exceeded — drop oldest va: entries
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith("va:"));
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => sessionStorage.removeItem(k));
  }
}

async function hfFetch(path) {
  if (_cache[path]) return _cache[path];
  const cached = _ssGet(path);
  if (cached) { _cache[path] = cached; return cached; }

  const url = `${VA.HF_BASE}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const data = await res.json();
  _cache[path] = data;
  _ssSet(path, data);
  return data;
}

function hfImageURL(path) {
  return `${VA.HF_BASE}/${path}`;
}

async function fetchIndex() {
  return hfFetch("index.json");
}

function clearHFCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
  Object.keys(sessionStorage).filter(k => k.startsWith("va:")).forEach(k => sessionStorage.removeItem(k));
}
