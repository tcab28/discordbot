const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const config = require('./config');

const rest = new REST({ version: '10' }).setToken(config.discord.botToken);

// Exchanges the OAuth2 authorization code (from the /oauth/callback redirect)
// for a user access token.
async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri,
  });

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, token_type, expires_in, refresh_token, scope }
}

async function getOAuthUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { id, username, ... }
}

// Joins the buyer to the guild and assigns their role in one call, using the
// `guilds.join` OAuth scope. If they're already a member, Discord returns 204
// and does NOT apply the `roles` array — in that case we set the role explicitly.
//
// Requires: the bot must already be in the guild with Manage Roles, and its
// own top role must sit ABOVE the role being granted in the role hierarchy —
// otherwise this call fails with a 403 even though the token looks fine.
async function joinGuildAndAssignRole({ userId, accessToken, roleId }) {
  const result = await rest.put(Routes.guildMember(config.discord.guildId, userId), {
    body: { access_token: accessToken, roles: [roleId] },
  });

  if (!result) {
    // 204 No Content — user was already a guild member, apply the role directly.
    await rest.put(Routes.guildMemberRole(config.discord.guildId, userId, roleId));
  }
}

async function addRole(userId, roleId) {
  await rest.put(Routes.guildMemberRole(config.discord.guildId, userId, roleId));
}

async function removeRole(userId, roleId) {
  try {
    await rest.delete(Routes.guildMemberRole(config.discord.guildId, userId, roleId));
  } catch (err) {
    // They may have already left the server — nothing left to remove.
    if (err.status !== 404) throw err;
  }
}

module.exports = { exchangeCode, getOAuthUser, joinGuildAndAssignRole, addRole, removeRole };
