import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const session = request.cookies.get('admin_session');
  const host = request.headers.get('host')?.toLowerCase() ?? '';

  const isBrokerHost = host === 'broker.piercommercial.com' || host === 'www.broker.piercommercial.com';

  if (isBrokerHost) {
    if (path === '/' || path === '') {
      return NextResponse.redirect(new URL('/broker', request.url));
    }

    if (path === '/new') {
      return NextResponse.redirect(new URL('/broker/new', request.url));
    }

    if (path === '/revisions') {
      return NextResponse.redirect(new URL('/broker/revisions', request.url));
    }

    const allowedBrokerPaths = new Set(['/broker', '/broker/new', '/broker/revisions']);
    const isAdminPath = path.startsWith('/admin') || path.startsWith('/api/admin');
    if (!allowedBrokerPaths.has(path) && !path.startsWith('/api/') && !isAdminPath) {
      return NextResponse.redirect(new URL('/broker', request.url));
    }
  }

  // 1. Let the login API through unconditionally
  if (path.includes('/api/admin/auth')) {
    return NextResponse.next();
  }

  // 2. Let the visual login page through unconditionally
  if (path.includes('/admin/login')) {
    return NextResponse.next();
  }

  // 3. Block unauthorized API attempts
  if (!session && path.startsWith('/api/admin')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Protect /dashboard routes
  if (!session && path.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // 4. Redirect unauthorized page visits to login
  if (!session && path.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
