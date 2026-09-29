import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../../lib/admin/auth.ts';
import { ReviewPublicationError, setReviewPublication } from '../../../../../lib/airbnb-admin/publication.ts';
export const prerender = false;
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.adminUser) return new Response('Unauthorised.', { status: 401 });
  if (!isSameOrigin(request)) return new Response('Cross-site request forbidden.', { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return new Response('A form request is required.', { status: 415 });
  let form: FormData;
  try { form = await request.formData(); } catch { return new Response('Invalid form request.', { status: 400 }); }
  const id = String(form.get('id') || '');
  const action = form.get('action');
  const revision = String(form.get('revision') ?? '');
  if (!['publish', 'unpublish'].includes(String(action)) || !/^\d+$/u.test(revision)) return new Response('Invalid publication request.', { status: 400 });
  try {
    await setReviewPublication({ id, published: action === 'publish', revision: Number(revision), adminUserId: locals.adminUser.id });
    return new Response(null, { status: 303, headers: { Location: `/admin/airbnb/reviews/${id}/?publication=saved`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ReviewPublicationError) return new Response(error.message, { status: error.status });
    console.error('Review publication could not be saved.');
    return new Response('The change could not be saved. Return to the review and try again.', { status: 500 });
  }
};
export const ALL: APIRoute = async () => new Response('Method not allowed.', { status: 405, headers: { Allow: 'POST' } });
