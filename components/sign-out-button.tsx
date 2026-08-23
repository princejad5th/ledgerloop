'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push('/');
          router.refresh();
        })
      }
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
