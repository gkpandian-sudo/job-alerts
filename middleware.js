export default function middleware() {
  return new Response('Access denied', { status: 403 });
}

export const config = {
  matcher: '/(.*)',
};
