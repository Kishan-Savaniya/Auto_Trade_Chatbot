const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
export async function login(username,password){
  const r = await fetch(BASE+"/api/auth/login",{ method:"POST", credentials:"include", headers:{ "Content-Type":"application/json"}, body: JSON.stringify({ username,password }) });
  if(!r.ok) throw new Error("login failed"); return r.json();
}
export async function signup(payload){
  const r = await fetch(BASE+"/api/auth/signup",{ method:"POST", credentials:"include", headers:{ "Content-Type":"application/json"}, body: JSON.stringify(payload) });
  if(!r.ok) throw new Error("signup failed"); return r.json();
}
export async function me(){ const r = await fetch(BASE+"/api/auth/me",{ credentials:"include" }); return r.json(); }
export async function market(){ const r = await fetch(BASE+"/api/market/table",{ credentials:"include" }); return r.json(); }
