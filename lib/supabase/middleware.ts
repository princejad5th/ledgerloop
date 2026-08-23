import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Update the Supabase session cookie on every request. Without this the
 * server-side session falls out of sync with the client and protected routes
 * misbehave on hard navigation. Called from the top-level `middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touching getUser() refreshes the session if needed.
  const { data: { user } } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const isAppPath = url.pathname.startsWith('/app');
  const isAuthPath = url.pathname.startsWith('/login') || url.pathname.startsWith('/signup');

  // Gate protected routes.
  if (!user && isAppPath) {
    const redirect = url.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', url.pathname);
    return NextResponse.redirect(redirect);
  }

  // If signed-in, keep auth pages from rendering.
  if (user && isAuthPath) {
    const redirect = url.clone();
    redirect.pathname = '/app';
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}
