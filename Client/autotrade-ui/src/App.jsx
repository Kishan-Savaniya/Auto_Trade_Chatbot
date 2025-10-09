import React, { useEffect, useState } from "react";
import { login, signup, me } from "./api";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function App(){
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState("login");
  const [u,setU]=useState(""); const [p,setP]=useState("");
  const [rows,setRows]=useState([]);
  const [orders,setOrders]=useState([]);
  const [broker,setBroker]=useState({ name:"mock", connected:true });
  const [engine,setEngine]=useState({ running:false });

  // --- SSE for live market ---
  useEffect(()=>{
    if(!authed) return;
    const ev = new EventSource(BASE+"/api/stream/sse", { withCredentials:true });
    ev.onmessage = (e)=>{ try{ const data = JSON.parse(e.data); setRows(data.rows||[]); }catch{} };
    return ()=> ev.close();
  },[authed]);

  const fetchOrders = () => fetch(BASE+"/api/orders", { credentials:"include" }).then(r=>r.json()).then(setOrders).catch(()=>{});
  const fetchBroker = () => fetch(BASE+"/api/broker/status", { credentials:"include" }).then(r=>r.json()).then(setBroker).catch(()=>{});
  const fetchEngine = () => fetch(BASE+"/api/engine/state", { credentials:"include" }).then(r=>r.json()).then(setEngine).catch(()=>{});

  useEffect(()=>{ me().then(x=>setAuthed(!!x.ok)).catch(()=>{}); },[]);
  useEffect(()=>{ if(!authed) return;
    fetchOrders(); fetchBroker(); fetchEngine();
    const i2=setInterval(fetchOrders,4000);
    const i3=setInterval(fetchBroker,5000);
    const i4=setInterval(fetchEngine,5000);
    return ()=>{ clearInterval(i2);clearInterval(i3);clearInterval(i4); };
  },[authed]);

  const startEngine = ()=> fetch(BASE+"/api/engine/start",{method:"POST",credentials:"include"}).then(fetchEngine);
  const stopEngine  = ()=> fetch(BASE+"/api/engine/stop",{method:"POST",credentials:"include"}).then(fetchEngine);

  if(!authed){
    return <div style={{padding:30,color:"#ddd",fontFamily:"system-ui"}}>
      <h1>Auto Trade</h1>
      <div>
        <button onClick={()=>setTab("login")}>Login</button>
        <button onClick={()=>setTab("signup")}>Register</button>
      </div>
      {tab==="login"?(
        <div style={{marginTop:10}}>
          <input placeholder="username" value={u} onChange={e=>setU(e.target.value)}/>
          <input placeholder="password" type="password" value={p} onChange={e=>setP(e.target.value)}/>
          <button onClick={()=>login(u,p).then(()=>setAuthed(true)).catch(e=>alert(e.message))}>Login</button>
        </div>
      ):(
        <div style={{marginTop:10}}>
          <input placeholder="username" value={u} onChange={e=>setU(e.target.value)}/>
          <input placeholder="password" type="password" value={p} onChange={e=>setP(e.target.value)}/>
          <button onClick={()=>signup({username:u,password:p}).then(()=>setAuthed(true)).catch(e=>alert(e.message))}>Register</button>
        </div>
      )}
    </div>;
  }

  return <div style={{padding:20,fontFamily:"system-ui"}}>
    <h2>Dashboard</h2>

    <div style={{display:"flex", gap:24}}>
      <div>
        <h3>Broker</h3>
        <div>Name: {broker.name} | Connected: {String(broker.connected)}</div>
      </div>
      <div>
        <h3>Engine</h3>
        <div>Running: {String(engine.running)}</div>
        <button onClick={startEngine} disabled={engine.running}>Start</button>
        <button onClick={stopEngine} disabled={!engine.running}>Stop</button>
      </div>
    </div>

    <h3 style={{marginTop:20}}>Market (LTP)</h3>
    <table border="1" cellPadding="6">
      <thead><tr><th>Symbol</th><th>LTP</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.symbol}><td>{r.symbol}</td><td>{r.ltp}</td></tr>)}</tbody>
    </table>

    <h3 style={{marginTop:20}}>Orders</h3>
    <table border="1" cellPadding="6">
      <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead>
      <tbody>{(orders||[]).map(o=><tr key={o._id || o.brokerOrderId}>
        <td>{o.createdAt?new Date(o.createdAt).toLocaleTimeString():"-"}</td>
        <td>{o.symbol}</td><td>{o.side}</td><td>{o.qty}</td><td>{o.price ?? ""}</td><td>{o.status}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
