import { useEffect, useState } from "react";
import { api } from "../api";
export default function BrokerConnect(){
  const [broker, setBroker] = useState("zerodha");
  const [status, setStatus] = useState({ connected:false, name:"-" });
  async function refresh(){
    try { const s = await api.brokerStatus(broker); setStatus(s); } catch {}
  }
  async function connect(){
    try { const r = await api.brokerLoginUrl(broker); if(r?.url) window.location.href = r.url; } catch (e) { alert(e?.message || "Failed to get login URL"); }
  }
  useEffect(()=>{ refresh(); }, [broker]);
  return (
    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
      <select value={broker} onChange={e=>setBroker(e.target.value)}>
        <option value="zerodha">Zerodha</option>
        <option value="upstox">Upstox</option>
        <option value="mock">Mock</option>
      </select>
      <span>Broker: <b>{status?.name || broker}</b> — {status?.connected ? "Connected" : "Disconnected"}</span>
      {!status?.connected && <button onClick={connect}>Connect</button>}
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
