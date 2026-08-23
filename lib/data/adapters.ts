/**
 * Adapters: ItemRow (DB shape) → TaxItem (tax engine) / PortfolioItem (calc).
 *
 * The DB stores money as strings (Drizzle's `numeric` type). The engines
 * accept `Decimal | string | number`. This module is the one place that
 * bridges between the two so pages don't have to know the difference.
 */

import type { ItemRow, ExpenseRow } from './items';
import type { TaxItem, TaxExpense } from '@/lib/tax/types';
import type { PortfolioItem } from '@/lib/calc';

export function toTaxItem(row: ItemRow): TaxItem | null {
  if (!row.soldAt || !row.soldPrice) return null;
  return {
    id: row.id,
    soldPrice: row.soldPrice,
    shippingCharged: row.shippingCharged ?? 0,
    costPrice: row.costPrice,
    shippingInCost: row.shippingInCost ?? 0,
    otherCosts: row.otherCosts ?? 0,
    platformFees: row.platformFees ?? 0,
    paymentFees: row.paymentFees ?? 0,
    shippingOutCost: row.shippingOutCost ?? 0,
    refundAmount: row.refundAmount ?? 0,
    soldAt: row.soldAt,
  };
}

export function toTaxExpense(row: ExpenseRow): TaxExpense {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    taxDeductible: row.taxDeductible,
  };
}

export function toPortfolioItem(row: ItemRow): PortfolioItem {
  return {
    id: row.id,
    status: row.status,
    costPrice: row.costPrice,
    shippingInCost: row.shippingInCost ?? undefined,
    otherCosts: row.otherCosts ?? undefined,
    listedPrice: row.listedPrice,
    soldPrice: row.soldPrice ?? undefined,
    shippingCharged: row.shippingCharged ?? undefined,
    platformFees: row.platformFees ?? undefined,
    paymentFees: row.paymentFees ?? undefined,
    shippingOutCost: row.shippingOutCost ?? undefined,
    refundAmount: row.refundAmount ?? undefined,
    purchaseDate: row.purchaseDate,
    listedAt: row.listedAt,
    soldAt: row.soldAt,
    platform: row.soldPlatform ?? row.listedPlatform,
    category: row.category,
    brand: row.brand,
  };
}
