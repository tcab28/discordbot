const express = require('express');
const Stripe = require('stripe');
const config = require('../config');
const discord = require('../discord');
const db = require('../db');

const stripe = new Stripe(config.stripe.secretKey);
const router = express.Router();

// NOTE: this route needs the RAW request body to verify Stripe's signature.
// index.js mounts express.raw() on this exact path BEFORE express.json()
// is applied globally — don't move body parsing around without keeping that.
router.post('/webhooks/stripe', async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      config.stripe.webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // Fires on the very first invoice AND every monthly renewal.
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const record = await db.getBySubscriptionId(invoice.subscription);
        if (record && record.status !== 'active') {
          // They recovered from a past_due grace period — restore the role.
          await discord.addRole(record.discord_user_id, record.role_id);
          await db.setStatus(invoice.subscription, 'active');
        }
        break;
      }

      // A renewal charge failed. Do NOT remove the role yet — Stripe's Smart
      // Retries will keep trying the card for several days on its own.
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const record = await db.getBySubscriptionId(invoice.subscription);
        if (record) {
          await db.setStatus(invoice.subscription, 'past_due');
          console.log(`Payment failed for discord user ${record.discord_user_id} — grace period started.`);
        }
        break;
      }

      // Cancelled by the member, or retries exhausted per your Stripe retry schedule.
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const record = await db.getBySubscriptionId(subscription.id);
        if (record) {
          await discord.removeRole(record.discord_user_id, record.role_id);
          await db.setStatus(subscription.id, 'cancelled');
        }
        break;
      }

      // Handles tier upgrades/downgrades (price swapped on the same subscription).
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const record = await db.getBySubscriptionId(subscription.id);
        const newPriceId = subscription.items.data[0].price.id;
        const newTier = config.tierMap[newPriceId];

        if (record && newTier && newTier.roleId !== record.role_id) {
          await discord.removeRole(record.discord_user_id, record.role_id);
          await discord.addRole(record.discord_user_id, newTier.roleId);
          await db.upsertSubscriber({
            discordUserId: record.discord_user_id,
            discordUsername: record.discord_username,
            stripeCustomerId: record.stripe_customer_id,
            stripeSubscriptionId: record.stripe_subscription_id,
            priceId: newPriceId,
            roleId: newTier.roleId,
            guildId: record.guild_id,
            status: record.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          });
        }
        break;
      }

      default:
        break; // not something we act on
    }

    res.json({ received: true });
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // A 500 tells Stripe to retry delivering this event later.
    res.status(500).send('Internal error processing webhook.');
  }
});

module.exports = router;
