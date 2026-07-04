require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const baseUrl = required('BASE_URL').replace(/\/$/, '');

module.exports = {
  port: process.env.PORT || 3000,
  baseUrl,

  discord: {
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    botToken: required('DISCORD_BOT_TOKEN'),
    guildId: required('DISCORD_GUILD_ID'),
    redirectUri: `${baseUrl}/oauth/callback`,
  },

  stripe: {
    secretKey: required('STRIPE_SECRET_KEY'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET'),
  },

  stateSecret: required('STATE_SIGNING_SECRET'),
  databaseUrl: required('DATABASE_URL'),

  // Map every recurring Stripe Price ID you sell to the Discord role it unlocks.
  // Add one entry per membership tier. Find Price IDs in Stripe Dashboard > Product catalog,
  // and Role IDs in Discord by enabling Developer Mode > right-click a role > Copy Role ID.
  tierMap: {
    'price_REPLACE_WITH_YOUR_PRICE_ID': {
      roleId: 'REPLACE_WITH_YOUR_ROLE_ID',
      name: 'Core Member',
    },
    // 'price_ANOTHER_PRICE_ID': { roleId: 'ANOTHER_ROLE_ID', name: 'VIP' },
  },
};
