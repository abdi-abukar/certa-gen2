import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export default {
  poweredByHeader: false,
  images: { maximumRedirects: 0, remotePatterns: process.env.CERTA_SUPABASE_URL ? [new URL('/storage/v1/object/public/certa-content/**', process.env.CERTA_SUPABASE_URL)] : [] },
  transpilePackages: ['@certa/server', '@certa/supabase', '@certa/ui-web'],
  turbopack: { root },
  outputFileTracingRoot: root,
  serverExternalPackages: ['@napi-rs/canvas'],
  outputFileTracingIncludes: {'/api/awards/*':['../../packages/server/assets/awards/**/*']},
  experimental: { serverActions: { bodySizeLimit: '32kb' } },
  async headers() {
    return [{ source: '/((?!game/).*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
    ] },{source:'/game/:path*',headers:[{key:'X-Frame-Options',value:'SAMEORIGIN'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"}]}];
  },
};
