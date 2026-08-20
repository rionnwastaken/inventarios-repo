// globals.d.ts
import type * as LogLevel from 'loglevel';

declare global {
  const log: typeof LogLevel;
}
