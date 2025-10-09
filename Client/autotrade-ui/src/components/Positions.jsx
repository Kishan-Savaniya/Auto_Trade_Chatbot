export default function Positions({ rows=[] }){
  return (
    <div>
      <h3 style={{ marginTop:0 }}>Positions</h3>
      <table border="1" cellPadding="6" style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead><tr>
          <th>Symbol</th><th>Qty</th><th>Avg</th><th>LTP</th><th>PnL</th>
        </tr></thead>
        <tbody>
          {rows.map((p,i)=>(
            <tr key={i}>
              <td>{p.symbol}</td><td>{p.qty}</td><td>{p.avgPrice}</td><td>{p.ltp}</td><td>{p.pnl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
