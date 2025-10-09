import fs from "fs";
import path from "path";
import { KiteConnect, KiteTicker } from "kiteconnect";
import { counters } from "../../metrics/metrics.js";

const API_KEY    = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;
const mem = { accessTokenByUser: new Map(), map: null, rev: null };

function loadMap(){
  if (mem.map) return;
  try{
    const p = path.join(process.cwd(), "data", "kite-map.json");
    if (fs.existsSync(p)){
      mem.map = JSON.parse(fs.readFileSync(p, "utf8"));
      mem.rev = {};
      for (const [sym, v] of Object.entries(mem.map)) mem.rev[v.token] = sym;
      console.log("[Zerodha] instrument map loaded:", Object.keys(mem.map).length);
    } else { mem.map = {}; mem.rev = {}; }
  }catch(e){ console.warn("[Zerodha] map load failed:", e?.message||e); mem.map={}; mem.rev={}; }
}
function symFromTok(tok){ loadMap(); return mem.rev?.[tok] || String(tok); }

export async function loginUrl(userId="default"){
  if(!API_KEY) throw new Error("KITE_API_KEY missing");
  const kc = new KiteConnect({ api_key: API_KEY });
  const url = kc.getLoginURL();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}state=${encodeURIComponent(userId)}`;
}
export async function handleCallback(userId="default", query={}){
  if(!API_KEY || !API_SECRET) throw new Error("Kite API keys missing");
  const requestToken = query.request_token;
  if(!requestToken) throw new Error("request_token missing");
  const kc = new KiteConnect({ api_key: API_KEY });
  const sess = await kc.generateSession(requestToken, API_SECRET);
  mem.accessTokenByUser.set(userId, sess.access_token);
  return { ok:true };
}
export async function isAuthenticated(userId="default"){ return !!mem.accessTokenByUser.get(userId); }

export function connectMarketWS({ userId="default", instruments=[], onTick, onStatus }){
  if(!API_KEY) { onStatus?.("error", new Error("KITE_API_KEY missing")); return ()=>{}; }
  const access = mem.accessTokenByUser.get(userId);
  if(!access){ onStatus?.("error", new Error("Not authenticated with Zerodha")); return ()=>{}; }
  const ticker = new KiteTicker({ api_key: API_KEY, access_token: access });
  ticker.autoReconnect(true, 5, 5);
  ticker.on("connect", ()=>{
    onStatus?.("connected");
    loadMap();
    const toks = instruments.map(x=>{
      if (/^\d+$/.test(String(x))) return Number(x);
      const meta = mem.map?.[String(x)]; return meta?.token ? Number(meta.token) : null;
    }).filter(Boolean);
    if (toks.length){ try{ ticker.subscribe(toks); ticker.setMode(ticker.modeLTP, toks); }catch{} }
  });
  ticker.on("ticks", (ticks=[])=>{ for(const t of ticks){ onTick?.({ symbol: symFromTok(t.instrument_token), ltp: t.last_price, ts: Date.now() }); counters.ticks.inc(); } });
  ticker.on("error", (e)=> onStatus?.("error", e));
  ticker.on("disconnect", ()=> onStatus?.("disconnected"));
  ticker.connect(); return ()=>{ try{ ticker.disconnect(); }catch{} };
}

function client(userId){
  const at = mem.accessTokenByUser.get(userId);
  if(!API_KEY || !at) throw new Error("Not authenticated with Zerodha");
  const kc = new KiteConnect({ api_key: API_KEY }); kc.setAccessToken(at); return kc;
}
export async function placeOrder(userId, { symbol, side, qty, product="MIS", priceType="MARKET", price=0, variety="regular" }){
  try{
    const kc = client(userId); loadMap();
    const meta = mem.map?.[symbol]; if(!meta) throw new Error("Unknown symbol: "+symbol);
    const order = await kc.placeOrder(variety, {
      exchange: meta.exchange || "NSE", tradingsymbol: symbol,
      transaction_type: side === "BUY" ? "BUY" : "SELL",
      quantity: Number(qty), product, order_type: priceType, price: Number(price)||0, validity:"DAY"
    });
    return { brokerOrderId: order?.order_id || "" };
  }catch(e){ return { brokerOrderId:null, warning:e?.message||String(e) }; }
}
export async function modifyOrder(userId = "default", brokerOrderId, changes = {}){
  try {
    const variety = changes.variety || "regular";
    const kc = client(userId);
    const params = {};
    if (changes.quantity != null) params.quantity = Number(changes.quantity);
    if (changes.price != null) params.price = Number(changes.price);
    if (changes.order_type) params.order_type = String(changes.order_type);
    if (changes.trigger_price != null) params.trigger_price = Number(changes.trigger_price);
    if (changes.validity) params.validity = String(changes.validity);
    await kc.modifyOrder(variety, brokerOrderId, params);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
export async function cancelOrder(userId = "default", brokerOrderId, { variety = "regular" } = {}){
  try {
    const kc = client(userId);
    await kc.cancelOrder(variety, brokerOrderId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
export async function getPositions(userId="default"){
  try{
    const kc = client(userId); const r = await kc.getPositions();
    return (r?.net || []).map(p=>({ symbol:p.tradingsymbol, type:Number(p.quantity)>0?"LONG":Number(p.quantity)<0?"SHORT":"FLAT",
      qty: Math.abs(Number(p.quantity||0)), avgPrice:Number(p.average_price||0), ltp:Number(p.last_price||0), pnl:Number(p.pnl||0) }));
  }catch{ return []; }
}
export async function getOrders(userId="default"){
  try{
    const kc = client(userId); const list = await kc.getOrders();
    return (list||[]).map(o=>({ brokerOrderId:o.order_id, symbol:o.tradingsymbol, side:o.transaction_type, qty:Number(o.quantity||0),
      price:Number(o.average_price||o.price||0), status:o.status, createdAt:new Date(o.order_timestamp||Date.now()) }));
  }catch{ return []; }
}
