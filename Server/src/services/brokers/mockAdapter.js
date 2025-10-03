import { BrokerAdapter } from "./AdapterBase.js";
export class MockAdapter extends BrokerAdapter {
  constructor(){ super("mock"); }
  async init(){ return true; }
  async placeOrder({ symbol, side, qty, price }){
    return { ok:true, orderId:"MOCK-"+Date.now(), status:"FILLED", filledPrice:price };
  }
  async fetchLTP(){ return null; }
}
