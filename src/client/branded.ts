/** Branded types for compile-time safety of financial identifiers. */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type AccountNumber = Brand<string, "AccountNumber">;
export type OrderId = Brand<string, "OrderId">;
export type InstrumentId = Brand<string, "InstrumentId">;
export type ChainId = Brand<string, "ChainId">;

/** Helper to brand a string value at runtime boundaries. */
export function asAccountNumber(value: string): AccountNumber {
  return value as AccountNumber;
}

export function asOrderId(value: string): OrderId {
  return value as OrderId;
}

export function asInstrumentId(value: string): InstrumentId {
  return value as InstrumentId;
}

export function asChainId(value: string): ChainId {
  return value as ChainId;
}
