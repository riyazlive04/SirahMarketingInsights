/**
 * Exchanges a short-lived Meta token for a long-lived one (~60 days) and reports
 * exactly when it expires.
 *
 *   npm run token:exchange
 *
 * Graph API Explorer issues 1–2 hour tokens, which is why the dashboard stops
 * working mid-session. This trades one in via the standard `fb_exchange_token`
 * grant. Requires META_APP_ID and META_APP_SECRET in .env.local.
 *
 * For a dashboard that must never break, prefer a System User token instead:
 * Business Settings -> Users -> System Users -> Add -> Generate New Token, with
 * ads_read + ads_management. Those do not expire.
 */

const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
const token = process.env.META_ACCESS_TOKEN;
const version = process.env.META_GRAPH_VERSION ?? 'v23.0';

if (!appId || !appSecret) {
  console.error('META_APP_ID and META_APP_SECRET must be set in .env.local.');
  console.error('Find them at: developers.facebook.com/apps -> your app -> Settings -> Basic');
  process.exit(1);
}

if (!token) {
  console.error('META_ACCESS_TOKEN is not set in .env.local.');
  process.exit(1);
}

const params = new URLSearchParams({
  grant_type: 'fb_exchange_token',
  client_id: appId,
  client_secret: appSecret,
  fb_exchange_token: token,
});

const res = await fetch(`https://graph.facebook.com/${version}/oauth/access_token?${params}`);
const body = (await res.json()) as {
  access_token?: string;
  expires_in?: number;
  error?: { message: string };
};

if (body.error || !body.access_token) {
  console.error(`Exchange failed: ${body.error?.message ?? 'no token returned'}`);
  process.exit(1);
}

const days = body.expires_in ? Math.round(body.expires_in / 86_400) : null;

console.log('Long-lived token obtained.\n');
console.log(`  expires_in : ${body.expires_in ?? 'not reported'}${days ? ` (~${days} days)` : ''}`);
console.log(`  token      : ${body.access_token.slice(0, 8)}…${body.access_token.slice(-4)}\n`);
console.log('Put this in .env.local as META_ACCESS_TOKEN, then run: npm run seed\n');
console.log(body.access_token);

// Confirm the new token actually reads insights before you rely on it.
const check = await fetch(
  `https://graph.facebook.com/${version}/me?fields=id&access_token=${body.access_token}`,
);
const checkBody = (await check.json()) as { id?: string; error?: { message: string } };

console.log(
  checkBody.id
    ? `\nVerified: token resolves to user ${checkBody.id}.`
    : `\nWarning: token did not verify — ${checkBody.error?.message}`,
);
