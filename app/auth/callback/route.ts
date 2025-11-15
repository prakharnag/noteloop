import { createClient } from '@/lib/auth/supabase-server';
import { NextResponse } from 'next/server';

/**
 * Get the base URL for redirects
 * Priority: NEXT_PUBLIC_SITE_URL > Vercel URL > forwarded headers > origin
 * This ensures it works in Vercel production, preview deployments, and local production testing
 */
function getRedirectBase(request: Request, origin: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const vercelUrl = process.env.VERCEL_URL;
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Check if origin is localhost (for local testing)
  const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

  if (siteUrl) {
    // Explicitly set site URL (highest priority)
    // But if it's localhost and siteUrl is HTTPS, use origin instead to preserve HTTP
    if (isLocalhost && siteUrl.startsWith('https://')) {
      return origin;
    }
    return siteUrl;
  } else if (isLocalhost) {
    // Always use origin for localhost (preserves HTTP)
    return origin;
  } else if (vercelUrl && !isDevelopment) {
    // Vercel production/preview deployment
    return `https://${vercelUrl}`;
  } else if (forwardedHost && !isDevelopment) {
    // Production with proxy (Vercel or other)
    const protocol = forwardedProto || 'https';
    return `${protocol}://${forwardedHost}`;
  } else {
    // Development or local production testing
    return origin;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const redirectBase = getRedirectBase(request, origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${redirectBase}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${redirectBase}/auth/auth-code-error`);
}
