const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  // Most managed Postgres hosts (Railway, Render, etc.) sit behind a
  // self-signed cert chain — this keeps SSL on without a strict CA check.
  ssl: { rejectUnauthorized: false },
});

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

// Insert a new subscriber, or update in place if we've seen this
// subscription id before (e.g. the buyer retried the OAuth step).
async function upsertSubscriber({
  discordUserId,
  discordUsername,
  stripeCustomerId,
  stripeSubscriptionId,
  priceId,
  roleId,
  guildId,
  status,
  currentPeriodEnd,
}) {
  const sql = `
    INSERT INTO subscribers
      (discord_user_id, discord_username, stripe_customer_id, stripe_subscription_id,
       price_id, role_id, guild_id, status, current_period_end, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      discord_user_id = EXCLUDED.discord_user_id,
      discord_username = EXCLUDED.discord_username,
      price_id = EXCLUDED.price_id,
      role_id = EXCLUDED.role_id,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
    RETURNING *;
  `;
  const values = [
    discordUserId,
    discordUsername,
    stripeCustomerId,
    stripeSubscriptionId,
    priceId,
    roleId,
    guildId,
    status,
    currentPeriodEnd,
  ];
  const { rows } = await pool.query(sql, values);
  return rows[0];
}

async function getBySubscriptionId(stripeSubscriptionId) {
  const { rows } = await pool.query(
    'SELECT * FROM subscribers WHERE stripe_subscription_id = $1',
    [stripeSubscriptionId]
  );
  return rows[0] || null;
}

async function setStatus(stripeSubscriptionId, status) {
  const { rows } = await pool.query(
    'UPDATE subscribers SET status = $2, updated_at = now() WHERE stripe_subscription_id = $1 RETURNING *',
    [stripeSubscriptionId, status]
  );
  return rows[0] || null;
}

module.exports = { pool, init, upsertSubscriber, getBySubscriptionId, setStatus };
