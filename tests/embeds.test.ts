// Discord rejects a whole reply if one embed breaks its limits, and the embed builders throw on
// the per-field ones. These render every embed the bot can send from the real data, so content
// that would break a command fails here instead.
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { faq, socials } from '../src/data.js';
import { buildEmbed, buildListEmbed } from '../src/embeds/builds.js';
import { eternalDetailEmbed, eternalListEmbed } from '../src/embeds/eternals.js';
import { faqListEmbed, faqTopicEmbed } from '../src/embeds/faq.js';
import { glossaryListEmbed, glossaryTermEmbed } from '../src/embeds/glossary.js';
import { guideEmbed, guideListEmbed } from '../src/embeds/guides.js';
import { helpDetailEmbed, helpOverviewEmbed } from '../src/embeds/help.js';
import { itemDetailEmbeds } from '../src/embeds/items.js';
import { socialsEmbed } from '../src/embeds/socials.js';
import type { OwnedItem } from '../src/gameData.js';
import type { Ability, Eternal, Item } from '../src/types.js';
import { embedLength, MAX_EMBED_DESCRIPTION, MAX_FIELD_NAME, MAX_FIELD_VALUE, MAX_MESSAGE_CHARS } from '../src/utils/discordLimits.js';
import { build, buildSummary, choicesOf, commandNamed, createTestApp, guide } from './helpers.js';

const { gameData, registry } = await createTestApp();
const { commands } = registry;
const itemCommand = commandNamed(registry, 'item');
const { eternals, glossary, items } = gameData.get();

/** truncate() cuts text to exactly its limit and ends it with "…", so text like that lost its end. */
function cutShort(text: string | undefined, limit: number): boolean {
  return text?.length === limit && text.endsWith('…');
}

/** Whatever would get a reply of these embeds rejected, or silently shortened. */
function problems(...embeds: EmbedBuilder[]): string[] {
  const found: string[] = [];

  const total = embeds.reduce((sum, embed) => sum + embedLength(embed), 0);
  if (total > MAX_MESSAGE_CHARS) {
    found.push(`${total} characters, over Discord's ${MAX_MESSAGE_CHARS}`);
  }

  for (const { data } of embeds) {
    if (cutShort(data.description, MAX_EMBED_DESCRIPTION)) {
      found.push(`"${data.title}" description cut short`);
    }
    for (const field of data.fields ?? []) {
      if (cutShort(field.name, MAX_FIELD_NAME) || cutShort(field.value, MAX_FIELD_VALUE)) {
        found.push(`"${data.title}" field "${field.name}" cut short`);
      }
    }
  }

  return found;
}

describe('detail embeds', () => {
  it.each(eternals.map((eternal) => [eternal.name, eternal] as const))('/eternals name:%s', (_, eternal) => {
    expect(problems(eternalDetailEmbed(eternal, gameData.itemsOf(eternal)))).toEqual([]);
  });

  // Too long for its own embed, /item would fall back to a list without the abilities.
  it.each(items.map((owned) => [owned.item.name, owned] as const))('/item name:%s shows its details', (_, owned) => {
    const embeds = itemDetailEmbeds([owned]);

    expect(embeds).toHaveLength(1);
    expect(problems(...(embeds ?? []))).toEqual([]);
  });

  it.each(faq.map((topic) => [topic.topic, topic] as const))('/faq topic:%s', (_, topic) => {
    expect(problems(faqTopicEmbed(topic))).toEqual([]);
  });

  it.each(glossary.map((entry) => [entry.name, entry] as const))('/glossary term:%s', (_, entry) => {
    expect(problems(glossaryTermEmbed(entry))).toEqual([]);
  });

  it.each(commands.map((command) => [command.data.name, command] as const))('/help command:%s', (_, command) => {
    expect(problems(helpDetailEmbed(command))).toEqual([]);
  });
});

describe('list embeds', () => {
  it('/eternals', () => {
    expect(problems(eternalListEmbed(eternals))).toEqual([]);
  });

  it('/glossary', () => {
    expect(problems(glossaryListEmbed(glossary))).toEqual([]);
  });

  it('/faq', () => {
    expect(problems(faqListEmbed(faq))).toEqual([]);
  });

  it('/socials', () => {
    expect(problems(socialsEmbed(socials))).toEqual([]);
  });

  it('/help', () => {
    expect(problems(helpOverviewEmbed(commands))).toEqual([]);
  });
});

/** Runs /item with these options and returns the embeds it replies with. */
async function itemReply(options: Record<string, string | null>): Promise<EmbedBuilder[]> {
  const reply = vi.fn();
  const interaction = { options: { getString: (name: string) => options[name] ?? null }, reply };
  await itemCommand.execute(interaction as unknown as ChatInputCommandInteraction);

  return reply.mock.calls[0]?.[0].embeds;
}

describe('/item browsing', () => {
  const owners = [null, 'echo', ...eternals.map((eternal) => eternal.slug)];
  const slots = [null, ...choicesOf(itemCommand, 'slot')];

  it.each(owners.flatMap((owner) => slots.map((slot) => [owner, slot] as const)))('eternal:%s slot:%s', async (eternal, slot) => {
    const embeds = await itemReply({ eternal, slot });

    expect(embeds.length).toBeGreaterThan(0);
    expect(problems(...embeds)).toEqual([]);
    expect(embeds.filter(({ data }) => !data.url && data.title !== 'No such item')).toEqual([]);
  });
});

describe('links to TowerHub', () => {
  const site = 'https://towerhub.io';

  it.each(eternals.map((eternal) => [eternal.slug, eternal] as const))('/eternals name:%s opens its page', (slug, eternal) => {
    expect(eternalDetailEmbed(eternal, gameData.itemsOf(eternal)).data.url).toBe(`${site}/eternals/${slug}`);
  });

  it.each(items.map((owned) => [owned.item.slug, owned] as const))('/item for %s opens its page', (slug, owned) => {
    expect(itemEmbed(owned).url).toBe(`${site}/items/${slug}`);
  });

  it('/eternals opens the eternals page, with each name opening its own', () => {
    const { url, description } = eternalListEmbed(eternals).data;

    expect(url).toBe(`${site}/eternals`);
    expect(description).toContain(`[Dahla](${site}/eternals/dahla)`);
  });

  it('/item with no options opens the items page', async () => {
    const [embed] = await itemReply({});

    expect(embed?.data.url).toBe(`${site}/items`);
  });

  // TowerHub's page reads these: an eternal's slug, and the slot in its own casing.
  it.each([
    ['eternal:dahla', { eternal: 'dahla' }, '/items?eternal=dahla'],
    ['slot:weapon', { slot: 'weapon' }, '/items?slot=Weapon'],
    ['eternal:echo, which TowerHub has no filter for', { eternal: 'echo' }, '/items'],
    ['eternal:echo slot:weapon', { eternal: 'echo', slot: 'weapon' }, '/items?slot=Weapon'],
  ])('a list from %s opens the same list', async (_, options, path) => {
    const [embed] = await itemReply(options);

    expect(embed?.data.url).toBe(`${site}${path}`);
  });

  it('a list links each item, and leaves the eternal to its own embed', async () => {
    const [embed] = await itemReply({ eternal: 'dahla' });

    expect(embed?.data.description).toContain(`[Vanish Crown](${site}/items/vanish-crown) — *Dahla*`);
  });

  it('an eternal links each of its items', () => {
    const dahla = eternals.find((eternal) => eternal.slug === 'dahla') as Eternal;
    const field = eternalDetailEmbed(dahla, gameData.itemsOf(dahla)).data.fields?.find(({ name }) => name === 'Items');

    expect(field?.value).toContain(`**[Vanish Crown](${site}/items/vanish-crown)**`);
  });

  it('an item links its eternal', () => {
    const vanish = items.find(({ item }) => item.slug === 'vanish-crown') as OwnedItem;

    expect(itemEmbed(vanish).description).toContain(`**[Dahla](${site}/eternals/dahla)**, The Dancer`);
  });
});

function ability(overrides: Partial<Ability>): Ability {
  return { name: 'Strike', description: 'Hits something.', mechanics: [], levels: [], ...overrides };
}

function item(overrides: Partial<Item>): Item {
  const base: Item = { slug: 'test', name: 'Test', slot: 'Crown', eternalSlug: null, description: null, lore: null, maxStackCount: 1, abilities: [] };

  return { ...base, ...overrides };
}

function itemEmbed(owned: OwnedItem) {
  const [embed] = itemDetailEmbeds([owned]) ?? [];
  if (!embed) {
    throw new Error('Expected a detail embed.');
  }

  return embed.data;
}

describe('item details', () => {
  const stat = (name: string, value: number) => ({ name, unit: 'Seconds' as const, value });
  const level = (number: number, stats: ReturnType<typeof stat>[], upgradeEffect: string | null = null, damageText: string | null = null) => ({
    level: number,
    damageText,
    upgradeEffect,
    stats,
  });

  const valueOf = (abilityUnderTest: Ability) => itemEmbed({ item: item({ abilities: [abilityUnderTest] }) }).fields?.[0]?.value;

  it('shows the first level in full, damage first, then only what each level changes', () => {
    const value = valueOf(ability({
      levels: [
        level(1, [stat('Cooldown', 14), stat('Stun Duration', 0.5)], null, '25'),
        level(2, [stat('Cooldown', 12), stat('Stun Duration', 0.5)], null, '25'),
        level(3, [stat('Cooldown', 12), stat('Stun Duration', 0.5)], null, '25'),
      ],
    }));

    expect(value).toBe('Hits something.\n**Damage**: 25\n**Cooldown**: 14s\n**Stun Duration**: 0.5s\n`II` **Cooldown**: 12s');
  });

  it('shows upgrade text that says something the numbers do not', () => {
    const value = valueOf(ability({
      levels: [
        level(1, [stat('Duration', 5)]),
        level(2, [stat('Duration', 5)]),
        level(3, [stat('Duration', 5)], 'You are invulnerable for 1 second'),
      ],
    }));

    expect(value).toContain('`III` You are invulnerable for 1 second');
  });

  it('keeps the number when the upgrade text leaves it out', () => {
    const value = valueOf(ability({
      levels: [level(1, [stat('Radius', 5)]), level(2, [stat('Radius', 6)], 'Radius increased')],
    }));

    expect(value).toContain('`II` **Radius**: 6s — Radius increased');
  });

  it('drops upgrade text that only restates the change', () => {
    const value = valueOf(ability({
      levels: [level(1, [stat('Blind Duration', 5)]), level(2, [stat('Blind Duration', 6)], 'Blind duration increased to 6 seconds')],
    }));

    expect(value).toContain('`II` **Blind Duration**: 6s');
    expect(value).not.toContain('increased');
  });

  it('lists a change in damage, which is free text', () => {
    const value = valueOf(ability({
      levels: [level(1, [], null, '14'), level(2, [], null, '14'), level(3, [], null, '9 / 9')],
    }));

    expect(value).toContain('`III` **Damage**: 9 / 9');
  });

  it('marks a mechanic that arrives with an upgrade', () => {
    const mechanics = [
      { name: 'Stun', definition: '', unlockedAtLevel: 1 },
      { name: 'Invulnerable', definition: '', unlockedAtLevel: 3 },
    ];

    expect(valueOf(ability({ mechanics }))).toContain('`Stun` `Invulnerable III`');
  });

  it('labels a weapon\'s abilities by their order, and nothing else\'s', () => {
    const abilities = [ability({ name: 'Swing' }), ability({ name: 'Lunge' })];

    expect(itemEmbed({ item: item({ slot: 'Weapon', abilities }) }).fields?.map((field) => field.name)).toEqual(['Primary · Swing', 'Secondary · Lunge']);
    expect(itemEmbed({ item: item({ abilities: abilities.slice(0, 1) }) }).fields?.map((field) => field.name)).toEqual(['Swing']);
  });

  it('shows how far an item stacks, its lore, and a description only once', () => {
    const { description, fields } = itemEmbed({
      item: item({
        slot: 'Consumable',
        maxStackCount: 4,
        description: 'Regain 125 Health',
        lore: 'It tastes awful.',
        abilities: [ability({ description: 'Regain 125 Health' })],
      }),
    });

    expect(description).toBe('Consumable · Stacks to 4\n\n*It tastes awful.*');
    expect(fields?.[0]?.value).toBe('Regain 125 Health');
  });

});

describe('guides', () => {
  it('shows who wrote it and what it is, opening the guide', () => {
    const { title, url, description, timestamp } = guideEmbed(guide({ updatedAt: '2026-10-20T12:00:00Z' })).data;

    expect(title).toBe('Dahla Basics');
    expect(url).toBe('https://towerhub.io/guides/dahla-basics');
    expect(description).toBe('Community · by Ravah · 5 min read\n\nHow to play her early rounds.');
    expect(timestamp).toBe('2026-10-20T12:00:00.000Z');
  });

  it('uses an eternal as its thumbnail, and nothing for art this repo has no copy of', () => {
    expect(guideEmbed(guide({ thumbnail: 'eternal/dahla' })).data.thumbnail?.url).toMatch(/images\/eternals\/dahla\.png$/);
    expect(guideEmbed(guide({ thumbnail: 'map/floor-1' })).data.thumbnail).toBeUndefined();
    expect(guideEmbed(guide({ thumbnail: null })).data.thumbnail).toBeUndefined();
  });

  it('still renders with no summary', () => {
    expect(guideEmbed(guide({ summary: '' })).data.description).toBe('Community · by Ravah · 5 min read');
  });

  it('lists each with a link', () => {
    const { description } = guideListEmbed({ items: [guide()], total: 1 }, {}).data;

    expect(description).toContain('**[Dahla Basics](https://towerhub.io/guides/dahla-basics)**\nCommunity · by Ravah · 5 min read');
  });
});

describe('builds', () => {
  it('shows who made it, its patch and its loadout, opening the build', () => {
    const { title, url, description, fields } = buildEmbed(build()).data;

    expect(title).toBe('Bleed Dahla');
    expect(url).toBe('https://towerhub.io/builds/bleed-dahla');
    expect(description).toBe('by Ravah · Patch 0.23.0\n\nStack bleed, then leave.');
    expect(fields?.[0]?.value.split('\n')).toHaveLength(6);
    expect(fields?.[0]?.value).toContain('`Crown`: [Vanish Crown](https://towerhub.io/items/vanish-crown)');
  });

  it('says what has moved since its patch', () => {
    const { description } = buildEmbed(build({
      changes: [{ name: 'Vanish Crown' }, { name: 'Dancing Blade' }],
      unavailableItems: ['Some Potion'],
      outOfRotationItems: ['Throwing Knives'],
    })).data;

    expect(description).toContain('**Changed since 0.23.0:** Vanish Crown, Dancing Blade');
    expect(description).toContain('**No longer in the game:** Some Potion');
    expect(description).toContain('**Out of rotation:** Throwing Knives');
  });

  it('says nothing of that when it is up to date', () => {
    expect(buildEmbed(build()).data.description).not.toContain('Changed since');
  });

  it('shows its set bonuses, with the eternal as its thumbnail, or its crown without one', () => {
    const setBonuses = [{ eternalSlug: 'dahla', name: 'Dance', description: 'Move faster.' }];
    const { fields, thumbnail } = buildEmbed(build({ setBonuses })).data;

    expect(fields?.[1]).toEqual({ name: 'Set Bonus: Dance', value: 'Move faster.' });
    expect(thumbnail?.url).toMatch(/images\/eternals\/dahla\.png$/);
    expect(buildEmbed(build()).data.thumbnail?.url).toMatch(/images\/items\/vanish-crown\.png$/);
  });

  it('still renders with nothing left of its summary', () => {
    expect(buildEmbed(build({ summary: '![](https://example.com/a.png)' })).data.description).toBe('by Ravah · Patch 0.23.0');
  });

  it('lists each with its gear, leaving out the anchor and consumable', () => {
    const { description } = buildListEmbed({ items: [buildSummary()], total: 1 }, {}, []).data;

    expect(description).toContain('**[Bleed Dahla](https://towerhub.io/builds/bleed-dahla)** - by Ravah\nVanish Crown · Petal Dance Amulet · Dancing Blade · Throwing Knives');
    expect(description).not.toContain('Some Anchor');
  });
});

// Anyone with a username writes these, so unlike the game's own text they can be aimed at the embed.
describe('text written by users', () => {
  const nitro = '[Free Nitro](https://evil.example)';

  it.each([
    ['a guide\'s title in a list', guideListEmbed({ items: [guide({ title: nitro })], total: 1 }, {})],
    ['a build\'s name in a list', buildListEmbed({ items: [buildSummary({ name: nitro })], total: 1 }, {}, [])],
    ['an author in a list', guideListEmbed({ items: [guide({ author: nitro })], total: 1 }, {})],
    ['a guide\'s summary', guideEmbed(guide({ summary: nitro }))],
    ['a build\'s summary', buildEmbed(build({ summary: `\`${nitro}\`` }))],
  ])('%s can\'t carry a link of its own', (_, embed) => {
    expect(embed.data.description).not.toMatch(/(?<!\\)\[Free Nitro\]\(https:/);
  });

  it('a title with brackets keeps its own link working', () => {
    const { description } = guideListEmbed({ items: [guide({ title: '[S Tier] Bleed' })], total: 1 }, {}).data;

    expect(description).toContain('[(S Tier) Bleed](https://towerhub.io/guides/dahla-basics)');
  });

  it('formatting in a title shows as typed', () => {
    expect(guideEmbed(guide({ title: '**Best** guide' })).data.title).toBe('\\*\\*Best\\*\\* guide');
  });

  it('a name in the list\'s title is escaped too', () => {
    const { title } = guideListEmbed({ items: [guide()], total: 1 }, { author: 'dark_knight_' }).data;

    expect(title).toBe('Guides · by dark\\_knight\\_');
  });

  // Escaping doubles text like this, which is the most a page can hold.
  it('a full page of the longest text escaping can make stays within Discord\'s limits', () => {
    const stars = (count: number) => '*'.repeat(count);
    const guides = Array.from({ length: 10 }, () => guide({ title: stars(60), summary: stars(300), author: stars(20) }));
    const builds = Array.from({ length: 10 }, () => buildSummary({ name: stars(60), author: stars(20) }));

    for (const embed of [guideListEmbed({ items: guides, total: 10 }, {}), buildListEmbed({ items: builds, total: 10 }, {}, [])]) {
      expect(embedLength(embed)).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
  });

  it('the longest build stays within Discord\'s limits', () => {
    const embed = buildEmbed(build({
      name: '*'.repeat(60),
      summary: '*'.repeat(3000),
      author: '*'.repeat(20),
      setBonuses: [
        { eternalSlug: 'dahla', name: 'Dance', description: 'x'.repeat(1000) },
        { eternalSlug: 'rynshi', name: 'Rage', description: 'x'.repeat(1000) },
      ],
    }));

    expect(problems(embed)).toEqual([]);
  });
});

// TowerHub imports these as soon as a new build ships, before anyone has written their text. Discord refuses blank embed text.
describe('a new eternal with its text still to come', () => {
  const eternal: Eternal = {
    slug: 'newcomer',
    name: 'Newcomer',
    title: '',
    description: '',
    setBonusName: 'Unnamed',
    setBonusDescription: '',
    isActive: false,
    ability: null,
  };

  it('still renders', () => {
    const { title, description, fields } = eternalDetailEmbed(eternal, []).data;

    expect(title).toBe('Newcomer');
    expect(description).toBeUndefined();
    expect(fields?.[0]).toEqual({ name: 'Set Bonus: Unnamed', value: '—' });
  });

  it('still renders as the owner of an item', () => {
    expect(itemEmbed({ item: item({ eternalSlug: 'newcomer' }), eternal }).description)
      .toBe('Crown · **[Newcomer](https://towerhub.io/eternals/newcomer)**');
  });

  it('still renders an ability with nothing to say', () => {
    expect(itemEmbed({ item: item({ abilities: [ability({ description: '' })] }) }).fields?.[0]?.value).toBe('—');
  });
});
