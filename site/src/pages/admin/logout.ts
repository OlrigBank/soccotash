import type { APIRoute } from 'astro';
import { audit, destroySession, isSameOrigin } from '../../lib/admin/auth';
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (locals.adminUser) await audit(locals.adminUser.id, 'admin.logout');
  await destroySession(cookies);
  return redirect('/admin/login/', 303);
};
