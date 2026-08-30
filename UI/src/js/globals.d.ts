// globals.d.ts
import type * as LogLevel from "loglevel";

declare global {
  const log: typeof LogLevel;
}

import "axios";
declare module "axios" {
  export interface AxiosResponse {
    success: boolean;
  }
}
