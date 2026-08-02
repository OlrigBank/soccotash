export function validateOfferTotal(amounts: Array<number | null>): string | null {
  if (amounts.some((amount) => amount === null)) {
    return 'Enter each amount in pounds with no more than two decimal places.';
  }

  const totalPence = (amounts as number[]).reduce((sum, amount) => sum + amount, 0);
  if (totalPence <= 0) return 'Enter an agreed price greater than £0 before publishing the offer.';
  return null;
}
