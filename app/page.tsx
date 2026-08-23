import Link from 'next/link';
import { ArrowRight, Receipt, TrendingUp, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Wordmark />
            <span>LedgerLoop</span>
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Start free trial</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container py-20 md:py-28">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium text-muted-foreground">
              For UK eBay resellers
            </p>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-tight">
              Stop guessing your reselling profit.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              Drop in your eBay Transaction Report and LedgerLoop produces an HMRC
              SA103-shaped tax estimate in seconds. Per-item profit, ROI, and hold
              time. A dashboard that mirrors the form you eventually have to file.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">Start free trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#features">See how it works</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">14 days free. No card required.</p>
          </div>
        </section>

        <section id="features" className="container py-16 border-t">
          <div className="grid md:grid-cols-3 gap-8">
            <Feature
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="CSV first, API later"
              body="Upload your eBay Transaction Report today. Automatic API sync arrives in v1.1 once production approval clears."
            />
            <Feature
              icon={<TrendingUp className="h-5 w-5" />}
              title="Real profit math"
              body="Fees, refunds, postage, cost of goods — all rolled into per-item profit and ROI. Decimal arithmetic, never floats."
            />
            <Feature
              icon={<Receipt className="h-5 w-5" />}
              title="HMRC-ready"
              body="Trading allowance comparison, SA103S / SA103F mapping, exportable CSV your accountant will recognise."
            />
          </div>
        </section>

        <section className="container py-16 border-t">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight">Built for the actual UK tax year</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Verified rates for 2024/25 and 2025/26. Trading allowance vs actual
              expenses, side-by-side. Personal allowance taper above £100k.
              Class 4 NIC at 6% and 2%. Plan 1/2/4/5/Postgrad student loans.
              Every rate is versioned in a config file with source URLs and
              verification dates — see <code>docs/tax-engine.md</code>.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} LedgerLoop. Estimates only — not regulated tax advice.</p>
          <nav className="flex gap-4">
            <Link href="/help" className="hover:text-foreground">Help</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary mb-4">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Wordmark() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
      <path
        d="M9 9v14h14"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="13" r="2" fill="hsl(var(--primary-foreground))" />
    </svg>
  );
}
