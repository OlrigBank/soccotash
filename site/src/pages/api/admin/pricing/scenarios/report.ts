import type { APIRoute } from 'astro';
import { getPricingScenarioRun } from '../../../../../lib/pricing/repository';
import { pricingScenarioCsv } from '../../../../../lib/pricing/reports';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.adminUser) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  const runId = url.searchParams.get('run') || '';
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const run = await getPricingScenarioRun(runId);
  if (!run) return Response.json({ error: 'Scenario report not found.' }, { status: 404 });
  const filename = `${run.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pricing-scenario'}-${run.input.startDate}-${run.input.endDate}.${format}`;
  if (format === 'json') {
    return new Response(JSON.stringify(run, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  }
  return new Response(pricingScenarioCsv(run), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
};
