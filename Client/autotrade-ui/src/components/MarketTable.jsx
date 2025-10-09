export default function MarketTable({ rows=[] }){
  return (
    <div>
      <h3 style={{ marginTop:0 }}>Market</h3>
      <table border="1" cellPadding="6" style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead><tr>
          <th>Symbol</th><th>LTP</th><th>RSI</th><th>Signal</th>
        </tr></thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i}>
              <td>{r.symbol}</td><td>{r.ltp}</td><td>{r.rsi ?? "-"}</td><td>{r.signal ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
