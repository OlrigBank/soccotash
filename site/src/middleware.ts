import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from './lib/admin/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  const isAdminApi = path.startsWith('/api/admin/');
  const isPublicAuthRoute = path === '/admin/login/' || path === '/admin/login';

  context.locals.adminUser = null;
  if (!isAdmin && !isAdminApi) return next();

  const privateAdminResponse = (response: Response) => {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return response;
  };

  const tokenTaskPaths = new Set([
    '/api/admin/sync-calendars',
    '/api/admin/sync-calendars/',
    '/api/admin/process-notification-fallbacks',
    '/api/admin/process-notification-fallbacks/',
    '/api/admin/process-inbound-whatsapp-replies',
    '/api/admin/process-inbound-whatsapp-replies/',
  ]);
  const maintenanceToken = process.env.CALENDAR_SYNC_TOKEN?.trim();
  if (isAdminApi && tokenTaskPaths.has(path) && maintenanceToken
    && context.request.headers.get('authorization') === `Bearer ${maintenanceToken}`) {
    return privateAdminResponse(await next());
  }

  const user = await getSessionUser(context.cookies);
  context.locals.adminUser = user;

  if (isPublicAuthRoute) {
    if (user && context.request.method === 'GET') return privateAdminResponse(context.redirect('/admin/'));
    return privateAdminResponse(await next());
  }

  if (!user) {
    if (isAdminApi) return privateAdminResponse(Response.json({ error: 'Unauthorized.' }, { status: 401 }));
    const returnTo = encodeURIComponent(path + context.url.search);
    return privateAdminResponse(context.redirect(`/admin/login/?returnTo=${returnTo}`));
  }

  return privateAdminResponse(await next());
});
