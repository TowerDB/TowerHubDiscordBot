import type { BaseInteraction, ChatInputCommandInteraction } from 'discord.js';

/** Plain values print bare; anything else is quoted, which also escapes whatever the user typed. */
function bareOrQuoted(value: string): string {
  return /^[\w-]+$/.test(value) ? value : JSON.stringify(value);
}

/** The channel and server, e.g. `#general on "TowerHub" (1234)`. Server names are quoted like option values, since anyone can name a server. */
export function describePlace(interaction: BaseInteraction): string {
  if (!interaction.inGuild()) {
    return 'DMs';
  }

  const channel = interaction.channel;
  const where = channel && 'name' in channel && channel.name ? `#${channel.name}` : interaction.channelId;
  const server = interaction.guild ? `${bareOrQuoted(interaction.guild.name)} (${interaction.guildId})` : interaction.guildId;

  return `${where} on ${server}`;
}

/** The command as typed, who ran it and where, e.g. `/item eternal:Dahla from steve (1234) in #general on TowerHub (5678)`. */
export function describeCommand(interaction: ChatInputCommandInteraction): string {
  const typed = [`/${interaction.commandName}`, ...interaction.options.data.map((option) => `${option.name}:${bareOrQuoted(String(option.value))}`)];

  return `${typed.join(' ')} from ${interaction.user.tag} (${interaction.user.id}) in ${describePlace(interaction)}`;
}
