import type { APIRoute } from 'astro';
import schema from '../../../../lib/planner/ai-representation.schema.json';
import { resolveAiCapabilityCredential } from '../../../../lib/planner/ai-capability-access.ts';

export const prerender = false;
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Type': 'application/schema+json; charset=utf-8',
};

export const GET: APIRoute = async ({ params }) => {
  const access = await resolveAiCapabilityCredential(String(params.token || ''), true);
  if (!access) return new Response(JSON.stringify({ error: 'AI collaboration not found.' }), { status: 404, headers });
  return new Response(JSON.stringify(schema), { status: 200, headers });
};
