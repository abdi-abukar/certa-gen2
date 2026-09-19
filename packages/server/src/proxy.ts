import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieOptions, serverConfig } from './supabase';

export async function sessionProxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';
  const checkout = process.env.CERTA_APP === 'web' && request.nextUrl.pathname === '/checkout';
  const paymentHosts = checkout ? ' https://api.authorize.net https://apitest.authorize.net https://js.authorize.net https://jstest.authorize.net https://accept.authorize.net https://test.authorize.net https://secure.nmi.com https://sandbox.nmi.com' : '';
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    // The dashboard previews locally captured clips. Keep this on every web
    // document because client navigation retains the original document's CSP.
    `media-src 'self'${process.env.CERTA_APP === 'web' ? ' blob:' : ''}`,
    `connect-src 'self'${paymentHosts}${dev ? ' ws: wss:' : ''}`, `frame-src 'self'${paymentHosts}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  let response = NextResponse.next({ request: { headers } });
  const cookie = cookieOptions();
  // No auth request for public visitors. Cookie presence is only a refresh hint;
  // the protected page/action performs the actual authorization check.
  if (request.cookies.getAll().some(item => item.name === cookie.name || item.name.startsWith(`${cookie.name}.`))) {
    const config = serverConfig();
    const client = createServerClient(config.url, config.key, {
      cookieOptions: cookie,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values, cacheHeaders) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          headers.set('cookie', request.headers.get('cookie') ?? '');
          response = NextResponse.next({ request: { headers } });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });
    await client.auth.getClaims();
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
