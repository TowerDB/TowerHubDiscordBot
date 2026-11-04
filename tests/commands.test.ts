// Creating the registry builds every command, and the builders throw on anything Discord would
// refuse to register: bad names, descriptions over 100 characters, more than 25 choices.
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { Command } from '../src/types.js';
import { commandNamed, createTestApp } from './helpers.js';

const { gameData, registry } = await createTestApp();
const { commands } = registry;
const buildCommand = commandNamed(registry, 'build');
const eternalsCommand = commandNamed(registry, 'eternals');
const itemCommand = commandNamed(registry, 'item');
const randomBuildCommand = commandNamed(registry, 'randombuild');

const byName = commands.map((command) => [command.data.name, command] as const);

describe('commands', () => {
  it('have unique names', () => {
    const names = commands.map((command) => command.data.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(byName)('/%s is found by its name', (name, command) => {
    expect(registry.find(name)).toBe(command);
  });

  // /help shows these, so a copy-pasted usage line would teach the wrong command.
  it.each(byName)('/%s has usage and examples for itself', (name, command) => {
    const ownSyntax = new RegExp(`^/${name}( |$)`);

    expect(command.usage).toMatch(ownSyntax);
    expect(command.examples.length).toBeGreaterThan(0);
    for (const example of command.examples) {
      expect(example).toMatch(ownSyntax);
    }
  });

  // Discord shows "Loading options failed" for an autocomplete option with no handler.
  it.each(byName)('/%s handles autocomplete if an option asks for it', (_, command) => {
    const wantsAutocomplete = (command.data.options ?? []).some((option) => 'autocomplete' in option && option.autocomplete);

    expect(Boolean(command.autocomplete)).toBe(wantsAutocomplete);
  });

  // Registered once at startup, so a pick-list of eternals would miss any TowerHub adds later.
  it.each([[eternalsCommand, 'name'], [itemCommand, 'eternal'], [buildCommand, 'eternal']] as const)('%# looks eternals up live', (command, optionName) => {
    const option = command.data.options?.find((candidate) => candidate.name === optionName);

    expect(option).toMatchObject({ autocomplete: true });
  });
});

/** Runs a command with these options and returns what it replies with. */
async function run(command: Command, options: Record<string, string | null>) {
  const reply = vi.fn();
  const interaction = { options: { getString: (name: string) => options[name] ?? null }, reply };
  await command.execute(interaction as unknown as ChatInputCommandInteraction);

  return reply.mock.calls[0]?.[0];
}

/** Runs autocomplete with `focused` being typed, and returns the choices it offers. */
async function suggest(command: Command, focused: { name: string; value: string }, options: Record<string, string | null> = {}) {
  const respond = vi.fn();
  const interaction = {
    options: {
      getFocused: (full?: boolean) => (full ? focused : focused.value),
      getString: (name: string) => options[name] ?? null,
    },
    respond,
  };
  await command.autocomplete?.(interaction as unknown as AutocompleteInteraction);

  return (respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
}

describe('/eternals', () => {
  it('suggests eternals, naming them and sending the slug', async () => {
    expect(await suggest(eternalsCommand, { name: 'name', value: 'dah' })).toEqual([{ name: 'Dahla', value: 'dahla' }]);
  });

  it.each(['dahla', 'Dahla', 'dahlaa'])('finds name:%s, picked or just typed', async (name) => {
    const { embeds } = await run(eternalsCommand, { name });

    expect(embeds[0].data.title).toBe('Dahla — The Dancer');
  });

  it('says so when nothing matches', async () => {
    const { embeds } = await run(eternalsCommand, { name: 'zzzzzzzz' });

    expect(embeds[0].data.title).toBe('No such eternal');
  });
});

describe('/item', () => {
  it('suggests Echo and every eternal for the eternal option', async () => {
    const choices = await suggest(itemCommand, { name: 'eternal', value: '' });

    expect(choices.map((choice) => choice.value)).toEqual(['echo', ...gameData.get().eternals.map((eternal) => eternal.slug)]);
  });

  it('narrows name suggestions to the chosen eternal and slot', async () => {
    const choices = await suggest(itemCommand, { name: 'name', value: '' }, { eternal: 'dahla', slot: 'crown' });

    expect(choices).toEqual([{ name: 'Vanish Crown', value: 'Vanish Crown' }]);
  });

  it('ignores an eternal it cannot place when suggesting names', async () => {
    expect((await suggest(itemCommand, { name: 'name', value: 'vanish' }, { eternal: 'zzzzzzzz' })).length).toBeGreaterThan(0);
  });

  it.each(['dahla', 'Dahla'])('browses by eternal:%s, picked or just typed', async (eternal) => {
    const { embeds } = await run(itemCommand, { eternal, slot: 'crown' });

    expect(embeds[0].data.title).toBe('Vanish Crown');
  });

  it('says so when the eternal matches nothing', async () => {
    const { embeds } = await run(itemCommand, { eternal: 'zzzzzzzz' });

    expect(embeds[0].data.title).toBe('No such eternal');
  });

  it('titles a list by the name of whose items they are', async () => {
    const { embeds } = await run(itemCommand, { eternal: 'echo', slot: 'weapon' });

    expect(embeds[0].data.title).toBe('Echo - Weapons');
  });
});

describe('/randombuild', () => {
  it.each(Array.from({ length: 50 }, (_, roll) => [roll]))('rolls a crown, an amulet and two different weapons, none out of rotation (roll %i)', async () => {
    const { embeds } = await run(randomBuildCommand, {});
    const lines: string[] = embeds[0].data.description.split('\n');
    const benched = gameData.get().eternals.filter((eternal) => !eternal.isActive).map((eternal) => eternal.name);

    expect(lines.map((line) => line.split('`')[1])).toEqual(['Crown', 'Amulet', 'Weapon', 'Weapon']);
    expect(new Set(lines).size).toBe(4);
    expect(lines.filter((line) => benched.some((name) => line.includes(`*${name}*`)))).toEqual([]);
  });
});
