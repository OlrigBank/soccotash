import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../../../lib/admin/auth.ts';
import { getProperties } from '../../../../../../lib/booking/config.ts';
import { loadReservationExport } from '../../../../../../lib/pricing/reservation-export-repository.ts';
import { buildReservationArchive } from '../../../../../../lib/pricing/reservation-export.ts';
import { ReservationExportLimitError } from '../../../../../../lib/pricing/reservation-export-types.ts';

export const prerender = false;
export const POST: APIRoute = async ({ request, locals }) => {
  const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
  if (!locals.adminUser) return Response.json({ error: 'Unauthorised.' }, { status: 401, headers });
  if (!isSameOrigin(request)) return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers });
  try {
    const source = await loadReservationExport();
    if (!source.length) return Response.json({ error: 'No imported reservations are available to export.' }, { status: 404, headers });
    const result = buildReservationArchive(source, new Date(), getProperties().map(p => p.id));
    return new Response(result.archive, { headers: { ...headers, 'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${result.filename}"`, 'x-reservation-count': String(result.reservationCount),
      'x-financial-line-count': String(result.financialLineCount) } });
  } catch (error) {
    // Never log an error object which might contain financial text or connection details.
    const limited = error instanceof ReservationExportLimitError;
    return Response.json({ error: limited ? 'The reservation evidence exceeds the export size limit. Please contact the administrator.' : 'The reservation export could not be created. Please try again.' }, { status: limited ? 422 : 503, headers });
  }
};
