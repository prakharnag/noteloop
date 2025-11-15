import { createClient } from '@/lib/auth/supabase-server';
import { NextResponse } from 'next/server';

/**
 * Get the base URL for redirects
 * Priority: NEXT_PUBLIC_SITE_URL > Render URL > Vercel URL > forwarded headers > origin
 * This ensures it works in Vercel, Render, preview deployments, and local production testing
 * 
 * According to Render docs: Services are accessible via their onrender.com subdomain
 * Render provides RENDER_EXTERNAL_URL environment variable with the full URL
 */
function getRedirectBase(request: Request, origin: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const renderUrl = process.env.RENDER_EXTERNAL_URL; // Render's environment variable (e.g., https://your-app.onrender.com)
  const vercelUrl = process.env.VERCEL_URL;
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Check if origin is localhost (for local testing)
  const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

  // Don't use localhost URLs in production - they won't work
  if (siteUrl && !siteUrl.includes('localhost') && !siteUrl.includes('127.0.0.1')) {
    // Explicitly set site URL (highest priority) - but only if it's not localhost
    return siteUrl;
  } else if (renderUrl) {
    // Render deployment - RENDER_EXTERNAL_URL is the public URL (e.g., https://your-app.onrender.com)
    return renderUrl;
  } else if (forwardedHost && !isDevelopment && !isLocalhost) {
    // Production with proxy (Vercel, Render, or other)
    // Render forwards requests with x-forwarded-host header
    const protocol = forwardedProto || 'https';
    return `${protocol}://${forwardedHost}`;
  } else if (vercelUrl && !isDevelopment) {
    // Vercel production/preview deployment
    return `https://${vercelUrl}`;
  } else if (isLocalhost) {
    // Always use origin for localhost (preserves HTTP for local testing)
    return origin;
  } else {
    // Fallback to origin (should be the Render URL in production)
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
