import { test, expect } from '@playwright/test';

test('payment methods, summary and keyboard validation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/__payment-preview/');
  await expect(page.getByRole('heading', { name: 'Make a payment', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View reservation details', exact: true })).toHaveCount(0);
  const summary = page.getByRole('complementary', { name: 'Reservation summary' });
  await expect(summary).toContainText('Alex Example');
  await expect(summary).toContainText('alex@example.test');
  await expect(summary).toContainText('+44 7700 900123');
  await expect(page.getByRole('heading', { name: 'Your contact details' })).toHaveCount(1);
  await expect(page.locator('.payment-main')).not.toContainText('Alex Example');
  const methods = page.getByRole('navigation', { name: 'Payment method', exact: true });
  await expect(methods.getByRole('link', { name: 'Credit or debit card' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Pay £200.00 by card' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Report bank transfer sent' })).toHaveCount(0);
  await methods.getByRole('link', { name: 'Bank transfer' }).focus();
  await page.keyboard.press('Enter');
  await expect(methods.getByRole('link', { name: 'Bank transfer' })).toHaveAttribute('aria-current', 'true');
  expect(await page.evaluate(() => {
    const bar = document.querySelector('.payment-mobile-bar')!;
    return getComputedStyle(bar).display === 'none'
      || document.querySelector('#methods-heading')!.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom;
  })).toBe(true);
  await expect(page.getByRole('button', { name: 'Pay £200.00 by card' })).toHaveCount(0);
  await expect(page.getByText('Disposable preview account')).toBeVisible();
  await page.getByRole('button', { name: 'Report bank transfer sent' }).click();
  await expect(page.getByRole('checkbox', { name: 'I confirm that I have sent this bank transfer.' })).toBeFocused();
  expect(await page.getByRole('checkbox').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await expect(page).toHaveURL(/method=bank/);
  await summary.getByText('Price breakdown', { exact: true }).click();
  await expect(summary).toContainText('Fixture stay');
  await page.getByText('Show refund bands', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await methods.getByRole('link', { name: 'Credit or debit card' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Pay £200.00 by card' })).toBeVisible();
  await page.reload();
  await expect(methods.getByRole('link', { name: 'Credit or debit card' })).toHaveAttribute('aria-current', 'true');
  expect(errors).toEqual([]);
});

test('review, offer, confirmation and unavailable states retain one summary', async ({ page }) => {
  for (const [state, heading] of [
    ['pending', 'Your request is being reviewed'], ['offered', 'Payment details'],
    ['confirmed', 'Reservation confirmed'], ['cancelled', 'Payment is unavailable'],
    ['payment_reported', 'Bank transfer awaiting verification'], ['balance', 'Payment details'],
  ]) {
    await page.goto(`/__payment-preview/?state=${state}`);
    await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toHaveCount(1);
    const reservationLink = page.getByRole('link', { name: 'View reservation details', exact: true });
    if (state === 'confirmed' || state === 'balance') {
      await expect(reservationLink).toBeVisible();
      await expect(reservationLink).toHaveAttribute('href', /\/reservation\/$/);
    } else {
      await expect(reservationLink).toHaveCount(0);
    }
    await expect(page.getByRole('heading', { name: state === 'confirmed' ? 'Reservation confirmed' : 'Make a payment', level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/__payment-preview/?state=pending');
  await expect(page.getByText('Price to be agreed', { exact: true })).toBeVisible();
  await page.goto('/__payment-preview/?state=balance');
  await expect(page.getByRole('button', { name: 'Pay £800.00 by card' })).toBeVisible();
  await page.goto('/__payment-preview/?state=payment_reported');
  await expect(page.getByRole('navigation', { name: 'Payment method', exact: true })).toHaveCount(0);
});
