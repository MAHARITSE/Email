/**
 * Cloudflare Worker entry point — "Workers + Static Assets" deployment.
 *
 * Why this file exists
 * --------------------
 * `npx wrangler deploy` deploys a **Worker** (script + static assets), not a
 * Cloudflare **Pages** project. The SPA itself is uploaded from `./dist`
 * (see `assets` in wrangler.jsonc) and every `/api/*` request is routed here
 * through `assets.run_worker_first`.
 *
 * The API implementation lives in `functions/` (written as Cloudflare Pages
 * Functions handlers: `onRequestGet`, `onRequestPost`, ...). Pages Functions
 * and Workers use the same runtime, so this entry point simply rebuilds the
 * small Pages `context` object and dispatches to those very same handlers.
 * That way there is a single implementation of the API, deployable either as a
 * Worker (`npx wrangler deploy`) or as a Pages project with `functions/`.
 *
 * Routes (see functions/api/**):
 *   GET  /api/health
 *   POST /api/ai/classify-emails
 *   POST /api/ai/improve-email
 *   POST /api/ai/suggest-reply
 *   POST /api/ai/draft-email
 */

import * as apiMiddleware from '../functions/_middleware';
import * as health from '../functions/api/health';
import * as classifyEmails from '../functions/api/ai/classify-emails';
import * as improveEmail from '../functions/api/ai/improve-email';
import * as suggestReply from '../functions/api/ai/suggest-reply';
import * as draftEmail from '../functions/api/ai/draft-email';
import { jsonResponse } from '../functions/api/_shared';

/** Runtime environment: secrets/vars come from wrangler.jsonc + `wrangler secret put`. */
interface Env {
  GEMINI_API_KEY?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  /** Static assets binding (declared as `assets.binding` in wrangler.jsonc). */
  ASSETS?: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type MaybePromise<T> = T | Promise<T>;

interface PagesContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
  data: Record<string, unknown>;
  functionPath: string;
  next: () => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
}

type PagesHandler = (context: PagesContext) => MaybePromise<Response>;

interface PagesModule {
  onRequest?: PagesHandler;
  onRequestGet?: PagesHandler;
  onRequestPost?: PagesHandler;
  onRequestPut?: PagesHandler;
  onRequestPatch?: PagesHandler;
  onRequestDelete?: PagesHandler;
  onRequestOptions?: PagesHandler;
}

/** Same mapping as `functions/`: one module per route, `_`-prefixed files excluded. */
const API_ROUTES: Record<string, PagesModule> = {
  '/api/health': health,
  '/api/ai/classify-emails': classifyEmails,
  '/api/ai/improve-email': improveEmail,
  '/api/ai/suggest-reply': suggestReply,
  '/api/ai/draft-email': draftEmail,
};

/** `GET` -> `onRequestGet`, `OPTIONS` -> `onRequestOptions`, ... */
function methodHandlerName(method: string): keyof PagesModule {
  const capitalized = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  return `onRequest${capitalized}` as keyof PagesModule;
}

/** `/api/health/` and `/api/health` must resolve to the same handler. */
function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '');
  return pathname;
}

function buildContext(request: Request, env: Env, ctx: ExecutionContext, next: () => Promise<Response>): PagesContext {
  return {
    request,
    env,
    params: {},
    data: {},
    functionPath: new URL(request.url).pathname,
    next,
    waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
  };
}

/** Mirrors the Pages Functions router: method handler first, then `onRequest`. */
function handleApiRequest(request: Request, env: Env, ctx: ExecutionContext): MaybePromise<Response> {
  const pathname = normalizePath(new URL(request.url).pathname);
  const mod = API_ROUTES[pathname];

  if (!mod) {
    return jsonResponse({ error: 'Not found', path: pathname }, 404);
  }

  const notFoundHere = () => Promise.resolve(jsonResponse({ error: 'Not found', path: pathname }, 404));
  const context = buildContext(request, env, ctx, notFoundHere);
  const handler = mod[methodHandlerName(request.method)] ?? mod.onRequest;

  if (!handler) {
    return jsonResponse({ error: `Method ${request.method} not allowed`, path: pathname }, 405);
  }

  return handler(context);
}

/** Runs `functions/_middleware.ts` (global CORS + logging) around the API router. */
function handleWithMiddleware(request: Request, env: Env, ctx: ExecutionContext): MaybePromise<Response> {
  const middleware = apiMiddleware as PagesModule;
  if (typeof middleware.onRequest !== 'function') {
    return handleApiRequest(request, env, ctx);
  }

  const context = buildContext(request, env, ctx, () => Promise.resolve(handleApiRequest(request, env, ctx)));
  return middleware.onRequest(context);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Only /api/* reaches this Worker (see `assets.run_worker_first`).
    // Everything else is served by Cloudflare's static asset layer, with
    // index.html as the SPA fallback (`assets.not_found_handling`).
    if (!pathname.startsWith('/api/')) {
      if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
      return jsonResponse({ error: 'Not found', path: pathname }, 404);
    }

    return handleWithMiddleware(request, env, ctx);
  },
};
