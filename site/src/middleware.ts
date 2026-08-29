import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from './lib/admin/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  const isAdminApi = path.startsWith('/api/admin/');
  const isPublicAuthRoute = path === '/admin/login/' || path === '/admin/login';

  context.locals.adminUser = null;
  if (!isAdmin && !isAdminApi) return next();

  const tokenTaskPaths = new Set([
    '/api/admin/sync-calendars',
    '/api/admin/sync-calendars/',
    '/api/admin/process-notification-fallbacks',
    '/api/admin/process-notification-fallbacks/',
  ]);
  const maintenanceToken = process.env.CALENDAR_SYNC_TOKEN?.trim();
  if (isAdminApi && tokenTaskPaths.has(path) && maintenanceToken
    && context.request.headers.get('authorization') === `Bearer ${maintenanceToken}`) {
    return next();
  }

  const user = await getSessionUser(context.cookies);
  context.locals.adminUser = user;

  if (isPublicAuthRoute) {
    if (user && context.request.method === 'GET') return context.redirect('/admin/');
    return next();
  }

  if (!user) {
    if (isAdminApi) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    const returnTo = encodeURIComponent(path + context.url.search);
    return context.redirect(`/admin/login/?returnTo=${returnTo}`);
  }

  return next();
});
