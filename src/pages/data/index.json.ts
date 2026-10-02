import type { APIRoute } from 'astro';
import { loadIndex } from '../../lib/results.ts';

/** Every run in compact form, for the pages that work in the browser: trends and compare. */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await loadIndex()), { headers: { 'Content-Type': 'application/json' } });
