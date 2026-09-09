import { isSameOrigin } from '../admin/auth.ts';
/** Native form POSTs from no-referrer pages can carry Origin: null. Fetch Metadata
 * is browser-controlled and still proves that these navigations are same-origin. */
export function isSameBookerOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') return isSameOrigin(request);
  return request.headers.get('sec-fetch-site') === 'same-origin';
}
