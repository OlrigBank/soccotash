import type { APIRoute } from 'astro';
import { isSameOrigin } from '../admin/auth.ts';
import { getProperties } from '../booking/config.ts';
import { parseHistoryInput } from './history.ts';
import { getHistoryReport } from './history-repository.ts';
import { historyCsv } from './history-csv.ts';

export function historyEndpoint(download = false): APIRoute {
  return async ({ request, locals }) => {
    const headers = { 'cache-control': 'private, no-store' };
    if (!locals.adminUser) return Response.json({ error: 'Unauthorised.' }, { status: 401, headers });
    if (!isSameOrigin(request)) return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'JSON request required.' }, { status: 415, headers });
    let input;
    try {
      // Bound the input before parsing; exceptions are the only variable-length settings.
      const raw = await request.text();
      if (raw.length > 32_000) return Response.json({ error: 'Report settings are too large.' }, { status: 413, headers });
      input = parseHistoryInput(JSON.parse(raw), getProperties().map(p => p.id));
    } catch (error) {
      return Response.json({ error: error instanceof SyntaxError ? 'Choose valid report settings.' : error instanceof Error ? error.message : 'Choose valid report settings.' }, { status: 400, headers });
    }
    try {
      const report = await getHistoryReport(input);
      const csv = historyCsv(report);
      if (download) return new Response(csv, { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="historical-pricing-${input.propertyId}-${input.targetYear}.csv"` } });
      // The browser downloads this exact snapshot, rather than recalculating after later imports.
      return Response.json({ report, csv }, { headers });
    } catch (error) {
      const limited = error instanceof Error && error.message.startsWith('The historical range contains too many');
      // Do not log database errors: connection details or imported financial evidence may be attached.
      return Response.json({ error: limited ? (error as Error).message : 'The historical report could not be calculated. Please try again or choose a shorter range.' }, { status: limited ? 422 : 503, headers });
    }
  };
}
