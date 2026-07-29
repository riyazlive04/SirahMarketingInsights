# Ayn — Meta Ads MCP Dashboard

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Recharts, with Google sign-in, a
server-side gateway proxying to Meta's remote Ads MCP host, and an encrypted
multi-tenant token vault in PostgreSQL.

Anyone can sign in with Google, paste their own Meta access token, and see their own
live numbers. The product is **Ayn**; the assistant that rides along on every screen is
**Basira AI Copilot**.

The brand mark in [AynLogo.tsx](src/components/AynLogo.tsx) and [icon.svg](src/app/icon.svg)
is a hand-built SVG *reproduction* of the supplied logo, not the original file — it is
inline so it scales, needs no request and survives a strict CSP. To ship the
authoritative artwork, drop it at `public/ayn-logo.svg` and swap the `<svg>` in
`AynMark` for an `<img>`; nothing else references the artwork.

## Getting started

```bash
docker run -d --name ayn-postgres \
  -e POSTGRES_USER=ayn -e POSTGRES_PASSWORD=ayn_dev_pw -e POSTGRES_DB=meta_mcp \
  -p 55433:5432 postgres:16-alpine

cp .env.example .env.local
openssl rand -hex 32          # -> ENCRYPTION_KEY in .env.local
openssl rand -hex 32          # -> SESSION_SECRET in .env.local

docker exec -i ayn-postgres psql -U ayn -d meta_mcp < db/migrations/001_init.sql
docker exec -i ayn-postgres psql -U ayn -d meta_mcp < db/migrations/002_google_auth.sql
npm run dev                   # http://localhost:3000
```

Add `OPENAI_API_KEY=sk-...` to `.env.local` to give the copilot a model; without one it
degrades to listing the live MCP tool catalogue rather than failing opaquely.

`npm run seed` is still there for a scripted tenant + token (useful for CI and for
`npm run mcp:probe`), but it is no longer how you get in — sign-in is.

### Google sign-in

1. [Google Cloud console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   → **Create credentials** → **OAuth client ID** → **Web application**.
2. Authorised redirect URI: `http://localhost:3000/api/auth/google/callback`
   (and `{APP_URL}/api/auth/google/callback` for each deployed environment — it must
   match to the character).
3. Put the client id and secret in `.env.local` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`, and set `APP_URL`.

Only `openid email profile` is requested. Until those are set, the landing page says so
and `/api/dev-login` still works in development.

### Screens

| Route | Role |
| :--- | :--- |
| `/` | Landing page — the pitch and **Continue with Google**. Signed-in visitors are forwarded to `/setup` or `/dashboard`. |
| `/setup` | Profile: your Google identity, the workspace name, and the Meta token this workspace reports on. Where a new user lands after sign-in. |
| `/dashboard` | Portfolio view — KPIs and charts across the accounts on your token. |
| `/report` | The full client-facing report. |

`/dashboard` and `/report` redirect to `/` when signed out and to `/setup` while no ad
account is connected — a dashboard with nothing behind it would otherwise have to
invent numbers, which is the failure this product exists to prevent.

Both carry an **ad account picker**. The selection lives in the URL (`?account=<id>`),
so a report is shareable and bookmarkable. The account list is fetched independently of
the report itself, so a failing account never strands the user without a way to switch
away from it.

`npm run mcp:probe` lists the tools your ad account actually exposes; set the reporting
one as `META_MCP_INSIGHTS_TOOL` to switch the charts from sample to live.

## Connecting a Meta ad account

Two routes, both live on `/setup`.

**Connect with Facebook** (the front door) runs Facebook Login for Business and needs
`META_APP_ID` + `META_APP_SECRET`, with `{APP_URL}/api/auth/meta/callback` registered
under Facebook Login → Settings → Valid OAuth Redirect URIs. Three calls happen in
[meta-oauth.ts](src/lib/meta-oauth.ts), in order:

```
code  ->  short-lived token (1-2 h)  ->  fb_exchange_token  ->  long-lived (~60 d)
                                     ->  debug_token        ->  scopes + real expiry
```

The middle step is not optional — skipping it produces a dashboard that works during the
demo and is dead by morning. The last step exists because a user can untick individual
permissions on the consent screen, so what was *requested* tells you nothing about what
was *granted*; the setup screen names the granted scopes when a connection reaches no
accounts.

**Paste a permanent token** (the fallback) walks the user through creating a System User
in their own Business Manager. It never expires, and it needs no App Review — see below.

### App Review, and how to launch before it

Requested scopes default to `ads_read,business_management,pages_show_list` — the
reviewable minimum for read-only reporting. `ads_mcp_management` is deliberately
excluded: Meta's Ads MCP server needs it, but requesting an unapproved permission fails
the entire consent screen, and without it every account still reports through the
Marketing API fallback. Add it via `META_OAUTH_SCOPES` once review clears it.

Facebook Login only works for the public **after** App Review grants Advanced Access on
`ads_read` (plus Business Verification). Before that, three options:

| | How | Friction | Expiry |
| :--- | :--- | :--- | :--- |
| A | Add each customer as a Tester/Developer on this app | Needs a Facebook developer account, must accept an invite | 60 days |
| B | Customer creates their own Meta app + System User token and pastes it | ~10 min in Business Manager, needs Business admin | Never |
| C | App Review + Business Verification | None | 60 days |

**B works with no review of any kind**, because the token is minted by the customer's
*own* app against their *own* ad account — this app's access level never enters into it,
it just receives an opaque string. That is also why the seeded development token reads
real accounts today. [SystemUserTokenGuide.tsx](src/components/SystemUserTokenGuide.tsx)
is the in-app walkthrough, including the step people miss: assigning the *ad account* to
the System User, without which the token reads nothing.

Ask for `ads_read` only. A permanent token carrying `ads_management` can spend money,
and revoking it means deleting the System User.

## Reconnecting a token

When a token expires, Meta rejects it, the credential is flagged `is_valid = false`,
and `/dashboard` and `/report` show a **Reconnect your Meta account** panel with an
inline form. Paste a new token there — it is verified against Meta *before* being
stored (so a bad paste fails loudly instead of poisoning the dashboard), encrypted at
rest, and the upsert clears the invalid flag. No `.env.local` edit, no CLI step.

## Token lifetime

Graph API Explorer tokens expire in **1–2 hours**, which is why the dashboard stops
mid-session with `code 190`. Two durable options:

```bash
npm run token:exchange   # -> ~60-day token (needs META_APP_ID + META_APP_SECRET)
```

or, for something that never expires, a **System User token**: Business Settings →
Users → System Users → Add → Generate New Token, with `ads_read` + `ads_management`.
Either way, paste it into `/setup` — no `.env.local` edit, no CLI step.

`meta_credentials.token_expires_at` exists for this but nothing populates it yet —
expiry currently surfaces as a rejected call and an `is_valid = false` flag.

For working without an OAuth client configured, `http://localhost:3000/api/dev-login`
issues a session for the seeded membership. It is hard-disabled when
`NODE_ENV=production` — it grants a session with no credential check — and can be
deleted once Google sign-in is configured everywhere.

Tear down with `docker rm -f ayn-postgres`.

## Authentication

Google OAuth 2.0 authorization-code flow with PKCE, hand-rolled in ~180 lines, plus one
HMAC-signed session cookie. No auth library: the flow is two HTTPS calls to Google, and
every dependency added to this app is one more place a Meta access token could leak
from. Auth.js/NextAuth remains a drop-in later — it would replace
[google-oauth.ts](src/lib/google-oauth.ts) and [session.ts](src/lib/session.ts) and
nothing else, because every consumer sees only the `Session` interface.

- **The `id_token` is deliberately not verified locally.** That would mean fetching and
  caching Google's JWKS and getting RS256 validation right; instead the profile is read
  from the userinfo endpoint over TLS straight to Google, which the connection itself
  authenticates. Same guarantee, no crypto to get wrong.
- **`state` and the PKCE verifier ride in short-lived httpOnly cookies**, not server
  memory, so the flow survives a redeploy or a second instance handling the callback.
  Both are cleared on the way out, so a callback URL cannot be replayed.
- **The session cookie is signed, not encrypted.** It carries a user id, a company id
  and an expiry; the ids are readable by design, and forging them is what the HMAC
  prevents. `getSession()` *also* re-checks `company_members` on every call, so
  revoking a membership takes effect on the next request rather than whenever the
  cookie happens to expire.
- **An unverified Google email is refused.** An address nobody has proved they own can
  be claimed by someone else later, which would hand them this workspace's ad data.
- **Sign-out is POST-only.** A GET sign-out can be fired by any third-party image tag.
- **Rotating `SESSION_SECRET` signs everyone out**; rotating `ENCRYPTION_KEY` makes
  every stored Meta token unrecoverable. They are separate variables for that reason,
  and the session key is derived from its input rather than used raw, so a session
  signature can never be confused with a token ciphertext key.

A first-time sign-in provisions a user and a private workspace in one transaction — a
`users` row with no `company_members` row would pass the cookie check, fail the
membership check forever, and lock the account out with no way to self-serve. A user
who already exists by email (seeded, or invited later) adopts their Google identity
instead of forking into a second account.

## Deploying to Vercel

It fits the platform: every route is `force-dynamic`, nothing needs a filesystem, and
the build resolves no secrets — `next build` succeeds with an empty environment, so the
first deploy will not fail before you have set anything. Five things do need attention.

**1. A managed Postgres.** The Docker container above is not reachable from Vercel.
Provision Neon, Supabase or Vercel Postgres, then apply both migrations against it:

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
psql "$DATABASE_URL" -f db/migrations/002_google_auth.sql
```

There is no migration runner — deliberately, at this size, but it does mean this is a
manual step on every schema change.

**2. Pooling.** `db()` holds one `pg.Pool` per process and serverless gives you a
process per concurrent request, so `max` is a multiplier rather than a total. Use the
provider's **pooled** connection string (Neon's `-pooler` host, Supabase's port 6543)
and set `DATABASE_POOL_MAX=2`. Leave `DATABASE_SSL` unset — it only exists to turn TLS
*off* for a local server.

**3. Environment variables.** `DATABASE_URL`, `DATABASE_POOL_MAX`, `ENCRYPTION_KEY`,
`SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, and
`APP_URL` set to the production origin. Generate *fresh* `ENCRYPTION_KEY` and
`SESSION_SECRET` values for production rather than reusing the development ones — and
keep the production `ENCRYPTION_KEY` somewhere you cannot lose it, because losing it
makes every stored Meta token unrecoverable.

**4. The OAuth redirect URI must match exactly.** Add
`https://<your-domain>/api/auth/google/callback` in the Google Cloud console.
Preview deployments get a fresh URL each time, so Google sign-in will not work on them
unless you register a stable branch alias and point `APP_URL` at it. `/api/dev-login`
will not fill the gap: Vercel sets `NODE_ENV=production` on previews too, which
hard-disables it. That is the correct trade — it grants a session with no credential
check — but it means previews need either the alias or a seeded session cookie.

**5. The copilot's timeout.** `/api/mcp-chat` runs OpenAI → Meta MCP → OpenAI up to
`OPENAI_MAX_TURNS` times and carries `maxDuration = 60`, the Hobby ceiling. If answers
get cut off, raise it on a plan that allows more.

Also put the functions in the same region as the database — each page render makes
several sequential queries before it even calls Meta, so cross-region latency compounds.

## Why one Next.js app, not an API and an SPA

The security property this app is built around is that **the Meta access token never
reaches the browser**: pages resolve data in server components, decrypt the token
server-side, and send only parsed numbers to the client. Splitting into a React SPA and
a standalone API inverts that — every figure becomes a public JSON endpoint
authenticated from browser JS, with CORS, cross-origin cookie configuration and CSRF
handling on each one. Two deployments and an API contract to buy a larger exposed
surface.

The split earns its keep when there is a second consumer (a mobile app, a partner API),
a separate team owning the backend, or a non-JS service (Python, queues, long-running
webhooks). None of those are on the table, so the boundary is enforced *inside* the
repo instead:

- `src/lib/*` — the domain core: Postgres, crypto, the MCP client, the Graph fallback,
  the OpenAI agent. Framework-free; `session.ts` is the only file that touches `next/*`.
- `src/app/api/*` — thin HTTP adapters over that core, ~40 lines each.
- `src/app/**` — rendering only.

Lifting `src/lib` into a Hono or Fastify service later is close to mechanical. One
thing to watch either way: the copilot's agent loop (OpenAI → Meta MCP → OpenAI) can
run long, so on serverless hosts check the function timeout before assuming a hang.

## Layout

| Path | Role |
| :--- | :--- |
| [db/migrations/001_init.sql](db/migrations/001_init.sql) | companies / users / company_members / meta_credentials |
| [db/migrations/002_google_auth.sql](db/migrations/002_google_auth.sql) | `google_sub` / profile columns; `password_hash` made optional |
| [src/lib/crypto.ts](src/lib/crypto.ts) | AES-256-GCM seal/open for stored tokens |
| [src/lib/db.ts](src/lib/db.ts) | pg pool (one per process) |
| [src/lib/meta-credentials.ts](src/lib/meta-credentials.ts) | Membership-scoped credential read/write |
| [src/lib/auth.ts](src/lib/auth.ts) | HMAC-signed session cookie encode/decode |
| [src/lib/google-oauth.ts](src/lib/google-oauth.ts) | Authorization-code flow with PKCE |
| [src/lib/users.ts](src/lib/users.ts) | Sign-in provisioning, workspace read/rename |
| [src/lib/session.ts](src/lib/session.ts) | **The auth seam** — cookie + live membership check |
| [src/lib/mcp.ts](src/lib/mcp.ts) | Streamable HTTP MCP client (JSON-RPC 2.0) |
| [src/lib/meta-metrics.ts](src/lib/meta-metrics.ts) | `ads_get_ad_entities` + coercion of Meta's display strings |
| [src/lib/meta-graph.ts](src/lib/meta-graph.ts) | Marketing API fallback for non-MCP accounts |
| [src/lib/agent.ts](src/lib/agent.ts) | OpenAI loop that drives the MCP tools |
| [src/lib/portfolio.ts](src/lib/portfolio.ts) | Routes each account MCP-or-Graph, builds the chart payload |
| [src/app/api/mcp-chat/route.ts](src/app/api/mcp-chat/route.ts) | Gateway route |
| [src/app/api/auth/google/route.ts](src/app/api/auth/google/route.ts) | Step 1 — redirect to Google |
| [src/app/api/auth/google/callback/route.ts](src/app/api/auth/google/callback/route.ts) | Step 2 — exchange, provision, issue the session |
| [src/app/setup/page.tsx](src/app/setup/page.tsx) | Profile + connect-your-ad-account screen |
| [src/components/MarketingDashboard.tsx](src/components/MarketingDashboard.tsx) | Portfolio KPIs + area/bar charts |
| [src/components/BasiraCopilot.tsx](src/components/BasiraCopilot.tsx) | Server wrapper that mounts the copilot in the root layout |
| [src/components/AynLogo.tsx](src/components/AynLogo.tsx) | The brand mark and wordmark, inline SVG |
| [src/components/FloatingChatPanel.tsx](src/components/FloatingChatPanel.tsx) | Collapsible copilot overlay |
| [src/components/AdChatbot.tsx](src/components/AdChatbot.tsx) | Inline chat panel |
| [src/hooks/useMcpChat.ts](src/hooks/useMcpChat.ts) | `useChat`-shaped hook over the gateway |
| [scripts/mcp-probe.mts](scripts/mcp-probe.mts) | `npm run mcp:probe` — list/call live MCP tools |
| [scripts/mcp-schema.mts](scripts/mcp-schema.mts) | `npm run mcp:schema -- <tool>` — full input schema |
| [scripts/seed.mts](scripts/seed.mts) | `npm run seed` — idempotent tenant + encrypted token |
| [scripts/check-parser.mts](scripts/check-parser.mts) | `npm run check:parser` — 25 coercion checks |
| [scripts/check-auth.mts](scripts/check-auth.mts) | `npm run check:auth` — 38 sign-in / session / scoping checks |

## Deviations from the specs

Each is isolated so it is easy to revert if the spec is authoritative.

### 1. Tokens are never sent to the browser

Both chat blueprints take `accessToken` as a prop and put it in the request body.
That directly contradicts the point of the encrypted vault: a token in a client
component is serialized into the RSC payload and readable in devtools, so the
at-rest encryption buys nothing.

The components take `companyId` instead. The gateway resolves
session → membership → decrypted token server-side, and re-checks membership on
every call, so a client that lies about `companyId` gets 403 rather than another
tenant's ad spend. This is also what makes the multi-business requirement work.

### 2. AES-256-GCM, not AES-256-CBC

The sketch used `aes-256-cbc`, which is unauthenticated — ciphertext can be modified
without detection, which in a credentials table means an attacker with database write
access can tamper with tokens and potentially mount a padding-oracle attack. GCM
authenticates, so tampering fails closed at `decipher.final()`.

`encryptToken` / `decryptToken` keep their signatures. Other changes:

- Returns `Buffer`, not a `hex:hex` string — the column is `BYTEA`, and storing hex
  text in it would double the size and store the ASCII of the hex.
- IV is 12 bytes (what GCM is defined for) instead of 16.
- Layout `version(1) | iv(12) | authTag(16) | ciphertext`, with a matching
  `key_version` column so keys can be rotated without re-encrypting every row.
- `ENCRYPTION_KEY` is validated (32 bytes) and throws a named error instead of
  defaulting to `''`. `Buffer.from` silently truncates at the first non-hex
  character, so a typo'd key would otherwise fail confusingly at cipher creation.

### 3. `CREATE EXTENSION pgcrypto` removed

Nothing in the schema uses it: `gen_random_uuid()` has been core since PostgreSQL 13,
and the encryption is app-side, not pgcrypto's `pgp_sym_*`. Requiring it turns any
deployment without contrib installed into a hard migration failure. The line to add
back for PostgreSQL 12 or older is in a comment at the top of the migration.

### 4. The MCP host is a JSON-RPC server, not a chat endpoint

The blueprint posted `{ message, capabilities }` and read back an answer. Probing the
live host shows that is not what it is:

```
GET https://mcp.facebook.com/ads
-> 405 {"detail":"MCP endpoints accept POST for JSON-RPC; GET is not supported."}

POST (no Authorization)
-> 401 WWW-Authenticate: Bearer resource_metadata="...",
       scope="ads_management ads_read catalog_management business_management
              pages_show_list instagram_basic ads_mcp_management"
```

It is a **Streamable HTTP MCP server** (spec 2025-06-18): `initialize` →
`notifications/initialized` → `tools/list` / `tools/call`, all JSON-RPC 2.0 over
POST. [`src/lib/mcp.ts`](src/lib/mcp.ts) implements that — including the
`Mcp-Session-Id` echo, the `Accept: application/json, text/event-stream` requirement,
SSE-or-JSON response handling, and re-initialisation when a session lapses.

401 means no credential was presented; 403 means the credential was rejected.

**Consequence for the chatbot**: an MCP server exposes tools, so nothing on the other
end can answer "why did my ROAS drop?". A model has to read the question, pick a tool,
call it, and write the reply — an LLM the PRD's architecture omits entirely.

[`src/lib/agent.ts`](src/lib/agent.ts) fills that gap with OpenAI function calling:

```
browser → /api/mcp-chat → OpenAI (Meta's tool schemas attached)
                              ↓ chooses a tool
                        this server → tools/call → Meta Ads MCP
                              ↓ result fed back
                          OpenAI writes the answer
```

**The Meta token is never sent to OpenAI.** Only tool *schemas* and tool *results*
go to the model; `tools/call` is issued by this server. OpenAI's Responses API can
call a remote MCP server directly, which would be less code — but it requires handing
Meta's bearer token to OpenAI, so it is deliberately not used here.

Tool results are truncated to 12k characters before going back to the model so one
large report cannot blow the context window, and the loop is capped at
`OPENAI_MAX_TURNS`. Without `OPENAI_API_KEY` the chat degrades to listing the live
tool catalogue instead of failing opaquely; passing an explicit `tool` in the request
body always invokes it directly, no model involved.

### 5. Marketing API fallback for accounts MCP has not reached

Meta is enabling the Ads MCP server **per ad account**. On this token, 3 of 11 are
enabled. The rest — including the account with currently running ads — reject every
MCP query outright:

> This ad account is not enabled for the Ads MCP. Ads MCP is being gradually rolled
> out across ad accounts. Please check back at a later date.

That happens even though `ads_get_ad_accounts` reports `is_queryable: true`, so the
flag to trust is `is_ads_mcp_enabled`.

[`src/lib/meta-graph.ts`](src/lib/meta-graph.ts) serves those accounts from the
classic `/act_<id>/insights` endpoint using the same token and the same `ads_read`
scope. [`portfolio.ts`](src/lib/portfolio.ts) routes per account — MCP where enabled,
Marketing API where not — and the dashboard says which. Delete the module once Meta
finishes the rollout.

**"Leads" is not one number.** Meta reports the same conversion under several
overlapping action types. A real account here shows `lead: 2` alongside
`offsite_complete_registration_add_meta_leads: 118` and `complete_registration: 116`
— summing triples the count, and a fixed priority picked 2 instead of 118 because
which type carries the volume depends on the campaign's optimisation goal. The code
takes the largest lead-ish action and **names the action type in the UI** rather than
presenting an unqualified "leads" figure.

**Tool names are not hardcoded.** Meta's "Available tools" doc page currently returns
HTTP 500, third-party lists contradict each other, and Meta says tools roll out per
account. `npm run mcp:probe` asks the server itself; set the reporting tool in
`META_MCP_INSIGHTS_TOOL` afterwards.

### 6. `useChat` cannot consume the gateway route

`ai/react` no longer exists — the current `ai` package (v7) exports only `ai`,
`ai/test`, and `ai/internal`, and React bindings moved to `@ai-sdk/react`. More
fundamentally, `useChat` expects an AI SDK stream-protocol response while the
gateway returns a single JSON body.

[`useMcpChat`](src/hooks/useMcpChat.ts) exposes the identical surface, so both chat
components differ from their blueprints by one line — the import. To adopt the real
SDK: convert the route to `createUIMessageStreamResponse`, install
`ai @ai-sdk/react`, and swap the import back.

### 7. Smaller fixes

- **Staggered typing dots.** `delay-75/150/300` are Tailwind *transition*-delay
  utilities and have no effect on `animate-bounce`; the dots pulsed in unison. Now
  set via `animationDelay`.
- **`xmlns="http://w3.org"`** in the panel's SVGs is not a valid namespace URI —
  corrected to `http://www.w3.org/2000/svg`.
- **`MarketingDashboard` takes `data`**, defaulting to the sample series, so the
  page can bind live rows. It also takes `notice`, rendered as a banner whenever the
  data is *not* live — sample numbers should never be mistaken for real spend.
- **Fixed-size chat panel** gained `max-w`/`max-h` so it cannot exceed a small
  viewport.
- **The gateway no longer echoes `error.message`** to the client, which could leak
  connection strings or stack detail; it logs server-side and returns a generic 500.

## Verified

`npm run build`, `npx tsc --noEmit`, and `npm run lint` pass.

**Schema + crypto** — applied `001_init.sql` to a real PostgreSQL engine (PGlite,
in-process) and exercised the repository queries. 14 checks pass, including:
tokens round-trip; ciphertext contains no plaintext; the nonce differs per call;
**tampered and truncated payloads are rejected** (the property CBC lacked); the
upsert doesn't duplicate rows; an invalidated credential stops being returned;
deleting a company cascades its credentials; and **a non-member reading another
company's credential gets zero rows**.

**Parser** — 12 checks over plausible MCP envelopes (bare array, `data`/`results`,
nested `rows`, JSON-in-a-text-block, content blocks) plus rejection cases: rows with
missing or string-typed metrics are dropped rather than rendered as `NaN`.

**Gateway** — no `companyId` → 401; forged `companyId` → 403; forged session cookies
with the DB down → generic 500 with no internals leaked; blank message → 400.

**Browser** — `/dashboard` renders; both charts draw (bar heights measured
proportional to spend: 1200→114px … 2500→238px); the floating panel opens over the
grid, disables Ask when empty, enables it on input, and a submit produces the user
bubble, calls the gateway, clears the empty state, and renders the reply.

**Against a real PostgreSQL 16 (Docker) with the app running** — the migration
applies; `npm run seed` writes a credential whose stored bytes are 68 long, start
with the version byte, and contain no plaintext marker; loading `/dashboard` with the
seeded cookies drives the whole chain (session → membership → **AES-GCM decrypt** →
live HTTPS call to `mcp.facebook.com/ads`); Meta rejects the placeholder token, the
row is auto-flagged `is_valid = false`, and the next call returns 409. A valid
session presenting a *different* company's id gets 403.

**No token reaches the browser** — the rendered `/dashboard` payload contains the
company id but no `EAAG` token substring and no `userMetaToken` field.

**Sign-in** — `npm run check:auth`, 38 checks against real PostgreSQL. Provisioning:
a first sign-in creates the user, the workspace and an admin membership; a second one
reuses all three rather than forking; a user who already exists by email adopts the
Google identity; `password_hash` stays `NULL`; a re-login with no avatar does not wipe
the stored one. Scoping: a non-member can neither read nor rename another workspace.
Session cookie: round-trips; a flipped signature byte, a payload swapped under a valid
signature, garbage, an absent cookie, and an expired-but-correctly-signed value are all
rejected. Authorize URL: PKCE S256, the challenge is sent and the verifier never is,
`openid email profile` only, and `APP_URL` beats the request origin for the redirect URI.

**Sign-in over HTTP, app running** — signed out, `/dashboard`, `/report` and `/setup`
all redirect to `/`; the old plaintext `mcp_user_id` / `mcp_company_id` cookies no
longer grant anything; a tampered or truncated `ayn_session` is refused. A freshly
provisioned user is forwarded from `/`, `/dashboard` and `/report` to `/setup`, where
the status reads "Not connected", and the gateway answers 409 rather than guessing.
With the seeded credential, `/setup` lists **11 live ad accounts** and `/dashboard`
renders with no `EAAG` substring in the payload. The OAuth callback refuses a cancelled
consent, a missing code, a forged state and a mismatched state — each redirecting to
`/?error=…` with the flow cookies cleared. `/api/auth/logout` is 405 on GET and 303 on
POST. `/api/profile` is 401 signed out, 400 on a blank name, and scoped to the caller's
own workspace.

Not verified: the live Google round-trip itself — the code exchange and userinfo call
need a real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, which this environment has
none of, so `exchangeCode` and `fetchGoogleProfile` are exercised only through their
callers' error paths. Also not verified: a live Meta MCP round-trip with a *valid*
token (needs App A on Advanced Access for `ads_mcp_management` + `ads_read`), so the
`live` branch of `fetchPortfolioMetrics` and the envelope shape remain untested against
real data.

## Not built

- **Team invites.** The schema is multi-user (`company_members` carries a role) and
  every query is already membership-scoped, but nothing invites a second person into a
  workspace, so each user gets exactly one, created at first sign-in. Adding invites is
  a route and a form — no query has to change.
- **A workspace switcher.** [`listUserWorkspaces`](src/lib/users.ts) exists and the
  session carries the active company id, but with one workspace per user there is
  nothing to switch between yet. It pairs with invites.
- **Session revocation before expiry.** Signed cookies are stateless, so signing out
  clears the browser's copy but cannot invalidate a copy taken from it. Rotating
  `SESSION_SECRET` invalidates every session at once; per-session revocation needs a
  `sessions` table.
- **Meta Login for Business.** Tokens are pasted, per the PRD. Swapping the paste for
  Facebook's OAuth would remove the expiry problem, but needs App Review on a live app.
- **Token refresh.** `encrypted_refresh_token` and `token_expires_at` are stored and
  decrypted but nothing consumes them yet; expiry currently surfaces as a rejected
  token and an `is_valid = FALSE` flag.
- **Inline dashboard nodes in chat** (PRD Feature 2). The raw MCP payload is kept on
  each assistant message as `msg.data`, ready for a renderer.
- **KPI tiles are still hardcoded** in `MarketingDashboard` — only the two charts
  bind to live data. The MCP metrics prompt would need to return the summary figures.

## Notes

- **Out of scope per PRD §1.4**: no WhatsApp channel, no budget writes. The gateway
  still requests the `campaign_management` capability because the blueprint specifies
  it — narrow it to `reporting_and_insights` to enforce read-only at the wire.
- **Dark mode**: the blueprints' markup is hardcoded light, so the app is committed to
  light. Chart colors on `/` are CSS custom properties in
  [globals.css](src/app/globals.css) with validated dark steps already defined.
- **`ENCRYPTION_KEY` handling**: losing it makes every stored token unrecoverable;
  leaking it makes every stored token readable. Keep it in a secret manager, never in
  the database it protects.
- **Invalidation is one-strike.** A single 401/403 from Meta sets `is_valid = false`
  and the credential then needs a reconnect. That is right for a revoked token but
  aggressive for a transient blip — add a retry or a failure counter if Meta proves
  flaky in practice.
- **Browser extensions break the charts.** Testing in a profile with MozBar
  installed produced a React hydration mismatch and left the bar chart's rectangles
  empty. With `--disable-extensions` the same build renders correctly and logs no
  errors. Worth knowing before chasing a phantom Recharts bug.
