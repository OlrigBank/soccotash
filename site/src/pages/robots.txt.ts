import type { APIRoute } from 'astro';
import { productionAssetUrl } from '../lib/public-metadata.ts';

export const prerender = false;

export const GET: APIRoute = ({ site }) => {
  const sitemap = productionAssetUrl(site ?? new URL('https://olrig-bank.com'), '/sitemap.xml').href;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /booking/',
    'Disallow: /planner/',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
