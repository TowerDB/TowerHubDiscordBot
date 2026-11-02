import { MessageFlags } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCommand } from '../src/commands/build.js';
import { guideCommand } from '../src/commands/guide.js';
import { gameData } from '../src/gameData.js';
import type { Command } from '../src/types.js';
import { clearSuggestions } from '../src/utils/browse.js';
import { build, buildSummary, guide, stubTowerHub } from './helpers.js';

const site = 'https://towerhub.io';

function page<T>(...items: T[]): string {
  return JSON.stringify({ items, total: items.length });
}

/** Runs the command with these options and returns the interaction, to see what it did. */
async function run(command: Command, options: Record<string, string | null> = {}) {
  const interaction = {
    options: { getString: (name: string) => options[name] ?? null },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
  };
  await command.execute(interaction as unknown as ChatInputCommandInteraction);

  return interaction;
}

/** Runs autocomplete with `focused` being typed, and returns what it answers with. */
async function suggest(command: Command, focused: { name: string; value: string }, options: Record<string, string | null> = {}) {
  const respond = vi.fn();
  const interaction = {
    commandName: command.data.name,
    options: {
      getFocused: (full?: boolean) => (full ? focused : focused.value),
      getString: (name: string) => (name === focused.name ? focused.value : options[name] ?? null),
    },
    respond,
  };
  await command.autocomplete?.(interaction as unknown as AutocompleteInteraction);

  return respond.mock.calls[0]?.[0] as { name: string; value: string }[];
}

/** What the first embed sent through this `reply` or `editReply` holds. */
function embedIn(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls[0]?.[0].embeds[0].data;
}

/** Every address requested so far. */
function requests(stub: ReturnType<typeof stubTowerHub>): URL[] {
  return stub.mock.calls.map(([address]) => new URL(address));
}

afterEach(() => {
  clearSuggestions();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/guide', () => {
  const twoGuides = page(guide(), guide({ slug: 'bleed-primer', title: 'Bleed Primer' }));

  it('lists the latest with no options, privately', async () => {
    const stub = stubTowerHub({ '/api/guides': twoGuides });

    const interaction = await run(guideCommand);
    const [request] = requests(stub);
    const reply = interaction.editReply.mock.calls[0]?.[0];

    expect(request?.search).toBe('?pageSize=10');
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(reply.embeds[0].data.title).toBe('Guides');
    expect(reply.embeds[0].data.url).toBe(`${site}/guides`);
  });

  it('keeps Post to channel, and leaves the privacy to the deferred reply, as an edit refuses the flag', async () => {
    stubTowerHub({ '/api/guides': twoGuides });

    const reply = (await run(guideCommand)).editReply.mock.calls[0]?.[0];

    expect(reply.components).toHaveLength(1);
    expect(reply).not.toHaveProperty('flags');
  });

  it('asks TowerHub for what the options say, and links to the same list', async () => {
    const stub = stubTowerHub({ '/api/guides': twoGuides });

    const interaction = await run(guideCommand, { name: 'bleed', category: 'community', author: 'Ravah', sort: 'top' });
    const { title, url } = embedIn(interaction.editReply);

    expect(Object.fromEntries(requests(stub)[0]?.searchParams ?? [])).toEqual({
      category: 'community',
      author: 'Ravah',
      sort: 'top',
      search: 'bleed',
      pageSize: '10',
    });
    expect(title).toBe('Guides · Community · by Ravah · Top');
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ category: 'community', author: 'Ravah', sort: 'top', search: 'bleed' });
  });

  it('says how many it left out', async () => {
    stubTowerHub({ '/api/guides': JSON.stringify({ items: [guide(), guide()], total: 40 }) });

    const { description } = embedIn((await run(guideCommand)).editReply);

    expect(description).toMatch(/^40 found, showing 2\./);
  });

  it('opens the only match', async () => {
    stubTowerHub({ '/api/guides': page(guide()), '/api/guides/dahla-basics': JSON.stringify(guide()) });

    const { title, url } = embedIn((await run(guideCommand, { name: 'dahla' })).editReply);

    expect(title).toBe('Dahla Basics');
    expect(url).toBe(`${site}/guides/dahla-basics`);
  });

  it('opens a picked suggestion without searching', async () => {
    const stub = stubTowerHub({ '/api/guides/dahla-basics': JSON.stringify(guide()) });

    const { title } = embedIn((await run(guideCommand, { name: 'slug:dahla-basics' })).editReply);

    expect(title).toBe('Dahla Basics');
    expect(requests(stub).map(({ pathname }) => pathname)).toEqual(['/api/guides/dahla-basics']);
  });

  it('keeps a pick typed by hand inside its own address', async () => {
    const stub = stubTowerHub({});

    await run(guideCommand, { name: 'slug:../system/gamedata' });

    expect(requests(stub)[0]?.pathname).toBe('/api/guides/..%2Fsystem%2Fgamedata');
  });

  it('says so when nothing matches', async () => {
    stubTowerHub({ '/api/guides': page() });

    const { title } = embedIn((await run(guideCommand, { name: 'zzzzzzzz' })).editReply);

    expect(title).toBe('No guides found');
  });

  it('says so when a picked guide has since been deleted', async () => {
    stubTowerHub({});

    const { title } = embedIn((await run(guideCommand, { name: 'slug:gone' })).editReply);

    expect(title).toBe('No guides found');
  });

  it.each([
    ['answers 500', async () => new Response(null, { status: 500 })],
    ['times out', async () => {
      throw new Error('timed out');
    }],
  ])('tells the user when TowerHub %s', async (_, answer) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(answer));

    const interaction = await run(guideCommand);

    expect(embedIn(interaction.editReply).description).toBe('TowerHub is unavailable at the moment. Please try again later.');
  });

  it('suggests what the other options would find, marked as picks', async () => {
    const stub = stubTowerHub({ '/api/guides': page(guide()) });

    const choices = await suggest(guideCommand, { name: 'name', value: 'dah' }, { category: 'eternal' });

    expect(choices).toEqual([{ name: 'Dahla Basics — Ravah', value: 'slug:dahla-basics' }]);
    expect(Object.fromEntries(requests(stub)[0]?.searchParams ?? [])).toEqual({ category: 'eternal', search: 'dah', pageSize: '25' });
  });

  it('suggests authors', async () => {
    const stub = stubTowerHub({ '/api/guides/authors': '["Ravah","Ravenous"]' });

    const choices = await suggest(guideCommand, { name: 'author', value: 'rav' });

    expect(choices).toEqual([{ name: 'Ravah', value: 'Ravah' }, { name: 'Ravenous', value: 'Ravenous' }]);
    expect(requests(stub)[0]?.search).toBe('?search=rav');
  });

  it('asks TowerHub once for the same suggestions typed again, in any case', async () => {
    const stub = stubTowerHub({ '/api/guides': page(guide()), '/api/guides/authors': '["Ravah"]' });

    await suggest(guideCommand, { name: 'name', value: 'dah' });
    await suggest(guideCommand, { name: 'name', value: ' DAH ' });
    await suggest(guideCommand, { name: 'author', value: 'rav' });
    await suggest(guideCommand, { name: 'author', value: 'RAV' });

    expect(requests(stub).map(({ pathname }) => pathname)).toEqual(['/api/guides', '/api/guides/authors']);
  });

  it('asks again when another option changes what the suggestions would be', async () => {
    const stub = stubTowerHub({ '/api/guides': page(guide()) });

    await suggest(guideCommand, { name: 'name', value: 'dah' });
    await suggest(guideCommand, { name: 'name', value: 'dah' }, { category: 'eternal' });

    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('does not hold a failed suggestion', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));
    expect(await suggest(guideCommand, { name: 'name', value: 'dah' })).toEqual([]);

    stubTowerHub({ '/api/guides': page(guide()) });

    expect(await suggest(guideCommand, { name: 'name', value: 'dah' })).toHaveLength(1);
  });

  it('gives up on suggestions in time for Discord\'s 3 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    stubTowerHub({ '/api/guides': page(guide()) });

    await suggest(guideCommand, { name: 'name', value: 'dah' });

    expect(timeout.mock.calls[0]?.[0]).toBeLessThan(3000);
  });

  it.each(['name', 'author'])('answers %s with no suggestions when TowerHub fails, rather than leaving Discord to report it', async (name) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('timed out');
    }));

    expect(await suggest(guideCommand, { name, value: 'dah' })).toEqual([]);
  });
});

describe('/build', () => {
  const twoBuilds = page(buildSummary(), buildSummary({ slug: 'nuke-rynshi', name: 'Nuke Rynshi' }));

  it('sends the slugs of what was typed, and titles the list with the names', async () => {
    const stub = stubTowerHub({ '/api/builds': twoBuilds });

    const interaction = await run(buildCommand, { eternal: 'Dahla', item: 'Ringblade', sort: 'trending' });
    const { title, url } = embedIn(interaction.editReply);

    expect(Object.fromEntries(requests(stub)[0]?.searchParams ?? [])).toEqual({
      eternal: 'dahla',
      item: 'ringblade',
      sort: 'trending',
      pageSize: '10',
    });
    expect(title).toBe('Builds · Dahla · Ringblade · Trending');
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ eternal: 'dahla', item: 'ringblade', sort: 'trending' });
  });

  it('opens the only match through its own address', async () => {
    const stub = stubTowerHub({ '/api/builds': page(buildSummary()), '/api/builds/bleed-dahla': JSON.stringify(build()) });

    const { title, fields } = embedIn((await run(buildCommand, { name: 'bleed' })).editReply);

    expect(title).toBe('Bleed Dahla');
    expect(fields[0].name).toBe('Loadout');
    expect(requests(stub).map(({ pathname }) => pathname)).toEqual(['/api/builds', '/api/builds/bleed-dahla']);
  });

  it('refuses an eternal it can\'t place, before asking TowerHub', async () => {
    const stub = stubTowerHub({});

    const interaction = await run(buildCommand, { eternal: 'zzzzzzzz' });

    expect(embedIn(interaction.reply).title).toBe('No such eternal');
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(stub).not.toHaveBeenCalled();
  });

  it('lists the items a typed name could be rather than filtering on the first', async () => {
    const stub = stubTowerHub({});

    const interaction = await run(buildCommand, { item: 'crown' });
    const { title, description } = embedIn(interaction.reply);

    expect(title).toBe('Multiple items match');
    expect(description).toContain('Vanish Crown');
    expect(stub).not.toHaveBeenCalled();
  });

  it('says so when nothing matches', async () => {
    stubTowerHub({ '/api/builds': page() });

    const { title } = embedIn((await run(buildCommand)).editReply);

    expect(title).toBe('No builds found');
  });

  it('suggests eternals, without Echo, which TowerHub can\'t filter builds by', async () => {
    const choices = await suggest(buildCommand, { name: 'eternal', value: '' });

    expect(choices.map(({ value }) => value)).toEqual(gameData().eternals.slice(0, 25).map(({ slug }) => slug));
  });

  it('suggests items, sending the slug', async () => {
    expect(await suggest(buildCommand, { name: 'item', value: 'vanish' })).toEqual([{ name: 'Vanish Crown', value: 'vanish-crown' }]);
  });

  it('leaves out an eternal it can\'t place when suggesting names', async () => {
    const stub = stubTowerHub({ '/api/builds': page(buildSummary()) });

    const choices = await suggest(buildCommand, { name: 'name', value: 'ble' }, { eternal: 'zzzzzzzz', item: 'vanish-crown' });

    expect(choices).toEqual([{ name: 'Bleed Dahla — Ravah', value: 'slug:bleed-dahla' }]);
    expect(Object.fromEntries(requests(stub)[0]?.searchParams ?? [])).toEqual({ item: 'vanish-crown', search: 'ble', pageSize: '25' });
  });

  it('suggests authors of builds, not of guides', async () => {
    const stub = stubTowerHub({ '/api/builds/authors': '["Ravah"]' });

    await suggest(buildCommand, { name: 'author', value: 'rav' });

    expect(requests(stub)[0]?.pathname).toBe('/api/builds/authors');
  });
});
