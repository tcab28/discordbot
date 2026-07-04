const express = require('express');
const config = require('./config');
const db = require('./db');

const connectDiscordRoute = require('./routes/connectDiscord');
const oauthCallbackRoute = require('./routes/oauthCallback');
const stripeWebhookRoute = require('./routes/stripeWebhook');

const app = express();

// Stripe webhook signature verification needs the RAW body, so this must be
// mounted BEFORE express.json() below, and only on this one path.
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(stripeWebhookRoute);

// Everything else can use normal parsed JSON bodies.
app.use(express.json());
app.use(connectDiscordRoute);
app.use(oauthCallbackRoute);

app.get('/health', (req, res) => res.json({ ok: true }));

async function start() {
  await db.init();
  app.listen(config.port, () => {
    console.log(`Listening on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
