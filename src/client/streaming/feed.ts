/** FEED channel manager — subscribe to event types and parse COMPACT data. */

import type { DxLinkClient } from "./dxlink-client.js";
import { EVENT_FIELDS, type EventType } from "./types.js";

type EventCallback = (events: Array<Record<string, unknown>>) => void;

/** Default dxFeed source for L2 Order events (NASDAQ TotalView). */
const ORDER_SOURCE = "NTV";

interface ChannelState {
  eventType: EventType;
  channel: number;
  /** Field order as confirmed by FEED_CONFIG (or our requested order). */
  fields: string[];
  /** "COMPACT" (positional arrays) or "FULL" (keyed objects). */
  dataFormat: string;
  symbols: Set<string>;
  callbacks: EventCallback[];
  /** Whether the first subscription has been sent (controls reset flag). */
  initialized: boolean;
}

export class DxLinkFeed {
  /** Maps event type → channel state. One channel per event type. */
  private channels = new Map<EventType, ChannelState>();

  constructor(private client: DxLinkClient) {
    this.client.on("message", this.handleMessage);
  }

  /**
   * Subscribe to an event type for the given symbols.
   * Opens a new channel if this event type hasn't been subscribed yet.
   */
  async subscribe(
    eventType: EventType,
    symbols: string[],
    callback: EventCallback,
    opts?: { fromTime?: number },
  ): Promise<number> {
    let state = this.channels.get(eventType);

    if (!state) {
      // Open a new FEED channel
      const channel = await this.client.openChannel("FEED");
      const fields = [...EVENT_FIELDS[eventType]];

      // Use FULL format for all event types (matches Legend's protocol)
      const fmt = "FULL";

      state = {
        eventType,
        channel,
        fields,
        dataFormat: fmt,
        symbols: new Set(),
        callbacks: [],
        initialized: false,
      };
      this.channels.set(eventType, state);

      this.client.send({
        type: "FEED_SETUP",
        channel,
        acceptDataFormat: fmt,
        acceptAggregationPeriod: 0.25,
        acceptEventFields: { [eventType]: fields },
      } as unknown as Record<string, unknown>);

      // Server sends 1-2 FEED_CONFIGs: first without eventFields, then with.
      // Wait for the first, then briefly wait for one with eventFields.
      const firstConfig = await this.client.waitFor(
        (msg) => msg.type === "FEED_CONFIG" && msg.channel === channel,
      );

      let finalConfig = firstConfig;
      if (!firstConfig.eventFields) {
        // Try to catch the second FEED_CONFIG with eventFields (2s timeout)
        finalConfig = await this.client
          .waitFor(
            (msg) => msg.type === "FEED_CONFIG" && msg.channel === channel && !!msg.eventFields,
            2000,
          )
          .catch(() => firstConfig);
      }

      // Update field order from server response
      const serverFields = finalConfig.eventFields as Record<string, string[]> | undefined;
      if (serverFields?.[eventType]) {
        state.fields = serverFields[eventType];
      }
    }

    if (!state.callbacks.includes(callback)) {
      state.callbacks.push(callback);
    }

    // Determine new symbols to subscribe
    const newSymbols = symbols.filter((s) => !state.symbols.has(s));
    if (newSymbols.length > 0) {
      for (const s of newSymbols) state.symbols.add(s);

      // Event-specific subscription parameters
      const addEntries = newSymbols.map((symbol) => {
        const entry: Record<string, unknown> = { type: eventType, symbol };
        if (eventType === "Order") entry.source = ORDER_SOURCE;
        if (eventType === "Candle") {
          entry.fromTime = opts?.fromTime ?? 10000000000;
          entry.instrumentType = "equity";
        }
        return entry;
      });

      const msg: Record<string, unknown> = {
        type: "FEED_SUBSCRIPTION",
        channel: state.channel,
        add: addEntries,
      };
      if (!state.initialized) {
        msg.reset = true;
        state.initialized = true;
      }
      this.client.send(msg);
    }

    return state.channel;
  }

  /** Unsubscribe specific symbols from an event type. */
  unsubscribe(eventType: EventType, symbols: string[]): void {
    const state = this.channels.get(eventType);
    if (!state) return;

    const toRemove = symbols.filter((s) => state.symbols.has(s));
    if (toRemove.length === 0) return;

    for (const s of toRemove) state.symbols.delete(s);

    const removeEntries = toRemove.map((symbol) => {
      const entry: Record<string, unknown> = { type: eventType, symbol };
      if (eventType === "Order") entry.source = ORDER_SOURCE;
      if (eventType === "Candle") {
        entry.fromTime = 10000000000;
        entry.instrumentType = "equity";
      }
      return entry;
    });

    this.client.send({
      type: "FEED_SUBSCRIPTION",
      channel: state.channel,
      remove: removeEntries,
    });
  }

  /** Remove a callback from an event type. */
  removeCallback(eventType: EventType, callback: EventCallback): void {
    const state = this.channels.get(eventType);
    if (!state) return;
    state.callbacks = state.callbacks.filter((cb) => cb !== callback);
  }

  /** Close all channels and reset state. */
  destroy(): void {
    this.client.off("message", this.handleMessage);
    for (const state of this.channels.values()) {
      try {
        this.client.closeChannel(state.channel);
      } catch {
        // Ignore if already disconnected
      }
    }
    this.channels.clear();
  }

  /** Parse FULL FEED_DATA — array of keyed objects. */
  private parseFullData(data: unknown[]): Array<Record<string, unknown>> {
    return data.filter(
      (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
    );
  }

  private handleMessage = (msg: Record<string, unknown>): void => {
    if (msg.type !== "FEED_DATA") return;

    const channel = msg.channel as number;
    const data = msg.data as unknown[];
    if (!data || !Array.isArray(data)) return;

    for (const state of this.channels.values()) {
      if (state.channel === channel) {
        const events = this.parseFullData(data);
        for (const cb of state.callbacks) {
          cb(events);
        }
        break;
      }
    }
  };
}
