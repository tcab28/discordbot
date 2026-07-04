# Discord + Stripe role automation

Grants a Discord role automatically when someone's monthly Stripe subscription
payment succeeds, and removes it on cancellation or exhausted failed-payment
retries. Supports multiple tiers (map more than one Price ID to a role).

## How it works

1. Customer pays via your existing Stripe Payment Link (recurring price).
2. Stripe redirects them to `/connect-discord?session_id=...` on this app.
3. They click "Connect Discord" → Discord OAuth (`identify` + `guilds.join`).
4. `/oauth/callback` verifies the payment with Stripe, then joins them to
   your server and assigns the correct role **in one API call** — no invite
   link, no waiting for them to click anything else.
5. From then on, a Stripe webhook keeps the role in sync: renewals confirm
   it, a failed charge starts a grace period (role stays while Stripe
   retries the card), and cancellation / exhausted retries remove it.

## 1. Discord Developer Portal setup

Go to https://discord.com/developers/applications → New Application.

- **Bot tab** → Add Bot → copy the token → `DISCORD_BOT_TOKEN`.
  No privileged gateway intents are needed — this app only makes REST
  calls, it never opens a gateway connection.
- **OAuth2 tab** → copy Client ID / Client Secret →
  `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.
- **OAuth2 → Redirects** → add `{BASE_URL}/oauth/callback` exactly
  (must match `BASE_URL` in your env vars once deployed).
- **Invite the bot to your server**: OAuth2 → URL Generator → scope `bot`,
  permission `Manage Roles` → open the generated URL, add it to your server.
- **Role hierarchy — the #1 thing people miss**: in Server Settings → Roles,
  drag the bot's own role **above** every role it needs to grant. If the
  bot's role sits below the tier role, every grant call fails with a 403.
- Enable Discord's **Developer Mode** (User Settings → Advanced) so you can
  right-click to copy IDs:
  - Right-click your server icon → Copy Server ID → `DISCORD_GUILD_ID`.
  - Right-click each tier's role → Copy Role ID → goes in `tierMap` below.

## 2. Stripe setup

- Your Payment Link should already point at a **recurring** Price. Grab its
  Price ID (`price_...`) from Stripe Dashboard → Product catalog.
- Edit the Payment Link → **After payment** → "Redirect customers to your
  website" → set the URL to:
  `https://{BASE_URL}/connect-discord?session_id={CHECKOUT_SESSION_ID}`
  (Stripe fills in `{CHECKOUT_SESSION_ID}` automatically — type it literally.)
- Dashboard → Developers → Webhooks → **Add endpoint**:
  `https://{BASE_URL}/webhooks/stripe`, listening for:
  `invoice.payment_succeeded`, `invoice.payment_failed`,
  `customer.subscription.deleted`, `customer.subscription.updated`.
- Copy the endpoint's signing secret → `STRIPE_WEBHOOK_SECRET`.
- Copy your API secret key → `STRIPE_SECRET_KEY`.

## 3. Configure your tiers

Edit `src/config.js`:

```js
tierMap: {
  'price_XXXXXXXXXXXXXX': { roleId: 'DISCORD_ROLE_ID', name: 'Core Member' },
  // add one line per tier
},
```

## 4. Deploy — Railway (recommended)

Railway was the easiest fit here: it runs a normal long-lived Node process
(this app needs to stay up to receive webhooks, unlike a one-shot serverless
function), and gives you a one-click managed Postgres instance in the same
project so `DATABASE_URL` is set for you automatically.

1. Push this folder to a new GitHub repo.
2. https://railway.app → New Project → Deploy from GitHub repo.
3. Add a **Postgres** plugin to the same project (this sets `DATABASE_URL`
   automatically — no manual copying needed).
4. In the app service's **Variables** tab, paste in everything from
   `.env.example` except `DATABASE_URL`.
5. Settings → Networking → **Generate Domain**. Take that URL, set it as
   `BASE_URL` (no trailing slash), and redeploy so the OAuth redirect URI
   matches. Update the Discord OAuth2 redirect and the Stripe Payment Link /
   webhook URL to use the same domain.

Render or Fly.io work the same way if you'd rather use one of those —
both support persistent Node processes and a managed Postgres add-on.

## 5. Test it before going live

- Use a Stripe **test-mode** Payment Link and test card `4242 4242 4242 4242`
  first — swap in live keys only once a full run-through works.
- `stripe listen --forward-to https://{BASE_URL}/webhooks/stripe` (Stripe
  CLI) lets you trigger `invoice.payment_failed` etc. on demand with
  `stripe trigger invoice.payment_failed` to check the grace-period logic
  without waiting a real month.
- `GET /health` returns `{ ok: true }` once the app and DB are both up.

## Notes

- **Grace period**: a failed renewal doesn't remove the role immediately —
  Stripe's own Smart Retries keep trying the card for several days first.
  If you want a harder cutoff, add a scheduled check in
  `stripeWebhook.js` that revokes access once `current_period_end` has
  passed and status is still `past_due`.
- **Local dev**: copy `.env.example` to `.env`, fill it in, `npm install`,
  `npm start`. You'll need a tunnel (e.g. `ngrok http 3000`) so Discord and
  Stripe can reach your callback/webhook URLs.
