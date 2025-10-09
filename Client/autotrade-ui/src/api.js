export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
async function j(r){ if(!r.ok) throw new Error(await r.text().catch(()=>r.statusText)); return r.json(); }
export const api = {
  engineState: () => fetch(`${API_BASE}/api/engine/state`, { credentials: "include" }).then(j),
  engineStart: () => fetch(`${API_BASE}/api/engine/start`, { method:"POST", credentials:"include" }).then(j),
  engineStop:  () => fetch(`${API_BASE}/api/engine/stop`,  { method:"POST", credentials:"include" }).then(j),
  marketTable: () => fetch(`${API_BASE}/api/market/table`, { credentials: "include" }).then(j),
  positions:   () => fetch(`${API_BASE}/api/positions`, { credentials:"include" }).then(j),
  orders:      () => fetch(`${API_BASE}/api/orders`, { credentials:"include" }).then(j),
  brokerStatus: (name) => fetch(`${API_BASE}/api/broker/status?broker=${encodeURIComponent(name||"")}`, { credentials:"include" }).then(j),
  brokerLoginUrl: (name) => fetch(`${API_BASE}/api/broker/login/${encodeURIComponent(name)}`, { credentials:"include" }).then(j),
  login: (username, password)=> fetch(`${API_BASE}/api/auth/login`, {
    method:"POST", headers:{ "Content-Type":"application/json" }, credentials:"include",
    body: JSON.stringify({ username, password })
  }).then(j),
  me: () => fetch(`${API_BASE}/api/auth/me`, { credentials:"include" }).then(j),
  logout: () => fetch(`${API_BASE}/api/auth/logout`, { method:"POST", credentials:"include" }).then(j),
};
