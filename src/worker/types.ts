/**
 * Cloudflare Worker and D1 Type Definitions
 * Isolated to prevent collisions with client-side DOM types in React/Vite.
 */

import type { JWTVerifyGetKey } from 'jose';

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec<T = unknown>(query: string): Promise<D1Result<T>>;
}

export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface WorkerAiClient {
  generateText(params: {
    model: string;
    contents: string;
    systemInstruction?: string;
    responseMimeType?: string;
  }): Promise<string>;
  generateTextStream?(params: {
    model: string;
    contents: string;
    systemInstruction?: string;
  }): AsyncIterable<{ text?: string }>;
}

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  /**
   * Optional JWK key resolution function for isolated cryptographic unit tests.
   * Production always uses Google's remote JWKS endpoint.
   */
  GOOGLE_JWKS?: JWTVerifyGetKey;
  /**
   * Optional AI client override for isolated unit/integration tests.
   */
  AI_CLIENT?: WorkerAiClient;
  /**
   * Optional flag to enforce strict per-IP rate limiting even when synthetic test requests omit IP headers.
   */
  ENFORCE_STRICT_RATE_LIMIT?: boolean;
  /**
   * Optional comma-separated allowlist of verified Google administrator emails for detailed analytics access.
   */
  ADMIN_EMAILS?: string;
  /**
   * Optional comma-separated allowlist of verified administrator user IDs (usr_g_*) for detailed analytics access.
   */
  ADMIN_USER_IDS?: string;
}


