export class BrokerAdapter {
  constructor(name="mock"){ this.name = name; }
  async init(_opts={}){ return true; }
  async placeOrder(_o={}){ throw new Error("placeOrder() not implemented for " + this.name); }
  async fetchLTP(_symbol){ return null; }
}
