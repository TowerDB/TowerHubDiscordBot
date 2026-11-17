import type { ChatInputCommandInteraction, InteractionEditReplyOptions, MessageComponentInteraction } from 'discord.js';

import { ephemeralError } from '../embeds/general.js';

type Content = Pick<InteractionEditReplyOptions, 'embeds' | 'components'>;

/** A deferred reply stays as private as it was deferred, and an edit can't carry that flag, so only the content goes. */
export function asEdit({ embeds, components }: Content): Content {
  return { embeds, components };
}

export async function replyWithFailure(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  description: string,
): Promise<void> {
  const body = ephemeralError('Something went wrong', description);

  // A deferred command shows a loading message that only an edit replaces. A button's deferUpdate leaves the message it's
  // on in place, and an edit would overwrite that.
  const isLoading = interaction.isChatInputCommand() && interaction.deferred && !interaction.replied;
  const answer = isLoading ? interaction.editReply(asEdit(body)) : respond(interaction, body);

  await answer.catch(() => undefined);
}

function respond(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  body: ReturnType<typeof ephemeralError>,
): Promise<unknown> {
  return interaction.replied || interaction.deferred ? interaction.followUp(body) : interaction.reply(body);
}
