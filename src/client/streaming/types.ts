/** Zod schemas and types for the dxLink WebSocket protocol and market events. */

import { z } from "zod";

// ---------------------------------------------------------------------------
// dxLink Protocol Messages (channel 0 = control, odd channels = data)
// ---------------------------------------------------------------------------

export const DxLinkSetupSchema = z.object({
  type: z.literal("SETUP"),
  channel: z.literal(0),
  version: z.string(),
  keepaliveTimeout: z.number().optional(),
  acceptKeepaliveTimeout: z.number().optional(),
});

export const DxLinkAuthSchema = z.object({
  type: z.literal("AUTH"),
  channel: z.literal(0),
  token: z.string(),
});

export const DxLinkAuthStateSchema = z.object({
  type: z.literal("AUTH_STATE"),
  channel: z.literal(0),
  state: z.enum(["AUTHORIZED", "UNAUTHORIZED"]),
});

export const DxLinkKeepaliveSchema = z.object({
  type: z.literal("KEEPALIVE"),
  channel: z.literal(0),
});

export const DxLinkErrorSchema = z.object({
  type: z.literal("ERROR"),
  channel: z.number(),
  error: z.string(),
  message: z.string(),
});

export const DxLinkChannelRequestSchema = z.object({
  type: z.literal("CHANNEL_REQUEST"),
  channel: z.number(),
  service: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const DxLinkChannelOpenedSchema = z.object({
  type: z.literal("CHANNEL_OPENED"),
  channel: z.number(),
  service: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const DxLinkChannelClosedSchema = z.object({
  type: z.literal("CHANNEL_CLOSED"),
  channel: z.number(),
});

export const DxLinkFeedSetupSchema = z.object({
  type: z.literal("FEED_SETUP"),
  channel: z.number(),
  acceptDataFormat: z.enum(["COMPACT", "FULL"]),
  acceptEventFields: z.record(z.string(), z.array(z.string())),
});

export const DxLinkFeedConfigSchema = z.object({
  type: z.literal("FEED_CONFIG"),
  channel: z.number(),
  dataFormat: z.enum(["COMPACT", "FULL"]),
  eventFields: z.record(z.string(), z.array(z.string())),
});

export const SubscriptionEntrySchema = z.object({
  type: z.string(),
  symbol: z.string(),
});

export const DxLinkFeedSubscriptionSchema = z.object({
  type: z.literal("FEED_SUBSCRIPTION"),
  channel: z.number(),
  add: z.array(SubscriptionEntrySchema).optional(),
  remove: z.array(SubscriptionEntrySchema).optional(),
  reset: z.boolean().optional(),
});

export const DxLinkFeedDataSchema = z.object({
  type: z.literal("FEED_DATA"),
  channel: z.number(),
  data: z.array(z.unknown()),
});

/** Discriminated union of all server→client messages. */
export const DxLinkServerMessageSchema = z.discriminatedUnion("type", [
  DxLinkSetupSchema,
  DxLinkAuthStateSchema,
  DxLinkKeepaliveSchema,
  DxLinkErrorSchema,
  DxLinkChannelOpenedSchema,
  DxLinkChannelClosedSchema,
  DxLinkFeedConfigSchema,
  DxLinkFeedDataSchema,
]);

export type DxLinkServerMessage = z.infer<typeof DxLinkServerMessageSchema>;

// ---------------------------------------------------------------------------
// Market Event Types
// ---------------------------------------------------------------------------

/** Canonical field lists for each event type, sent in FEED_SETUP. */
export const EVENT_FIELDS = {
  Order: [
    "eventFlags",
    "eventSymbol",
    "eventType",
    "index",
    "side",
    "sequence",
    "price",
    "size",
    "time",
  ],
  Quote: [
    "eventType",
    "eventSymbol",
    "eventTime",
    "bidPrice",
    "bidSize",
    "bidExchangeCode",
    "bidTime",
    "askPrice",
    "askSize",
    "askExchangeCode",
    "askTime",
  ],
  Trade: [
    "eventType",
    "eventSymbol",
    "eventTime",
    "price",
    "size",
    "change",
    "dayVolume",
    "exchangeCode",
    "tickDirection",
  ],
  TradeETH: [
    "eventType",
    "eventSymbol",
    "eventTime",
    "price",
    "size",
    "change",
    "dayVolume",
    "exchangeCode",
    "tickDirection",
  ],
  Candle: [
    "close",
    "eventFlags",
    "eventSymbol",
    "eventType",
    "eventTime",
    "high",
    "impVolatility",
    "low",
    "open",
    "openInterest",
    "time",
    "volume",
    "vwap",
    "sequence",
    "count",
  ],
} as const;

export type EventType = keyof typeof EVENT_FIELDS;

/** A parsed Order event from FEED_DATA. */
export interface OrderEvent {
  eventFlags: number;
  eventSymbol: string;
  eventType: string;
  index: number;
  /** "BUY" or "SELL". Field name is "side" in the dxLink protocol. */
  side: string;
  sequence: number;
  price: number;
  size: number;
  time: number;
}

/** A parsed Quote event from FEED_DATA. */
export interface QuoteEvent {
  eventType: string;
  eventSymbol: string;
  eventTime: number;
  bidPrice: number;
  bidSize: number;
  bidExchangeCode: string;
  bidTime: number;
  askPrice: number;
  askSize: number;
  askExchangeCode: string;
  askTime: number;
}

/** A parsed Trade event from FEED_DATA. */
export interface TradeEvent {
  eventType: string;
  eventSymbol: string;
  eventTime: number;
  price: number;
  size: number;
  change: number;
  dayVolume: number;
  exchangeCode: string;
  tickDirection: string;
}

/** A parsed Candle event from FEED_DATA. */
export interface CandleEvent {
  time: number; // Candle period start (epoch ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  count: number;
  vwap: number;
  eventTime: number; // 0 for backfill, real timestamp for live
}

// ---------------------------------------------------------------------------
// Subscription Options
// ---------------------------------------------------------------------------

export interface CandleOptions {
  interval: string;
  from?: Date | string;
  maxCandles?: number;
}

export interface TradeOptions {
  maxTrades?: number;
}

export interface OrderBookOptions {
  maxDepth?: number;
}

export interface SubscribeOptions {
  candles?: CandleOptions | boolean;
  quotes?: boolean;
  trades?: TradeOptions | boolean;
  orderBook?: OrderBookOptions | boolean;
}

/** Internal resolved form — booleans normalized to config objects. */
export interface ResolvedSubscribeOptions {
  candles?: { interval: string; fromTime: number; maxCandles: number };
  quotes: boolean;
  trades?: { maxTrades: number };
  orderBook?: { maxDepth: number };
}

// ---------------------------------------------------------------------------
// Streaming Token
// ---------------------------------------------------------------------------

export const StreamingTokenDataSchema = z.object({
  token: z.string(),
  wss_url: z.string(),
  expiration: z.string(),
  ttl_ms: z.string(),
  dxfeed_id: z.string(),
});

export const StreamingTokenResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  data: z.object({
    status: z.literal("SUCCESS"),
    data: StreamingTokenDataSchema,
  }),
});

export type StreamingTokenData = z.infer<typeof StreamingTokenDataSchema>;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const DEFAULT_FROM_TIME = 10000000000;
const DEFAULT_MAX_CANDLES = 5000;
const DEFAULT_MAX_TRADES = 500;
const DEFAULT_ORDER_BOOK_DEPTH = 50;

/** Convert a `from` option (Date, relative string, or undefined) to epoch ms. */
export function resolveFromTime(from?: Date | string): number {
  if (from === undefined) return DEFAULT_FROM_TIME;
  if (from instanceof Date) return from.getTime();
  const match = from.match(/^(\d+)(d|h)$/);
  if (!match) {
    throw new Error(`Invalid from duration: "${from}". Use "30d" or "24h".`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const ms = unit === "d" ? value * 86_400_000 : value * 3_600_000;
  return Date.now() - ms;
}

/** Normalize SubscribeOptions (booleans → config objects with defaults). */
export function resolveSubscribeOptions(opts: SubscribeOptions): ResolvedSubscribeOptions {
  const candles =
    opts.candles === true
      ? { interval: "5m", fromTime: resolveFromTime(), maxCandles: DEFAULT_MAX_CANDLES }
      : opts.candles
        ? {
            interval: opts.candles.interval,
            fromTime: resolveFromTime(opts.candles.from),
            maxCandles: opts.candles.maxCandles ?? DEFAULT_MAX_CANDLES,
          }
        : undefined;

  const trades =
    opts.trades === true
      ? { maxTrades: DEFAULT_MAX_TRADES }
      : opts.trades
        ? { maxTrades: opts.trades.maxTrades ?? DEFAULT_MAX_TRADES }
        : undefined;

  const orderBook =
    opts.orderBook === true
      ? { maxDepth: DEFAULT_ORDER_BOOK_DEPTH }
      : opts.orderBook
        ? { maxDepth: opts.orderBook.maxDepth ?? DEFAULT_ORDER_BOOK_DEPTH }
        : undefined;

  return { candles, quotes: opts.quotes ?? false, trades, orderBook };
}
