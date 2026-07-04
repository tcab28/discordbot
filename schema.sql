CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  price_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | past_due | cancelled
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_subscription ON subscribers (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_discord_user ON subscribers (discord_user_id);
