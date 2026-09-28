import { jsonResponse, corsPreflight } from './_shared';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestGet(context: any) {
  const env = context.env || {};
  return jsonResponse({
    status: 'ok',
    hasGeminiKey: Boolean(env.GEMINI_API_KEY),
    runtime: 'cloudflare-pages-functions',
    timestamp: new Date().toISOString(),
  });
}

export async function onRequest(context: any) {
  if (context.request.method === 'OPTIONS') return corsPreflight();
  return onRequestGet(context);
}
