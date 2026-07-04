const express = require('express');
const crypto = require('crypto');
const Stripe = require('stripe');
const config = require('../config');
const discord = require('../discord');
const db = require('../db');

const stripe = new Stripe(config.stripe.secretKey);
const router = express.Router();

function verifyState(state) {
  const decoded = Buffer.from(state, 'base64url').toString('utf8');
  const [sessionId, sig] = decoded.split('.');
  const expected = crypto.createHmac('sha256', config.stateSecret).update(sessionId).digest('hex');
  if (!sig || sig !== expected) throw new Error('State signature mismatch.');
  return sessionId;
}

router.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state.');

  let sessionId;
  try {
    sessionId = verifyState(state);
  } catch {
    return res.status(400).send('Invalid or tampered link — please restart checkout.');
  }

  try {
    // 1. Confirm the payment actually happened and see what was bought.
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    if (session.payment_status !== 'paid' || !session.subscription) {
      return res.status(402).send('No active subscription found for this session.');
    }

    const priceId = session.subscription.items.data[0].price.id;
    const tier = config.tierMap[priceId];
    if (!tier) {
      console.error(`No role mapped for price ${priceId} — update tierMap in config.js`);
      return res.status(500).send('This plan isn\'t configured yet — contact support.');
    }

    // 2. Exchange the OAuth code for the buyer's Discord identity.
    const tokenData = await discord.exchangeCode(code);
    const discordUser = await discord.getOAuthUser(tokenData.access_token);

    // 3. Join them to the server and grant the role, in one step.
    await discord.joinGuildAndAssignRole({
      userId: discordUser.id,
      accessToken: tokenData.access_token,
      roleId: tier.roleId,
    });

    // 4. Persist the mapping so renewals/failures/cancellations later know
    //    exactly who to update without asking them to link anything again.
    await db.upsertSubscriber({
      discordUserId: discordUser.id,
      discordUsername: discordUser.username,
      stripeCustomerId: session.customer.id,
      stripeSubscriptionId: session.subscription.id,
      priceId,
      roleId: tier.roleId,
      guildId: config.discord.guildId,
      status: 'active',
      currentPeriodEnd: new Date(session.subscription.current_period_end * 1000),
    });

    res.send(`<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, sans-serif; text-align: center; padding: 4rem;">
    <h1>You're in</h1>
    <p>Your <strong>${tier.name}</strong> role has been added. Head back to Discord.</p>
  </body>
</html>`);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.status(500).send('Something went wrong linking your account — contact support and we\'ll sort it out.');
  }
});

module.exports = router;
