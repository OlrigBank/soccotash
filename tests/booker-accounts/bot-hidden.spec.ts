import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createReservationFixture } from '../support/reservation-fixture.mjs';

test('Booker conversation shows only people while bot notices remain recorded', async ({ page, context, baseURL }) => {
  const fixture = await createReservationFixture();
  const path = `/booking/manage/${fixture.booking.reference}/messages/`;
  const errors: string[] = [];
  const adminEmail = `bot-hidden-${randomUUID()}@example.test`;
  page.on('pageerror', error => errors.push(error.message));
  try {
    const rows = [
      ['bot', 'Olrig Bot', 'system', 'Recorded initial status'],
      ['administrator', 'Jenna', 'message', 'Human administrator message'],
      ['bot', 'Olrig Bot', 'system', 'Recorded offer status'],
      ['booker', fixture.name, 'message', 'Human Booker reply'],
    ];
    for (const [senderType, senderName, messageType, body] of rows) {
      await fixture.database.query(`INSERT INTO booking_messages(provisional_booking_id,sender_type,sender_name,message_type,body,booker_read_at,admin_read_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [fixture.booking.id, senderType, senderName, messageType, body,
          senderType === 'booker' ? new Date() : null, senderType === 'administrator' ? new Date() : null]);
    }
    await context.addCookies([{ name: 'olrig_booker_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Conversation with Olrig Bank' })).toBeVisible();
    await expect(page.locator('.booking-message')).toHaveCount(2);
    await expect(page.locator('.booking-message-list')).toContainText('Human administrator message');
    await expect(page.locator('.booking-message-list')).toContainText('Human Booker reply');
    await expect(page.locator('.booking-message-list')).not.toContainText('Olrig Bot');
    await expect(page.locator('.booking-message-list')).not.toContainText('Recorded initial status');
    const initial = await (await page.request.get(`/api/booking/messages/${fixture.booking.reference}/?after=0`)).json();
    expect(initial.messages.map((message: { senderType: string }) => message.senderType)).toEqual(['administrator', 'booker']);

    await fixture.database.query(`INSERT INTO booking_messages(provisional_booking_id,sender_type,sender_name,message_type,body)
      VALUES($1,'bot','Olrig Bot','system','Recorded later status')`, [fixture.booking.id]);
    await fixture.database.query(`INSERT INTO booking_messages(provisional_booking_id,sender_type,sender_name,message_type,body,admin_read_at)
      VALUES($1,'administrator','Jenna','message','Later human message',NOW())`, [fixture.booking.id]);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('.booking-message-list')).toContainText('Later human message');
    await expect(page.locator('.booking-message-list')).not.toContainText('Recorded later status');
    expect((await fixture.database.query("SELECT COUNT(*)::int AS count FROM booking_messages WHERE provisional_booking_id=$1 AND sender_type='bot'", [fixture.booking.id])).rows[0].count).toBe(3);
    const administrator = (await fixture.database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES($1,'Disposable administrator','unusable-fixture-hash') RETURNING id", [adminEmail])).rows[0];
    const adminToken = randomBytes(32).toString('base64url');
    await fixture.database.query("INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')", [administrator.id, createHash('sha256').update(adminToken).digest('hex')]);
    await context.addCookies([{ name: 'olrig_admin_session', value: adminToken, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
    await page.goto('/admin/bookings/');
    await expect(page.locator('tr').filter({ hasText: fixture.name })).toContainText('1 new');
    await page.goto(`/admin/bookings/${fixture.booking.reference}/messages/`);
    await expect(page.locator('.booking-message')).toHaveCount(3);
    await expect(page.locator('.booking-message-list')).not.toContainText('Olrig Bot');
    await expect(page.locator('.booking-message-list')).toContainText('Later human message');
    const adminMessages = await (await page.request.get(`/api/admin/bookings/${fixture.booking.reference}/messages?after=0`)).json();
    expect(adminMessages.messages.map((message: { senderType: string }) => message.senderType)).toEqual(['administrator', 'booker', 'administrator']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await fixture.database.query('DELETE FROM admin_users WHERE email=$1', [adminEmail]);
    await fixture.cleanup();
  }
});
