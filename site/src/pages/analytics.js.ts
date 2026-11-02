import type { APIRoute } from 'astro';
import bootstrap from '../lib/analytics/bootstrap.js?raw';

export const prerender = false;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: APIRoute = () => {
  const websiteId = String(process.env.UMAMI_WEBSITE_ID || '').trim();
  const configuredScriptUrl = String(process.env.UMAMI_SCRIPT_URL || '').trim();
  const scriptUrl = configuredScriptUrl || 'https://cloud.umami.is/script.js';

  let enabled = uuidPattern.test(websiteId);
  try {
    enabled = enabled && new URL(scriptUrl).protocol === 'https:';
  } catch {
    enabled = false;
  }

  const body = enabled
    ? bootstrap.replace('__OLRIG_ANALYTICS_CONFIGURATION__', JSON.stringify({ websiteId, scriptUrl }))
    : '';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
