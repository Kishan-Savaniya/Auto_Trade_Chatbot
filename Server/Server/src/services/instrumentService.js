import fs from "fs";
import path from "path";

let cache = { map: {}, rev: {} };

export function loadKiteMap() {
  if (Object.keys(cache.map).length) return cache;
  try {
    const p = path.join(process.cwd(), "data", "kite-map.json");
    if (!fs.existsSync(p)) {
      console.warn("[instrumentService] data/kite-map.json missing");
      cache = { map: {}, rev: {} };
      return cache;
    }
    const map = JSON.parse(fs.readFileSync(p, "utf8")); // { "RELIANCE": { token, exchange } }
    const rev = {};
    for (const [sym, v] of Object.entries(map)) rev[v.token] = sym;
    cache = { map, rev };
  } catch (e) {
    console.warn("[instrumentService] load error:", e?.message || e);
    cache = { map: {}, rev: {} };
  }
  return cache;
}

export function tokenOf(symbol) {
  const { map } = loadKiteMap();
  return map?.[symbol]?.token || null;
}
export function symbolOfToken(token) {
  const { rev } = loadKiteMap();
  return rev?.[token] || null;
}
