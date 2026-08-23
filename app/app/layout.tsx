import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutDashboard, Boxes, Upload, Receipt, Settings, LogOut } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '@/components/sign-out-button';

const NAV = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/inventory', label: 'Inventory', icon: Boxes },
  { href: '/app/import', label: 'Import', icon: Upload },
  { href: '/app/tax', label: 'Tax', icon: Receipt },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-r bg-card flex flex-col">
        <div className="h-16 border-b flex items-center px-4">
          <Link href="/app" className="flex items-center gap-2 font-semibold">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#F97316" />
              <path d="M9 9v14h14" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="20" cy="13" r="2" fill="#FFFFFF" />
            </svg>
            LedgerLoop
          </Link>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t">
          <SignOutButton />
        </div>
      </aside>

      <div className="flex flex-col">
        <header className="h-16 border-b flex items-center justify-between px-6">
          <div className="text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
