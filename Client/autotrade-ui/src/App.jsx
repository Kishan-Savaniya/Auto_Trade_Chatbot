import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import BrokerConnect from "./components/BrokerConnect";
import Positions from "./components/Positions";
import MarketTable from "./components/MarketTable";
import OrderBlotter from "./components/OrderBlotter";
import MarketChart from "./components/MarketChart";
import { useMarketStream } from "./hooks/useMarketStream";

export default function App(){
  const [auth, setAuth] = useState({ loggedIn:false });
  const [engine, setEngine] = useState({ running:false });
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);

  const { rows: marketRows, status: streamStatus } = useMarketStream({ pollMs: 5000 });
  const chartData = useMemo(()=>{
    const s = marketRows[0]?.symbol || "NIFTY";
    return { symbol: s, data: marketRows.filter(r=>r.symbol===s).map(r=>({ ltp:r.ltp })) };
  }, [marketRows]);

  async function refreshAll(){
    try{ setEngine(await api.engineState()); }catch{}
    try{ setPositions(await api.positions()); }catch{}
    try{ setOrders(await api.orders()); }catch{}
  }

  useEffect(()=>{
    api.me().then(m=>{ if(m?.ok || m?.user){ setAuth({ loggedIn:true }); refreshAll(); } });
  }, []);

  if(!auth.loggedIn){
    return <AuthScreen onLoggedIn={()=>{ setAuth({loggedIn:true}); refreshAll(); }} />;
  }

  return (
    <div style={{ padding:16 }}>
      <header className="card header">
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <h1 style={{ margin:0 }}>Auto Trade</h1>
          <span style={{ fontSize:14, opacity:.8 }}>Stream: {streamStatus}</span>
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <label>
            <input
              type="checkbox"
              checked={!!engine.running}
              onChange={async e=>{
                const run = e.target.checked;
                try{ run ? await api.engineStart() : await api.engineStop(); }catch{}
                setEngine(await api.engineState());
              }}
            />{" "}
            Engine {engine.running ? "ACTIVE" : "INACTIVE"}
          </label>
          <BrokerConnect />
          <button onClick={refreshAll}>Refresh</button>
        </div>
      </header>

      <div className="grid" style={{ marginTop:16 }}>
        <div className="card">
          <MarketChart data={chartData.data} symbol={chartData.symbol} />
        </div>
        <div className="card">
          <Positions rows={positions} />
        </div>
        <div className="card">
          <MarketTable rows={marketRows} />
        </div>
        <div className="card">
          <OrderBlotter orders={orders} />
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ onLoggedIn }){
  const [form, setForm] = useState({ username:"admin", password:"admin" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if(busy) return;
    setBusy(true);
    try{
      const r = await api.login(form.username, form.password);
      if(r?.ok || r?.token){ onLoggedIn(); }
      else alert(r?.error || "Login failed");
    }catch(e){ alert(e?.message || "Login error"); }
    setBusy(false);
  };
  return (
    <div style={{ display:"grid", placeItems:"center", height:"100vh" }}>
      <div className="card" style={{ width:360 }}>
        <h2>Auto Trade</h2>
        <div style={{ display:"grid", gap:8 }}>
          <label>Username</label>
          <input value={form.username} onChange={e=>setForm({...form, username:e.target.value})}/>
          <label>Password</label>
          <input type="password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})}/>
          <button onClick={submit} disabled={busy}>{busy ? "Signing in..." : "Login"}</button>
        </div>
      </div>
    </div>
  );
}
