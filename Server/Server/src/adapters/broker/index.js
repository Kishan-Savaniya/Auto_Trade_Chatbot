import { paperBroker } from "./paper.js";
import { kiteBroker } from "./kite.js";
import { upstoxBroker } from "./upstox.js";
import { angelBroker } from "./angel.js";
import { config } from "../../config.js";

export function getBroker() {
  switch (config.broker.provider) {
  case "zerodha": // treat "zerodha" same as "kite"
  case "kite":    return kiteBroker;
  case "upstox":  return upstoxBroker;
  case "angel":   return angelBroker;
  case "mock":    return paperBroker;
  default:        return paperBroker;
}

}
