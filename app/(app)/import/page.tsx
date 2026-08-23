import Link from 'next/link';
import { CsvDropzone } from '@/components/csv-dropzone';
import { Card } from '@/components/ui/card';

export default function ImportPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Import eBay Transaction Report</h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Drop in a Transaction Report CSV exported from eBay Seller Hub.
          LedgerLoop matches sales, fees, refunds and shipping labels by order
          number, producing per-item profit and an SA103-shaped tax estimate.
        </p>
      </header>

      <CsvDropzone />

      <Card className="p-5">
        <h2 className="text-sm font-medium">How to export your Transaction Report from eBay</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5 leading-relaxed">
          <li>Sign in to eBay → Seller Hub → Payments tab.</li>
          <li>Click <strong className="text-foreground">Reports</strong> in the top right.</li>
          <li>
            Choose <strong className="text-foreground">Transaction report</strong>, pick a date
            range (recommended: the start of the UK tax year, 6 April), and request the report.
          </li>
          <li>
            Download the resulting CSV when eBay emails it to you. Drop it on the upload
            area above.
          </li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          We support the current Seller Hub layout only. If you're on a legacy export,
          please re-request via the Reports tab. See{' '}
          <Link href="/help" className="underline">help</Link> for screenshots.
        </p>
      </Card>
    </div>
  );
}
