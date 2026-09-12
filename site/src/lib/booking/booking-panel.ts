export type StaySelection = {
  propertyId: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

export type PanelQuote = {
  automaticOffer?: boolean;
  reviewReason?: string | null;
  pricingAvailable?: boolean;
  administratorPriced?: boolean;
  hostDecisionRequired?: boolean;
  eligible?: boolean;
  currency?: string;
  nights?: number;
  guestTotalPence?: number;
  plan?: { id?: string; version?: number };
  lines?: Array<{ label?: string; detail?: string; amountPence?: number }>;
  restrictions?: string[];
  warnings?: string[];
  message?: string;
  error?: string;
  estimatedPricing?: { currency?: string; nights?: number; guestTotalPence?: number } | null;
};

export type BookingPanelState = { selection: StaySelection; quote: PanelQuote | null };
export type BookingPanelCheck = { initialContinuation: boolean; checking: boolean; error: string };
export type BookingPanelElement = HTMLElement & {
  bookingPanel?: {
    getState: () => BookingPanelState;
    getCheckState: () => BookingPanelCheck;
    check: () => void;
    invalidate: () => void;
    setQuote: (quote: PanelQuote) => void;
  };
};

export type AvailabilityBlock = { startsOn: string; endsOn: string };

export function rangeIsBlocked(blocks: AvailabilityBlock[], start: string, end: string): boolean {
  return blocks.some((block) => block.startsOn < end && block.endsOn > start);
}

export function nightIsBlocked(blocks: AvailabilityBlock[], date: string): boolean {
  return blocks.some((block) => block.startsOn <= date && date < block.endsOn);
}
