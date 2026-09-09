import { test, expect } from '@playwright/test';
import { createReservationFixture } from '../support/reservation-fixture.mjs';

test('booking root opens Reservation and retains statuses, notices and section links', async ({page, context, baseURL}) => {
  const fixture = await createReservationFixture();
  const root = `/booking/manage/${fixture.booking.reference}/`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await context.addCookies([{name:'olrig_booker_session',value:fixture.token,url:baseURL!,httpOnly:true,sameSite:'Lax'}]);
    for (const [status, heading] of [
      ['pending', 'Booking request received'], ['offered', 'Booking offer ready'],
      ['payment_pending', 'Deposit required'], ['payment_reported', 'Payment reported — awaiting verification'],
      ['confirmed', 'Booking confirmed · balance outstanding'], ['cancelled', 'Booking cancelled'],
    ]) {
      await fixture.setStatus(status);
      await page.goto(root);
      await expect(page).toHaveTitle(/^Your booking ·/);
      await expect(page.locator('.booker-page-header .eyebrow')).toHaveText('Your booking');
      await expect(page.locator('.booker-page-header')).toContainText('19 October 2099 to 23 October 2099');
      await expect(page.getByRole('complementary', {name:'Reservation details'})).toBeVisible();
      await expect(page.getByRole('heading', {name:heading, exact:true})).toBeVisible();
      await expect(page.getByRole('navigation',{name:'Your booking'}).locator('[aria-current="page"]')).toContainText('Reservation');
      await expect(page.getByText('Booking overview',{exact:true})).toHaveCount(0);
      await expect(page.getByRole('button',{name:'Copy booking link'})).toHaveCount(0);
      await expect(page.getByRole('heading',{name:'Save this booking link'})).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
      if (status === 'pending') {
        // Exercise server-side validation on the newly visible root form without cancelling.
        await page.locator('form').filter({has:page.locator('input[value="cancel-booking"]')}).evaluate((form: HTMLFormElement) => { form.noValidate = true; });
        await page.getByRole('button',{name:'Cancel request',exact:true}).click();
        await expect(page).toHaveURL(`${baseURL}${root}`);
        await expect(page.getByRole('alert')).toContainText('Confirm that this booking should be cancelled');
        await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
        expect((await fixture.database.query('SELECT status FROM provisional_bookings WHERE id=$1',[fixture.booking.id])).rows[0].status).toBe('pending');
      }
    }
    await page.goto(`${root}?cancelled=1`);
    await expect(page.getByRole('status')).toContainText('Your cancellation has been recorded');
    const nav = page.getByRole('navigation',{name:'Your booking'});
    await nav.getByRole('link',{name:/Messages/}).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${baseURL}${root}messages/`);
    await expect(nav.locator('[aria-current="page"]')).toContainText('Messages');
    await expect(page.getByRole('heading',{name:'Conversation with Olrig Bank'})).toBeVisible();
    await nav.getByRole('link',{name:/Holiday Planner/}).click();
    await expect(page.getByRole('heading',{name:'Planning dashboard'})).toBeVisible();
    await expect(page.getByText('The Holiday Planner becomes available after this booking is confirmed.')).toBeVisible();
    await page.goto(`${root}reservation/?cancelled=1`);
    await expect(page.getByRole('status')).toContainText('Your cancellation has been recorded');
    await expect(nav.locator('[aria-current="page"]')).toContainText('Reservation');
    await page.goto(`${root}?workspace=messages`);
    await expect(nav.locator('[aria-current="page"]')).toContainText('Messages');
    await context.clearCookies();await page.goto(root);
    await expect(page).toHaveURL(/\/booking\/\?returnTo=/);
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(root);
    expect(errors).toEqual([]);
  } finally {await fixture.cleanup();}
});
