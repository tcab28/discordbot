const express = require('express');
const crypto = require('crypto');
const config = require('./config');

const router = express.Router();

// Signs the Stripe checkout session id so it can't be swapped for someone
// else's session between here and the /oauth/callback step.
function signState(sessionId) {
  const hmac = crypto.createHmac('sha256', config.stateSecret).update(sessionId).digest('hex');
  return Buffer.from(`${sessionId}.${hmac}`).toString('base64url');
}

// Stripe redirects here after a successful Payment Link checkout — set the
// Payment Link's "after payment" redirect to:
//   {BASE_URL}/connect-discord?session_id={CHECKOUT_SESSION_ID}
router.get('/connect-discord', (req, res) => {
  const { session_id: sessionId } = req.query;
  if (!sessionId) return res.status(400).send('Missing session_id.');

  const state = signState(sessionId);
  const authUrl = new URL('https://discord.com/api/oauth2/authorize');
  authUrl.searchParams.set('client_id', config.discord.clientId);
  authUrl.searchParams.set('redirect_uri', config.discord.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'identify guilds.join');
  authUrl.searchParams.set('state', state);

  res.send(`<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Activate your membership</title></head>
  <body style="font-family: -apple-system, sans-serif; text-align: center; padding: 4rem;">
    <h1>Payment received</h1>
    <p>One last step — connect your Discord account to get your role.</p>
    <a href="${authUrl.toString()}"
       style="display:inline-block; padding: 12px 28px; background:#5865F2; color:white; border-radius:8px; text-decoration:none; font-weight:600;">
      Connect Discord
    </a>
  </body>
</html>`);
});

module.exports = router;
