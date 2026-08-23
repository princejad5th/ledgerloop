import Decimal from 'decimal.js';

export type SupportedPlatform = 'EBAY' | 'ETSY' | 'DEPOP';

/** A single parsed transaction (one row from a marketplace CSV). */
export interface ParsedTransaction {
  rowNumber: number;
  platform: SupportedPlatform;
  externalOrderId: string | null;
  externalTransactionId: string | null;
  occurredAt: Date;
  kind: 'SALE' | 'REFUND' | 'FEE' | 'SHIPPING_LABEL' | 'OTHER';
  /** Signed GBP. Positive for income, negative for fees/refunds. */
  amount: Decimal;
  description: string;
  raw: Record<string, string>;
}

/** A parsed item, aggregated from one or more transactions sharing an order ID. */
export interface ParsedItem {
  platform: SupportedPlatform;
  externalListingId: string;
  title: string;
  soldAt: Date | null;
  /** Gross sale price (without shipping). */
  soldPrice: Decimal;
  shippingCharged: Decimal;
  platformFees: Decimal;
  paymentFees: Decimal;
  shippingOutCost: Decimal;
  refundAmount: Decimal;
  buyerCountry: string | null;
  rawTransactions: ParsedTransaction[];
}

/** A row that did not match the expected schema or could not be assigned to an item. */
export interface UnmatchedRow {
  rowNumber: number;
  reason: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  /** Detected platform from the column headers. Null if unknown. */
  platform: SupportedPlatform | null;
  items: ParsedItem[];
  transactions: ParsedTransaction[];
  unmatched: UnmatchedRow[];
  /** Headers found in the uploaded file. Useful for the UI's mapping step. */
  headers: string[];
}
