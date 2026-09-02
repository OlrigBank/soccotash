import { expect, test, type Page } from '@playwright/test';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const { Client } = pg;
const ADMIN_EMAIL = 'playwright-airbnb-admin@example.test';
const ADMIN_PASSWORD = 'playwright-airbnb-admin-password';

async function withDatabase<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function passwordHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await promisify(crypto.scrypt)(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }) as Buffer;
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/admin/login/');
  await page.getByLabel('Email address').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/$/u);
}

test.beforeAll(async () => {
  await withDatabase(async (client) => {
    await client.query(`DELETE FROM admin_users WHERE email = $1`, [ADMIN_EMAIL]);
    await client.query(
      `INSERT INTO admin_users(email, display_name, password_hash)
       VALUES($1, 'Playwright Airbnb administrator', $2)`,
      [ADMIN_EMAIL, await passwordHash(ADMIN_PASSWORD)],
    );
  });
});

test.afterAll(async () => {
  await withDatabase((client) => client.query(`DELETE FROM admin_users WHERE email = $1`, [ADMIN_EMAIL]));
});

test('anonymous requests disclose no imported data and carry privacy headers', async ({ request }) => {
  const pageResponse = await request.get('/admin/airbnb/', { maxRedirects: 0 });
  expect(pageResponse.status()).toBe(302);
  expect(pageResponse.headers()['location']).toContain('/admin/login/');
  expect(pageResponse.headers()['cache-control']).toBe('private, no-store');
  expect(pageResponse.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive');

  const apiResponse = await request.post('/api/admin/airbnb/reconciliation/', { data: {} });
  expect(apiResponse.status()).toBe(401);
  expect(await apiResponse.json()).toEqual({ error: 'Unauthorized.' });
  expect(apiResponse.headers()['cache-control']).toBe('private, no-store');
});

test('authenticated dashboard workflows are semantic, keyboard reachable and viewport-safe', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/airbnb/');
  await expect(page.getByRole('heading', { level: 1, name: 'Airbnb records' })).toBeVisible();
  await expect(page.getByText('Access-code material is not available')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');

  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#admin-content')).toBeFocused();

  for (const path of ['/admin/airbnb/reservations/', '/admin/airbnb/reviews/', '/admin/airbnb/reconciliation/']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  await page.goto('/admin/airbnb/reservations/');
  const reservationLink = page.getByRole('link', { name: /Open imported reservation|Open reservation/u }).first();
  await expect(reservationLink).toBeVisible();
  await reservationLink.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Conversation' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Financial panels' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Notes and guest profile' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.goto('/admin/airbnb/reviews/');
  await page.getByRole('link', { name: /Open review/u }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Private feedback' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
