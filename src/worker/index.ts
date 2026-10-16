import type { Env, ExecutionContext } from './types.ts';
export * from './db/index.ts';

/**
 * Cloudflare Worker Entry Point for PsychoMaster (روان‌لینگو)
 * Phase 4C: Hardened Health Endpoint & Secure D1 Integration
 *
 * Database Name: psychomaster-db
 * Database ID: 13bf8598-0513-4c29-81d9-2c0fa79f5ef8
 * D1 Binding Name: DB
 *
 * Scope & Guardrails:
 * - Read-only harmless connectivity check on /api/d1/health (GET only).
 * - Zero schema table metadata exposed.
 * - Zero user data or internal error details leaked.
 * - Cache-Control: no-store enforced.
 */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Hardened D1 Connectivity Health Check endpoint
    if (url.pathname === '/api/d1/health' || url.pathname === '/api/d1-health') {
      // 1. Enforce GET only
      if (request.method !== 'GET') {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Method Not Allowed'
          }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'GET',
              'Cache-Control': 'no-store'
            }
          }
        );
      }

      try {
        if (!env.DB) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Database service is unavailable'
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
              }
            }
          );
        }

        // Execute harmless connectivity query (minimal footprint, zero metadata exposure)
        const startTime = Date.now();
        const testResult = await env.DB.prepare(
          "SELECT 1 AS connection_test, datetime('now') AS server_utc"
        ).first<{
          connection_test: number;
          server_utc: string;
        }>();
        const latencyMs = Date.now() - startTime;

        return new Response(
          JSON.stringify({
            ok: true,
            status: 'connected',
            database: 'psychomaster-db',
            binding: 'DB',
            latencyMs,
            result: testResult
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store'
            }
          }
        );
      } catch (_err: unknown) {
        // Controlled, safe error response without exposing database errors, queries, or stack traces
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Failed to verify database connectivity'
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store'
            }
          }
        );
      }
    }

    // Pass-through to static assets (SPA) if ASSETS binding is present
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Default info response for worker entry point
    return new Response(
      JSON.stringify({
        name: 'psychomaster-worker',
        version: 'phase-4e',
        endpoints: ['/api/d1/health', '/api/d1-health']
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  }
};
