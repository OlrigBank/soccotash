import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../../lib/admin/auth.ts';
import { AirbnbAdminDecisionError, decideAirbnbReconciliationCandidate } from '../../../../../lib/airbnb-admin/repository.ts';
export const prerender = false;
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.adminUser) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: 'Cross-site request forbidden.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'A JSON request is required.' }, { status: 415 });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: 'A valid JSON request is required.' }, { status: 400 }); }
  if (input.confirmation !== true) return Response.json({ error: 'Explicit confirmation is required.' }, { status: 400 });
  const decision = input.decision === 'confirmed' || input.decision === 'rejected' ? input.decision : null;
  if (!decision) return Response.json({ error: 'Decision must be confirmed or rejected.' }, { status: 400 });
  try {
    await decideAirbnbReconciliationCandidate({ candidateId: String(input.candidateId || ''), decision, adminUserId: locals.adminUser.id });
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof AirbnbAdminDecisionError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
      return Response.json({ error: error.message, code: error.code }, { status, headers: { 'cache-control': 'no-store' } });
    }
    console.error('Airbnb reconciliation decision failed.');
    return Response.json({ error: 'The reconciliation decision could not be completed.' }, { status: 500 });
  }
};
export const ALL: APIRoute = async () => Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
