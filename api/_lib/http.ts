import type { IncomingMessage, ServerResponse } from "node:http";

/** Runtime shape Vercel adds to a standard Node request. */
export interface VercelRequest extends IncomingMessage {
  body: any;
  query: Record<string, string | string[] | undefined>;
  cookies: Record<string, string>;
}

/** Chainable response helpers provided by the Vercel Node runtime. */
export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
  redirect(statusOrUrl: number | string, url?: string): VercelResponse;
}
