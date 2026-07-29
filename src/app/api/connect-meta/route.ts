import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { listGraphAdAccounts, listGrantedPermissions } from '@/lib/meta-graph';
import { saveMetaCredential } from '@/lib/meta-credentials';

/**
 * Connects (or reconnects) a Meta access token for the session's company.
 *
 * The token is validated against Meta before being stored, so a typo or an expired
 * paste fails here with a clear reason instead of silently poisoning the dashboard.
 * It is encrypted at rest by `saveMetaCredential`, and the upsert resets
 * `is_valid = true` — which is what clears the "no valid credential" state after an
 * expiry.
 *
 * The token necessarily passes through the browser because the user pastes it. It is
 * never sent back: nothing in the app returns a stored token to a client.
 */
export async function POST(req: NextRequest) {
  const session = await getSession().catch(() => null);

  if (!session) {
    return NextResponse.json(
      { error: 'No active session. Visit /api/dev-login first.' },
      { status: 401 },
    );
  }

  let accessToken: unknown;
  let metaAppId: unknown;

  try {
    ({ accessToken, metaAppId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (typeof accessToken !== 'string' || accessToken.trim().length < 20) {
    return NextResponse.json(
      { error: 'That does not look like a Meta access token.' },
      { status: 400 },
    );
  }

  const token = accessToken.trim();

  // Prove the token works before storing it — a stored-but-dead token is exactly
  // the state we are trying to get out of.
  let accounts;

  try {
    accounts = await listGraphAdAccounts(token);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Meta rejected this token: ${error instanceof Error ? error.message : 'unknown error'}`,
      },
      { status: 400 },
    );
  }

  if (!accounts.length) {
    return NextResponse.json(
      { error: 'The token is valid but reaches no ad accounts. Check its ads_read scope.' },
      { status: 400 },
    );
  }

  // Recorded so the setup screen can answer "why is there no MCP data?" without a
  // round-trip to Meta. Best-effort — a token that reads ad accounts is worth storing
  // whether or not its permission list comes back.
  const grantedScopes = (await listGrantedPermissions(token)).join(' ');

  try {
    await saveMetaCredential({
      companyId: session.companyId,
      metaAppId: typeof metaAppId === 'string' && metaAppId ? metaAppId : 'connected-via-ui',
      accessToken: token,
      grantedScopes: grantedScopes || null,
      connectionMethod: 'paste',
    });
  } catch (error) {
    console.error('[connect-meta] failed to store credential', error);
    return NextResponse.json({ error: 'Could not store the credential.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    accountCount: accounts.length,
    accounts: accounts.slice(0, 5).map((a) => a.name),
  });
}
