import { isSameBookerOrigin } from './lib/booker/origin.ts';
import { sessionAccount } from './lib/booker/accounts.ts';
import { bookerContext, validBookingReference } from './lib/booker/context.ts';
import { resolveBookingAccessCredential } from './lib/booking/booking-access.ts';
import { defineMiddleware, sequence } from 'astro:middleware';
import { getSessionUser } from './lib/admin/auth';

const adminMiddleware = defineMiddleware(async (context, next) => {
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

const bookerMiddleware = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const relevant = path.startsWith('/booking/') || path.startsWith('/api/booker/') || path.startsWith('/api/booking/') || path.startsWith('/api/provisional-bookings');
  if (!relevant) return next();
  const privateHeaders = (response: Response) => {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return response;
  };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(context.request.method) && !isSameBookerOrigin(context.request))
    return privateHeaders(new Response('Cross-origin request rejected.', { status: 403 }));
  // The guest planner retains its separate password/session check in the rendered page.
  const guestPlanner = /^\/booking\/manage\/[^/]+\/planner\/$/.test(path) && context.url.searchParams.get('guest') === '1';
  const accountId = await sessionAccount(context.cookies);
  return bookerContext.run({ accountId }, async () => {
    const match = path.match(/^\/(?:booking\/manage|api\/booking\/(?:messages|planner))\/([^/]+)/);
    if (match && !guestPlanner) {
      if (!validBookingReference(match[1])) return privateHeaders(context.redirect('/booking/', 303));
      if (!accountId) return privateHeaders(path.startsWith('/api/') ? Response.json({ error: 'Sign in to access your booking.' }, { status: 401 }) : context.redirect('/booking/?returnTo=' + encodeURIComponent(path), 303));
      if (!(await resolveBookingAccessCredential(match[1])).allowed) return privateHeaders(new Response('Booking not found.', { status: 404 }));
    }
    return privateHeaders(await next());
  });
});
export const onRequest = sequence(bookerMiddleware, adminMiddleware);
