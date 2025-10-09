import { useEffect, useRef, useState } from "react";
import { api } from "../api";
export function useMarketStream({ pollMs=5000 } = {}){
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("idle");
  const esRef = useRef(null);
  const timerRef = useRef(null);
  useEffect(()=>{
    let active = true;
    function startSSE(){
      setStatus("connecting");
      try {
        const es = new EventSource("/api/stream/market", { withCredentials:true });
        esRef.current = es;
        es.onopen = () => setStatus("connected");
        es.onerror = () => { setStatus("error"); es.close(); esRef.current=null; startPoll(); };
        es.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if(msg?.type==="snapshot") setRows(msg.rows||[]);
            if(msg?.type==="tick" && msg.row){
              setRows(prev => {
                const map = new Map(prev.map(r=>[r.symbol, r]));
                map.set(msg.row.symbol, { ...(map.get(msg.row.symbol)||{}), ...msg.row });
                return Array.from(map.values());
              });
            }
          } catch {}
        };
      } catch {
        startPoll();
      }
    }
    async function poll(){
      try {
        const r = await api.marketTable();
        if(!active) return;
        setRows(Array.isArray(r)?r:(r?.rows||[]));
        setStatus("polling");
      } catch {}
      timerRef.current = setTimeout(poll, pollMs);
    }
    function startPoll(){
      clearTimeout(timerRef.current);
      poll();
    }
    startSSE();
    return ()=>{
      active=false;
      try { esRef.current?.close(); } catch {}
      clearTimeout(timerRef.current);
    };
  }, [pollMs]);
  return { rows, status };
}
