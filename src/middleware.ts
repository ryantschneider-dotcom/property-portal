import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // The VIP List: Let people access the login page AND the login API
  if (path === '/admin/login' || path.startsWith('/api/admin/auth')) {
    return NextResponse.next();
  }

  // Check for the secure session cookie
  const session = request.cookies.get('admin_session');

  // If no cookie and they are trying to load an admin page, send to login
  if (!session && path.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  
  // If no cookie and they are trying to save/edit a property, block it
  if (!session && path.startsWith('/api/admin')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};