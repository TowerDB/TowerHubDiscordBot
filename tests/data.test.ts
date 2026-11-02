// Importing data.ts runs its startup checks, so a broken JSON file fails here rather than on deploy.
// The game data is the saved TowerHub copy that setup.ts loads.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { keys as eternalKeys } from '../src/commands/eternals.js';
import { keys as faqKeys } from '../src/commands/faq.js';
import { keys as glossaryKeys } from '../src/commands/glossary.js';
import { itemCommand, keys as itemKeys } from '../src/commands/item.js';
import { faq } from '../src/data.js';
import { filterItems, gameData, itemsOf } from '../src/gameData.js';
import { normalize } from '../src/utils/general.js';
import { findBest, MAX_QUERY_LENGTH } from '../src/utils/search.js';
import { choicesOf } from './helpers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { eternals, glossary, items } = gameData();

function duplicates(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe('eternals', () => {
  it('have unique slugs and names', () => {
    expect(duplicates(eternals.map((eternal) => eternal.slug))).toEqual([]);
    expect(duplicates(eternals.map((eternal) => normalize(eternal.name)))).toEqual([]);
  });

  it.each(eternals.map((eternal) => [eternal.name, eternal] as const))('%s carries a crown, an amulet and two weapons', (_, eternal) => {
    const slots = itemsOf(eternal).map((item) => item.slot).sort();

    expect(slots).toEqual(['Amulet', 'Crown', 'Weapon', 'Weapon']);
  });

  it('have portraits, named after their slugs', () => {
    const missing = eternals.filter((eternal) => !existsSync(resolve(root, `images/eternals/${eternal.slug}.png`)));

    expect(missing.map((eternal) => eternal.slug)).toEqual([]);
  });
});

describe('items', () => {
  it('have unique slugs', () => {
    expect(duplicates(items.map(({ item }) => item.slug))).toEqual([]);
  });

  // Refill Consumables never had one, and an embed simply goes without a missing thumbnail.
  it('have icons, named after their slugs', () => {
    const missing = items.filter(({ item }) => !existsSync(resolve(root, `images/items/${item.slug}.png`)));

    expect(missing.map(({ item }) => item.slug)).toEqual(['refill-consumables']);
  });

  it('are each reachable through one of /item\'s slot choices', () => {
    const slots = choicesOf(itemCommand, 'slot');
    const unreachable = items.filter((owned) => !slots.some((slot) => filterItems(null, slot).includes(owned)));

    expect(unreachable.map(({ item }) => `${item.name} (${item.slot})`)).toEqual([]);
  });

  // The item embed labels a weapon's abilities by their order.
  it('give weapons a primary and a secondary ability', () => {
    const weapons = items.filter(({ item }) => item.slot === 'Weapon');

    expect(weapons.filter(({ item }) => item.abilities.length !== 2).map(({ item }) => item.name)).toEqual([]);
  });
});

// A key shared by two entries makes the lookup list both instead of answering.
describe('lookups', () => {
  it.each(items.flatMap((owned) => [owned.item.name, owned.item.slug].map((key) => [key, owned] as const)))(
    '/item name:%s finds only that item',
    (key, owned) => {
      expect(findBest(key, items, itemKeys)).toEqual([owned]);
    },
  );

  it.each(items.filter(({ eternal }) => eternal).map((owned) => [`${owned.eternal?.name}'s ${owned.item.name}`, owned] as const))(
    '/item name:%s finds that item by the name the wiki uses',
    (key, owned) => {
      expect(findBest(key, items, itemKeys)).toEqual([owned]);
    },
  );

  it.each(eternals.flatMap((eternal) => eternalKeys(eternal).map((key) => [key, eternal] as const)))(
    '/eternals name:%s finds only that eternal',
    (key, eternal) => {
      expect(findBest(key, eternals, eternalKeys)).toEqual([eternal]);
    },
  );

  it.each(glossary.flatMap((entry) => glossaryKeys(entry).map((key) => [key, entry] as const)))(
    '/glossary term:%s finds only that term',
    (key, entry) => {
      expect(findBest(key, glossary, glossaryKeys)).toEqual([entry]);
    },
  );

  it.each(faq.flatMap((topic) => faqKeys(topic).map((key) => [key, topic] as const)))(
    '/faq topic:%s finds only that topic',
    (key, topic) => {
      expect(findBest(key, faq, faqKeys)).toEqual([topic]);
    },
  );

  // The lookup options cap what can be typed, so a longer key could never be typed in full.
  it(`every key fits in ${MAX_QUERY_LENGTH} characters`, () => {
    const keys = [...items.flatMap(itemKeys), ...glossary.flatMap(glossaryKeys), ...faq.flatMap(faqKeys)];

    expect(keys.filter((key) => key.length > MAX_QUERY_LENGTH)).toEqual([]);
  });

  // The eternal embed's footer promises that /glossary explains any tag.
  it('every mechanic is a glossary term', () => {
    const terms = new Set(glossary.flatMap(glossaryKeys).map(normalize));
    const abilities = [
      ...eternals.flatMap((eternal) => (eternal.ability ? [eternal.ability] : [])),
      ...items.flatMap(({ item }) => item.abilities),
    ];
    const mechanics = new Set(abilities.flatMap((ability) => ability.mechanics.map((mechanic) => mechanic.name)));

    expect([...mechanics].filter((mechanic) => !terms.has(normalize(mechanic)))).toEqual([]);
  });
});
