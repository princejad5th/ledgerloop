'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { parseEbayTransactionReport } from '@/lib/csv/ebay-parser';
import { formatGBP, formatDate } from '@/lib/utils';
import type { ParseResult } from '@/lib/csv/types';
import { commitImportAction } from '@/app/(app)/import/actions';

export function CsvDropzone() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [pending, startTransition] = useTransition();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a CSV file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. The upload limit is 10MB.');
      return;
    }
    setFilename(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          toast.error(`Parse error in row ${results.errors[0].row}: ${results.errors[0].message}`);
        }
        const parsed = parseEbayTransactionReport(results.data);
        setPreview(parsed);
        if (parsed.items.length === 0 && parsed.unmatched.length > 0) {
          toast.error('No items could be matched. Check the column layout — see below.');
        } else if (parsed.items.length > 0) {
          toast.success(`Parsed ${parsed.items.length} items from ${results.data.length} rows.`);
        }
      },
      error: (err) => toast.error(`Parse failed: ${err.message}`),
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onCommit = () => {
    if (!preview) return;
    startTransition(async () => {
      try {
        const result = await commitImportAction({
          items: preview.items.map((item) => ({
            ...item,
            soldAt: item.soldAt?.toISOString() ?? null,
            soldPrice: item.soldPrice.toString(),
            shippingCharged: item.shippingCharged.toString(),
            platformFees: item.platformFees.toString(),
            paymentFees: item.paymentFees.toString(),
            shippingOutCost: item.shippingOutCost.toString(),
            refundAmount: item.refundAmount.toString(),
            rawTransactions: item.rawTransactions.map((tx) => ({
              ...tx,
              occurredAt: tx.occurredAt.toISOString(),
              amount: tx.amount.toString(),
            })),
          })),
        });
        if (result.success) {
          toast.success(
            `Imported ${result.itemsCreated} new items, updated ${result.itemsUpdated}.`,
          );
          router.push('/app');
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Import failed.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed transition-colors p-12 text-center ${
          isDragging ? 'border-foreground bg-accent/30' : 'border-input'
        }`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-secondary mb-4">
          <Upload className="h-5 w-5" />
        </div>
        <h3 className="font-medium">Drop your Transaction Report here</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          or click below to choose a file. CSV up to 10MB.
        </p>
        <label className="mt-4 inline-block">
          <input
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button asChild variant="outline">
            <span className="cursor-pointer">Choose file</span>
          </Button>
        </label>
      </div>

      {filename && preview && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{filename}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {preview.transactions.length} transactions · {preview.items.length} items
                  {preview.unmatched.length > 0 && ` · ${preview.unmatched.length} needs review`}
                </p>
              </div>
            </div>
            <Button onClick={onCommit} disabled={pending || preview.items.length === 0}>
              {pending ? 'Importing…' : `Import ${preview.items.length} items`}
            </Button>
          </div>

          {preview.items.length > 0 && (
            <div className="mt-5 rounded-md border overflow-hidden">
              <div className="bg-secondary/60 px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-profit" />
                Preview · first 5 items
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Order</th>
                      <th className="text-left font-medium px-3 py-2">Title</th>
                      <th className="text-right font-medium px-3 py-2">Sold</th>
                      <th className="text-right font-medium px-3 py-2">Fees</th>
                      <th className="text-right font-medium px-3 py-2">Postage</th>
                      <th className="text-left font-medium px-3 py-2">Sold at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.items.slice(0, 5).map((item) => (
                      <tr key={item.externalListingId}>
                        <td className="px-3 py-2 font-mono text-xs">{item.externalListingId}</td>
                        <td className="px-3 py-2 truncate max-w-xs">{item.title}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatGBP(item.soldPrice.toFixed(2))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {formatGBP(item.platformFees.toFixed(2))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {formatGBP(item.shippingOutCost.toFixed(2))}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {item.soldAt ? formatDate(item.soldAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.items.length > 5 && (
                <div className="bg-secondary/30 px-4 py-2 text-xs text-muted-foreground">
                  + {preview.items.length - 5} more
                </div>
              )}
            </div>
          )}

          {preview.unmatched.length > 0 && (
            <div className="mt-5 rounded-md border border-amber-300/50 overflow-hidden">
              <div className="bg-amber-50/80 dark:bg-amber-950/30 px-4 py-2 flex items-center gap-2 text-xs">
                <AlertCircle className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                <span className="font-medium">{preview.unmatched.length} rows need review</span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {preview.unmatched.slice(0, 20).map((u) => (
                      <tr key={u.rowNumber}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">Row {u.rowNumber}</td>
                        <td className="px-3 py-2">{u.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.unmatched.length > 20 && (
                  <div className="px-4 py-2 text-xs text-muted-foreground bg-secondary/30">
                    + {preview.unmatched.length - 20} more rows
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {!preview && (
        <Card className="p-5">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Badge variant="outline">Tip</Badge>
            What we look for in the CSV
          </h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Each row is one financial event: a sale (Order), an eBay fee, a refund, or a
            shipping label. We group by <span className="font-mono">Order number</span>, then
            sum fees, shipping costs and refunds against the matching sale to give you a
            single item with real profit.
          </p>
        </Card>
      )}
    </div>
  );
}
