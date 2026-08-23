import { getCurrentUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/data/items';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';
  const profile = await getProfile(userId);

  return (
    <div className="space-y-8 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tax inputs and account preferences.
        </p>
      </header>

      <Card className="p-6">
        <h2 className="text-sm font-medium">Tax inputs</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Used by the tax engine. PAYE income shapes your marginal rate;
          student loan plan adds repayment estimates.
        </p>
        <form className="mt-5 space-y-4">
          <Field label="Jurisdiction" hint="EW_NI = England, Wales, NI; SCOTLAND uses Scottish bands.">
            <Input defaultValue={profile.jurisdiction} disabled />
          </Field>
          <Field label="Annual PAYE income (£)" hint="From your day job, before tax.">
            <Input defaultValue={profile.payeIncomeAnnual ?? ''} disabled />
          </Field>
          <Field label="Student loan plan" hint="Plan 1 / 2 / 4 / 5 / Postgrad / NONE.">
            <Input defaultValue={profile.studentLoanPlan} disabled />
          </Field>
          <p className="text-xs text-muted-foreground">
            Edit form coming in the next iteration. For now, update these via SQL or the seed script.
          </p>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-medium">Account</h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{profile.email || user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs">{userId}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
