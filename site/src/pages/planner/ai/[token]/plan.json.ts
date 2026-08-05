import type { APIRoute } from 'astro';
import { authorizeAiCapabilityRequest } from '../../../../lib/planner/ai-capability-access.ts';
import { createAiPlanRepresentationV1 } from '../../../../lib/planner/ai-representation.ts';
import { getHolidayPlan } from '../../../../lib/planner/repository.ts';

export const prerender = false;
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Type': 'application/json; charset=utf-8',
};

export const GET: APIRoute = async ({ params }) => {
  const authorization = await authorizeAiCapabilityRequest(String(params.token || ''), 'read');
  if (authorization.rateLimited) return new Response(JSON.stringify({ error: 'AI collaboration rate limit exceeded.' }), { status: 429, headers: { ...headers, 'Retry-After': '900' } });
  const access = authorization.access;
  if (!access) return new Response(JSON.stringify({ error: 'AI collaboration not found.' }), { status: 404, headers });
  const plan = await getHolidayPlan(access.planId);
  if (!plan) return new Response(JSON.stringify({ error: 'AI collaboration not found.' }), { status: 404, headers });
  return new Response(JSON.stringify(createAiPlanRepresentationV1(plan)), { status: 200, headers });
};
