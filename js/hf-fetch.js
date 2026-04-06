const _cache = {};

async function hfFetch(path) {
  if (_cache[path]) return _cache[path];
  const url = `${VA.HF_BASE}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const data = await res.json();
  _cache[path] = data;
  return data;
}

function hfImageURL(path) {
  return `${VA.HF_BASE}/${path}`;
}

async function fetchIndex() {
  return hfFetch("index.json");
}
