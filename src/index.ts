/** rh-for-agents — AI-native Robinhood trading interface. */

// Client API (re-export everything from the client barrel)
export * from "./client/index.js";
export { main } from "./server/index.js";
// Server API
export { createServer } from "./server/server.js";
