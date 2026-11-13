// Keeps the Supabase sign-in fresh on every request (only when Supabase is connected).
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let res = NextResponse.next({ request: req });
  if (!url || !key) return res;
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: list => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); }
    }
  });
  await sb.auth.getUser();
  return res;
}
// Not on webhooks, the scheduler, the owners' Pay Now pages or static files.
export const config = { matcher: ['/((?!api/|pay/|_next/|assets/|fonts/|favicon|owners-template).*)'] };
