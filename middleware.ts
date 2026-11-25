// Keeps the Supabase sign-in fresh on every request (only when Supabase is connected).
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// 25 Nov 2026: also passes the page's path to the server (x-path), so the CRM's layout can keep a building manager on
// his own screen.
const withPath = (req: NextRequest) => { const headers = new Headers(req.headers); headers.set('x-path', req.nextUrl.pathname); return NextResponse.next({ request: { headers } }); };

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let res = withPath(req);
  if (!url || !key) return res;
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: list => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = withPath(req); list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); }
    }
  });
  await sb.auth.getUser();
  return res;
}
// Not on the scheduler or static files.
export const config = { matcher: ['/((?!api/|d/|_next/|assets/|fonts/|icons/|sounds/|themes/|manifest|favicon|owners-template).*)'] };
