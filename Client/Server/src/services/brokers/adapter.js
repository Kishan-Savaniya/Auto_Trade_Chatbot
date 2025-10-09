/**
 * @typedef {Object} BrokerAdapter
 * @prop {(userId:string)=>Promise<string>} loginUrl             // create OAuth URL
 * @prop {(userId:string, callbackParams:any)=>Promise<void>} handleCallback
 * @prop {(userId:string)=>Promise<boolean>} isAuthenticated
 * @prop {(userId:string, order:{symbol:string, side:"BUY"|"SELL", qty:number, price?:number, type?:"MARKET"|"LIMIT"})=>Promise<{brokerOrderId:string}>} placeOrder
 * @prop {(userId:string)=>Promise<Array<{symbol:string,type:"LONG"|"SHORT",qty:number,avgPrice:number}>>} getPositions
 * @prop {(symbols:string[])=>Promise<Record<string,number>>} getQuotes
 * @prop {(userId:string, symbols:string[], onTick:(tick)=>void)=>Promise<()=>void>} stream
 */
