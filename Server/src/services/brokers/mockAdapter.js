import { counters } from "../../metrics/metrics.js";
export default {
  async loginUrl(){ return "about:blank"; },
  async handleCallback(){ return { ok:true }; },
  async isAuthenticated(){ return true; },
  connectMarketWS({ instruments=[], onTick, onStatus }){
    onStatus?.("connected");
    const symbols = instruments.length ? instruments.map(String) : ["RELIANCE","TCS","INFY","HDFCBANK"];
    let i=0;
    const iv = setInterval(()=>{
      const s = symbols[i % symbols.length];
      const price = 2000 + Math.round(Math.random()*200);
      onTick?.({ symbol:s, ltp:price, ts:Date.now() });
      counters.ticks.inc();
      i++;
    }, 1000);
    return ()=>clearInterval(iv);
  },
  async placeOrder(_userId, _payload){ return { brokerOrderId: "MOCK-"+Date.now() }; },
  async modifyOrder(){ return { ok:true }; },
  async cancelOrder(){ return { ok:true }; },
  async getPositions(){ return []; },
  async getOrders(){ return []; }
};
