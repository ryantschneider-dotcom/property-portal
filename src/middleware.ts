import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const session = request.cookies.get('admin_session');

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

  // 4. Redirect unauthorized page visits to login
  if (!session && path.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};