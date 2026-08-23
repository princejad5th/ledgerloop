import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  detectPlatform,
  parseEbay,
  parseEtsy,
  parseDepop,
  parseDecimal,
  parseFlexibleDate,
} from '@/lib/csv';

describe('parseDecimal', () => {
  it('parses plain decimals', () => expect(parseDecimal('12.50')?.toFixed(2)).toBe('12.50'));
  it('parses negatives', () => expect(parseDecimal('-2.99')?.toFixed(2)).toBe('-2.99'));
  it('strips currency + commas', () => expect(parseDecimal('£1,234.56')?.toFixed(2)).toBe('1234.56'));
  it('handles paren negatives', () => expect(parseDecimal('(5.00)')?.toFixed(2)).toBe('-5.00'));
  it('returns null for junk', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });
});

describe('parseFlexibleDate', () => {
  it('parses ISO with T', () => {
    expect(parseFlexibleDate('2025-04-10T12:34:56Z')?.toISOString()).toBe('2025-04-10T12:34:56.000Z');
  });
  it('parses space-separated ISO-ish', () => {
    const d = parseFlexibleDate('2025-04-10 12:34:56');
    expect(d?.getUTCFullYear()).toBe(2025);
    expect(d?.getUTCMonth()).toBe(3);
  });
  it('parses YYYY-MM-DD only', () => {
    expect(parseFlexibleDate('2025-04-10')?.getUTCFullYear()).toBe(2025);
  });
  it('parses UK DD/MM/YYYY', () => {
    expect(parseFlexibleDate('10/04/2025')?.getUTCMonth()).toBe(3);
  });
  it('returns null for empty', () => {
    expect(parseFlexibleDate(null)).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
  });
});

describe('detectPlatform', () => {
  it('detects eBay', () => {
    expect(detectPlatform(['Transaction creation date', 'Order number', 'Net amount', 'Type'])).toBe('EBAY');
  });
  it('detects Etsy', () => {
    expect(detectPlatform(['Sale Date', 'Order ID', 'Order Total', 'Item Total'])).toBe('ETSY');
  });
  it('detects Depop', () => {
    expect(detectPlatform(['Date', 'Buyer username', 'Item description', 'Item price'])).toBe('DEPOP');
  });
  it('returns null for unknown', () => {
    expect(detectPlatform(['Foo', 'Bar', 'Baz'])).toBeNull();
  });
});

describe('parseEbay — Seller Hub Transaction Report', () => {
  it('groups SALE + FEE + SHIPPING_LABEL for one order', () => {
    const rows = [
      { 'Transaction creation date': '2025-05-10 10:00:00', 'Type': 'Order',          'Order number': '12345', 'Transaction ID': 'TX-A', 'Item title': 'Vintage Levi 501', 'Net amount': '45.00',  'Currency': 'GBP', 'Buyer country': 'GB' },
      { 'Transaction creation date': '2025-05-10 10:00:01', 'Type': 'eBay fee',       'Order number': '12345', 'Transaction ID': 'TX-B', 'Net amount': '-5.76',  'Currency': 'GBP' },
      { 'Transaction creation date': '2025-05-11 14:00:00', 'Type': 'Shipping label', 'Order number': '12345', 'Transaction ID': 'TX-C', 'Net amount': '-3.20',  'Currency': 'GBP' },
    ];
    const result = parseEbay(rows);
    expect(result.platform).toBe('EBAY');
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.platform).toBe('EBAY');
    expect(item.soldPrice.toFixed(2)).toBe('45.00');
    expect(item.platformFees.toFixed(2)).toBe('5.76');
    expect(item.shippingOutCost.toFixed(2)).toBe('3.20');
  });

  it('marks orphan fee rows as unmatched', () => {
    const rows = [{ 'Transaction creation date': '2025-05-10 10:00:00', 'Type': 'eBay fee', 'Order number': '99999', 'Net amount': '-1.00', 'Currency': 'GBP' }];
    const result = parseEbay(rows);
    expect(result.items).toHaveLength(0);
    expect(result.unmatched[0].reason).toContain('no SALE row');
  });
});

describe('parseEtsy — Orders CSV', () => {
  it('parses a single Etsy order with explicit fees', () => {
    const rows = [{
      'Sale Date': '2025-06-15',
      'Order ID': '3812457281',
      'Full Name': 'Jane Smith',
      'Item Name': 'Vintage 90s denim jacket',
      'Item Total': '38.00',
      'Shipping': '4.50',
      'Order Total': '42.50',
      'Card Processing Fees': '1.90',
      'Currency': 'GBP',
      'Ship Country': 'United Kingdom',
      'Status': 'Completed',
    }];
    const result = parseEtsy(rows);
    expect(result.platform).toBe('ETSY');
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.platform).toBe('ETSY');
    expect(item.externalListingId).toBe('3812457281');
    expect(item.soldPrice.toFixed(2)).toBe('38.00');
    expect(item.shippingCharged.toFixed(2)).toBe('4.50');
    expect(item.platformFees.toFixed(2)).toBe('1.90');
    expect(item.title).toBe('Vintage 90s denim jacket');
    expect(result.unmatched).toHaveLength(0);
  });

  it('rejects non-GBP rows', () => {
    const rows = [{
      'Sale Date': '2025-06-15', 'Order ID': '1', 'Item Total': '10.00', 'Order Total': '10.00', 'Currency': 'USD',
    }];
    const result = parseEtsy(rows);
    expect(result.items).toHaveLength(0);
    expect(result.unmatched[0].reason).toContain('Non-GBP');
  });

  it('infers fees from Order Net when explicit fee column missing', () => {
    const rows = [{
      'Sale Date': '2025-06-15', 'Order ID': '2',
      'Item Total': '40.00', 'Shipping': '0.00', 'Order Total': '40.00',
      'Order Net': '37.50',
      'Currency': 'GBP',
    }];
    const result = parseEtsy(rows);
    expect(result.items[0].platformFees.toFixed(2)).toBe('2.50');
  });
});

describe('parseDepop — Sales Download', () => {
  it('parses a single Depop sale', () => {
    const rows = [{
      'Date': '2025-07-20',
      'Buyer username': '@vintage_lover',
      'Item description': 'Carhartt detroit jacket size L',
      'Quantity': '1',
      'Item price': '55.00',
      'Selling fee': '0.00',
      'Depop Payment fee': '1.90',
      'Shipping': '3.95',
      'Country': 'GB',
    }];
    const result = parseDepop(rows);
    expect(result.platform).toBe('DEPOP');
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.platform).toBe('DEPOP');
    expect(item.soldPrice.toFixed(2)).toBe('55.00');
    expect(item.shippingCharged.toFixed(2)).toBe('3.95');
    expect(item.platformFees.toFixed(2)).toBe('0.00');
    expect(item.paymentFees.toFixed(2)).toBe('1.90');
  });

  it('applies default 2.9% + £0.30 payment fee when missing', () => {
    const rows = [{
      'Date': '2025-07-20', 'Buyer username': '@x', 'Item description': 'thing',
      'Item price': '50.00', 'Shipping': '0.00',
    }];
    const result = parseDepop(rows);
    // 50 × 0.029 + 0.30 = 1.45 + 0.30 = 1.75
    expect(result.items[0].paymentFees.toFixed(2)).toBe('1.75');
  });

  it('treats refunds as REFUND kind', () => {
    const rows = [{
      'Date': '2025-07-20', 'Buyer username': '@x', 'Item description': 'thing',
      'Item price': '50.00', 'Shipping': '0.00', 'Refunded': '50.00',
    }];
    const result = parseDepop(rows);
    expect(result.items[0].refundAmount.toFixed(2)).toBe('50.00');
    expect(result.transactions[0].kind).toBe('REFUND');
  });
});

describe('parseCsv — top-level dispatcher', () => {
  it('routes an eBay file to the eBay parser', () => {
    const rows = [{ 'Transaction creation date': '2025-05-10 10:00:00', 'Type': 'Order', 'Order number': '1', 'Net amount': '20.00', 'Currency': 'GBP' }];
    const result = parseCsv(rows);
    expect(result.platform).toBe('EBAY');
    expect(result.items).toHaveLength(1);
  });
  it('routes an Etsy file to the Etsy parser', () => {
    const rows = [{ 'Sale Date': '2025-06-15', 'Order ID': '99', 'Item Total': '20.00', 'Order Total': '20.00', 'Currency': 'GBP' }];
    const result = parseCsv(rows);
    expect(result.platform).toBe('ETSY');
    expect(result.items).toHaveLength(1);
  });
  it('routes a Depop file to the Depop parser', () => {
    const rows = [{ 'Date': '2025-07-20', 'Buyer username': '@x', 'Item description': 'thing', 'Item price': '50.00' }];
    const result = parseCsv(rows);
    expect(result.platform).toBe('DEPOP');
    expect(result.items).toHaveLength(1);
  });
  it('falls through when headers are unrecognised', () => {
    const rows = [{ 'Foo': 'a', 'Bar': 'b' }];
    const result = parseCsv(rows);
    expect(result.platform).toBeNull();
    expect(result.items).toHaveLength(0);
    expect(result.unmatched[0].reason).toContain('Could not detect');
  });
});
