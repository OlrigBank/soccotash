import type { Pool, PoolClient } from 'pg';
import { getPool } from '../booking/db.ts';

export type PublishedBaseNightlyPrice = {
  currency: string;
  amountPence: number;
};

type BasePriceRow = {
  property_id: string;
  currency: string;
  amount_pence: string | number;
};

type Queryable = Pick<Pool | PoolClient, 'query'>;

export async function getPublishedBaseNightlyPrices(
  propertyIds: string[],
  database: Queryable = getPool(),
): Promise<Record<string, PublishedBaseNightlyPrice | null>> {
  const prices: Record<string, PublishedBaseNightlyPrice | null> = Object.fromEntries(
    propertyIds.map((propertyId) => [propertyId, null]),
  );
  if (propertyIds.length === 0) return prices;

  const result = await database.query<BasePriceRow>(
    `SELECT p.property_id,
            p.currency,
            r.action ->> 'amountPence' AS amount_pence
       FROM pricing_plans p
       JOIN pricing_rules r ON r.plan_id = p.id
      WHERE p.status = 'published'
        AND p.property_id = ANY($1::text[])
        AND r.enabled = TRUE
        AND r.type = 'default_nightly_price'`,
    [propertyIds],
  );

  for (const row of result.rows) {
    const amountPence = Number(row.amount_pence);
    if (Number.isSafeInteger(amountPence) && amountPence >= 0) {
      prices[row.property_id] = { currency: row.currency, amountPence };
    }
  }
  return prices;
}

export function formatBaseNightlyPrice(price: PublishedBaseNightlyPrice | null | undefined): string {
  if (!price) return 'Ask for price';
  const amount = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: price.amountPence % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price.amountPence / 100);
  return amount;
}
