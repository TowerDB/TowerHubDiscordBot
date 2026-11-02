import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { ChatInputCommandInteraction, MessageComponentInteraction } from 'discord.js';
import { commands, findCommand } from './commands/registry.js';
import { config } from './config.js';
import { slowDown } from './embeds/general.js';
import { refreshGameData } from './gameData.js';
import { Cooldown, RateLimiter } from './rateLimit.js';
import { handleShare, isShareComponent } from './share.js';
import { describeCommand, describePlace } from './utils/logging.js';
import { replyWithFailure } from './utils/replies.js';

/** Don't let bad things happen. The show must go on */
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on(Events.Error, (error) => console.error('Discord client error:', error));
const commandRateLimiter = new RateLimiter({
  global: config.maxRequests,
  perServer: config.maxRequestsPerServer,
  perUser: config.maxRequestsPerUser,
});
const buttonRateLimiter = new RateLimiter({
  global: config.maxButtonClicks,
  perServer: config.maxButtonClicksPerServer,
  perUser: config.maxButtonClicksPerUser,
});

/** One public Slow down notice per server per minute, so a raid can't turn the notices into spam of their own. */
const CHANNEL_NOTICE_COOLDOWN_MS = 60_000;
const channelNotices = new Cooldown();

client.once(Events.ClientReady, async (ready) => {
  const payload = commands.map((command) => command.data);

  try {
    if (config.guildId) {
      const guild = await ready.guilds.fetch(config.guildId);
      await guild.commands.set(payload);
      console.log(`Registered ${payload.length} commands to ${guild.name}.`);
    }
    else {
      await ready.application.commands.set(payload);
      console.log(`Registered ${payload.length} commands globally (may take up to an hour to appear).`);
    }
  }
  catch (error) {
    console.error(`Failed to register commands ${config.guildId ? `to server ${config.guildId}` : 'globally'}:`, error);
  }

  console.log(`Logged in as ${ready.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = findCommand(interaction.commandName);
    try {
      await command?.autocomplete?.(interaction);
    }
    catch (error) {
      console.error(`Autocomplete for "${interaction.commandName}" in ${describePlace(interaction)} failed:`, error);
    }
    
    return;
  }

  if (interaction.isMessageComponent()) {
    await handleComponent(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = findCommand(interaction.commandName);
  if (!command) {
    return;
  }

  // Every command gets one line, ending in how it went
  const described = describeCommand(interaction);

  const limit = commandRateLimiter.check(interaction.user.id, interaction.guildId);
  if (!limit.allowed) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    console.warn(`${described}: throttled (${limit.scope} limit, ${seconds}s until a slot frees up)`);

    const inChannel = limit.scope === 'server' && interaction.guildId !== null &&
      channelNotices.assign(interaction.guildId, CHANNEL_NOTICE_COOLDOWN_MS);
    await warnThrottled(interaction, inChannel ? 'channel' : 'ephemeral');

    return;
  }

  const started = Date.now();
  try {
    await command.execute(interaction);
    console.log(`${described}: done in ${Date.now() - started}ms`);
  }
  catch (error) {
    console.error(`${described}: failed after ${Date.now() - started}ms`, error);
    await replyWithFailure(interaction, 'That command failed. Try again in a moment.');
  }
});

/** Post to channel buttons. Only the clicker needs to know they were throttled, so they're told privately, whichever limit it was. */
async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!isShareComponent(interaction.customId)) {
    return;
  }

  const limit = buttonRateLimiter.check(interaction.user.id, interaction.guildId);
  if (!limit.allowed) {
    console.warn(
      `Throttled a button click from ${interaction.user.tag} in ${describePlace(interaction)} ` +
        `(${limit.scope} limit, ${Math.ceil(limit.retryAfterMs / 1000)}s until a slot frees up).`,
    );
    await warnThrottled(interaction, 'ephemeral');

    return;
  }

  try {
    await handleShare(interaction);
  }
  catch (error) {
    console.error(`Button "${interaction.customId}" in ${describePlace(interaction)} failed:`, error);
    await replyWithFailure(interaction, 'That didn\'t work. Try again in a moment.');
  }
}

async function warnThrottled(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  where: 'channel' | 'ephemeral',
): Promise<void> {
  await interaction.reply(slowDown(where))
    .catch((error: unknown) => console.error('Failed to send the slow down notice:', error));
}

/** Die gracefully */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}, logging out.`);
    void client.destroy().finally(() => process.exit(0));
  });
}

// Commands answer from this, so fill it before any can arrive. If TowerHub is down the bot starts anyway:
// /faq, /socials and /help don't need it, and the game commands try again when they're next run.
await refreshGameData();

client.login(config.token).catch((error: unknown) => {
  console.error('Failed to log in:', error);
  process.exit(1);
});
