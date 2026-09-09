import { AsyncLocalStorage } from 'node:async_hooks';
export const bookerContext = new AsyncLocalStorage<{ accountId: string | null }>();
export function currentBookerAccountId(): string | null { return bookerContext.getStore()?.accountId ?? null; }
export function validBookingReference(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
