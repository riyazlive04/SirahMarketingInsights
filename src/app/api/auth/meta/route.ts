import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieOptions } from '@/lib/auth';
import {
  META_OAUTH_STATE_COOKIE,
  META_OAUTH_TTL_SECONDS,
  MetaAuthError,
  buildMetaAuthorizeUrl,
  metaCallbackUrl,
  randomState,
} from '@/lib/meta-oauth';
import { getSession } from '@/lib/session';

/**
 * Step 1 of connecting an ad account: send the user to Facebook's consent screen.
 *
 * Requires an Ayn session first — the callback has to know which workspace to attach
 * the resulting token to, and inferring it later from anything the client sends would
 * be a way to write a credential into someone else's workspace.
 */
export async function GET(req: NextRequest) {
  const session = await getSession().catch(() => null);
  const origin = process.env.APP_URL?.replace(/\/$/, '') || req.nextUrl.origin;

  if (!session) {
    return NextResponse.redirect(`${origin}/`);
  }

  const state = randomState();

  let authorizeUrl: string;

  try {
    authorizeUrl = buildMetaAuthorizeUrl({
      redirectUri: metaCallbackUrl(req.nextUrl.origin),
      state,
    });
  } catch (error) {
    if (error instanceof MetaAuthError) {
      return NextResponse.redirect(
        `${origin}/setup?error=${encodeURIComponent(error.message)}`,
      );
    }

    throw error;
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(META_OAUTH_STATE_COOKIE, state, sessionCookieOptions(META_OAUTH_TTL_SECONDS));

  return response;
}
