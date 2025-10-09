import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
export default function MarketChart({ data=[], symbol="NIFTY" }){
  const rows = data.slice(-200).map((d,i)=>({ i, ltp: Number(d.ltp||d.price||0) }));
  return (
    <div style={{ height: 240 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
        <strong>{symbol} — Live</strong>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="i" hide />
          <YAxis domain={["dataMin", "dataMax"]} width={60} />
          <Tooltip />
          <Line type="monotone" dataKey="ltp" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
