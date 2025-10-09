export default function OrderBlotter({ orders=[] }){
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h3 style={{ margin:0 }}>Orders</h3>
      </div>
      <table border="1" cellPadding="6" style={{ width:"100%", borderCollapse:"collapse", marginTop:8 }}>
        <thead><tr>
          <th>Time</th><th>Broker ID</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th>
        </tr></thead>
        <tbody>
          {orders.map((o,i)=>(
            <tr key={i}>
              <td>{o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : "-"}</td>
              <td>{o.brokerOrderId || o._id || "-"}</td>
              <td>{o.symbol}</td>
              <td>{o.side}</td>
              <td>{o.qty}</td>
              <td>{o.price ?? "-"}</td>
              <td>{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
