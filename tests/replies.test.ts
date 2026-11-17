import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { replyWithFailure } from '../src/utils/replies.js';

function interactionWith(state: { isCommand: boolean; deferred?: boolean; replied?: boolean }) {
  return {
    isChatInputCommand: () => state.isCommand,
    deferred: state.deferred ?? false,
    replied: state.replied ?? false,
    reply: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
  };
}

async function fail(interaction: ReturnType<typeof interactionWith>): Promise<void> {
  await replyWithFailure(interaction as unknown as ChatInputCommandInteraction, 'That failed.');
}

describe('replyWithFailure', () => {
  it('replies to a command that has not answered', async () => {
    const interaction = interactionWith({ isCommand: true });

    await fail(interaction);

    expect(interaction.reply).toHaveBeenCalledOnce();
    expect(interaction.reply.mock.calls[0]).toMatchObject([{ flags: MessageFlags.Ephemeral }]);
  });

  it('replaces the loading message of a command that deferred, as an edit refuses the ephemeral flag', async () => {
    const interaction = interactionWith({ isCommand: true, deferred: true });

    await fail(interaction);

    expect(interaction.editReply).toHaveBeenCalledOnce();
    expect(interaction.editReply.mock.calls[0]?.[0 as never]).not.toHaveProperty('flags');
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('follows up on a command that already answered', async () => {
    const interaction = interactionWith({ isCommand: true, deferred: true, replied: true });

    await fail(interaction);

    expect(interaction.followUp).toHaveBeenCalledOnce();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  // The button sits on the reply it came from, which an edit would overwrite with the failure.
  it('follows up on a button that deferred, leaving its message alone', async () => {
    const interaction = interactionWith({ isCommand: false, deferred: true });

    await fail(interaction);

    expect(interaction.followUp).toHaveBeenCalledOnce();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('never throws, as there is nothing left to report a failure to', async () => {
    const interaction = interactionWith({ isCommand: true });
    interaction.reply.mockRejectedValue(new Error('Unknown interaction'));

    await expect(fail(interaction)).resolves.toBeUndefined();
  });
});
