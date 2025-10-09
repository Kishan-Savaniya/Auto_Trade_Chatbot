export async function loginUrl(){ throw new Error("Not implemented"); }
export async function handleCallback(){ throw new Error("Not implemented"); }
export async function isAuthenticated(){ return false; }
export function connectMarketWS(){ return ()=>{}; }
export async function placeOrder(){ return { brokerOrderId:null }; }
export async function modifyOrder(){ return { ok:false }; }
export async function cancelOrder(){ return { ok:false }; }
export async function getPositions(){ return []; }
export async function getOrders(){ return []; }
