const VALID_USER = 'pandian';
const VALID_PASS = 'NQm6Q6sM4xng';

export default function middleware(req) {
  const auth = req.headers.get('authorization');

  if (auth && auth.startsWith('Basic ')) {
    const decoded = atob(auth.slice(6));
    const colon = decoded.indexOf(':');
    const user = decoded.slice(0, colon);
    const pass = decoded.slice(colon + 1);
    if (user === VALID_USER && pass === VALID_PASS) {
      return; // allow through
    }
  }

  return new Response('Access denied', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Job Alerts"' },
  });
}

export const config = {
  matcher: '/(.*)',
};
