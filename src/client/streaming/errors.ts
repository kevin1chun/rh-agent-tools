/** Streaming-specific error hierarchy. */

import { RobinhoodError } from "../errors.js";

export class StreamingError extends RobinhoodError {
  constructor(message: string) {
    super(message);
    this.name = "StreamingError";
  }
}

export class StreamingAuthError extends StreamingError {
  constructor(message: string) {
    super(message);
    this.name = "StreamingAuthError";
  }
}

export class StreamingConnectionError extends StreamingError {
  constructor(message: string) {
    super(message);
    this.name = "StreamingConnectionError";
  }
}

export class StreamingProtocolError extends StreamingError {
  constructor(message: string) {
    super(message);
    this.name = "StreamingProtocolError";
  }
}
