import { sessionProxy } from '@certa/server/proxy';
import type { NextRequest } from 'next/server';
export function proxy(request: NextRequest) { return sessionProxy(request); }
export const config = { matcher: ['/((?!game/|api|_next/static|_next/image|favicon.ico).*)'] };
