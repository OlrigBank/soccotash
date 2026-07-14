import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/booking/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    await getPool().query('SELECT 1');
    return Response.json(
      { status: 'ok', database: 'ok' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('Health check failed.', error);
    return Response.json(
      { status: 'unavailable', database: 'unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
};
