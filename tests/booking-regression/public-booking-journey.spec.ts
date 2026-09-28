import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function verifyFromMailbox(page: Page, email: string) {
  const code = page.getByLabel('Verification code', { exact: true });
  await expect(code).toBeVisible();
  const messages = await (await page.request.get(`/__mailbox/?email=${encodeURIComponent(email)}`)).json();
  const message = messages.filter((item: { subject: string }) => item.subject.includes('verification code')).at(-1);
  await code.fill(message.text.match(/\b\d{6}\b/)[0]);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
}

for (const [index, entry] of ['/', '/listings/cottage/', '/book/'].entries()) {
  test(`fresh guest completes the public journey from ${entry} and resumes their booking`, async ({ page, context }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const email = `public-${randomUUID()}@example.test`;
    await page.goto(entry);
    const panel = page.locator('[data-compact-booking-panel]').first();
    await panel.locator('[data-compact-date-trigger]').click();
    const monthOffset = 1 + ['phone', 'tablet', 'desktop'].indexOf(info.project.name) * 3 + index;
    for (let month = 0; month < monthOffset; month++) await panel.getByRole('button', { name: 'Show next month' }).click();
    const date = new Date(); date.setUTCDate(10); date.setUTCMonth(date.getUTCMonth() + monthOffset);
    const arrival = date.toISOString().slice(0, 10);
    date.setUTCDate(14); const departure = date.toISOString().slice(0, 10);
    await panel.locator(`[data-date="${arrival}"]`).click();
    await panel.locator(`[data-date="${departure}"]`).click();
    await panel.locator('[data-compact-booking-form] button[type="submit"]').click();
    await panel.getByRole('button', { name: 'Book', exact: true }).click();
    await expect(page).toHaveURL(/\/book\//);
    await expect(page.getByLabel('Booker name')).toBeVisible();
    await page.getByLabel('Booker name').fill('Public Journey');
    await page.getByLabel('Booker email').fill(email);
    await page.getByLabel('Booker name').focus();
    await verifyFromMailbox(page, email);
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(page).toHaveURL(/\/payment\/$/);
    const payment = page.url();
    const reference = new URL(payment).pathname.split('/')[3];
    await expect(page.getByRole('heading', { name: 'Payment details' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText(email);
    await expect(page.getByRole('link', { name: 'View reservation details', exact: true })).toHaveCount(0);
    await page.goto('/booking/');
    await expect(page).toHaveURL(payment);
    await page.goto('/booking/?all=1');
    await page.getByRole('link', { name: /Continue to payment/ }).click();
    await expect(page).toHaveURL(payment);
    await page.goto(`/booking/manage/${reference}/`);
    await expect(page).toHaveURL(payment);
    // Re-authentication preserves the exact earlier step requested by a saved edit link.
    await page.request.post('/__mailbox/advance-cooldown');
    await context.clearCookies();
    await page.goto(`/book/?booking=${reference}&step=details`);
    await expect(page.getByRole('form', { name: 'Booker sign-in' })).toBeVisible();
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
    await verifyFromMailbox(page, email);
    await expect(page).toHaveURL(new RegExp(`/book/\\?booking=${reference}&step=details`));
    await expect(page.getByLabel('Booker name')).toHaveValue('Public Journey');
    await page.getByLabel('Booker name').fill('Public Journey Updated');
    await page.getByRole('button', { name: 'Save and continue to payment' }).click();
    await expect(page).toHaveURL(payment);
    await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText('Public Journey Updated');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
