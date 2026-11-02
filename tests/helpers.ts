import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

import type { BuildDetails, BuildSummary, Command, GuideSummary, Item } from '../src/types.js';

export function guide(overrides: Partial<GuideSummary> = {}): GuideSummary {
  return {
    slug: 'dahla-basics',
    title: 'Dahla Basics',
    summary: 'How to play her early rounds.',
    author: 'Ravah',
    category: 'Community',
    publishedAt: '2026-10-01T12:00:00Z',
    updatedAt: null,
    thumbnail: null,
    readingMinutes: 5,
    ...overrides,
  };
}

export function buildSummary(overrides: Partial<BuildSummary> = {}): BuildSummary {
  return {
    slug: 'bleed-dahla',
    name: 'Bleed Dahla',
    author: 'Ravah',
    items: [
      { slug: 'vanish-crown', name: 'Vanish Crown' },
      { slug: 'petal-dance-amulet', name: 'Petal Dance Amulet' },
      { slug: 'dancing-blade', name: 'Dancing Blade' },
      { slug: 'throwing-knives', name: 'Throwing Knives' },
      { slug: 'some-anchor', name: 'Some Anchor' },
      { slug: 'some-potion', name: 'Some Potion' },
    ],
    ...overrides,
  };
}

function loadoutItem(slug: string, name: string, slot: Item['slot']): Item {
  return { slug, name, slot, eternalSlug: null, description: null, lore: null, maxStackCount: 1, abilities: [] };
}

export function build(overrides: Partial<BuildDetails> = {}): BuildDetails {
  return {
    slug: 'bleed-dahla',
    name: 'Bleed Dahla',
    summary: 'Stack **bleed**, then leave.',
    author: 'Ravah',
    patch: '0.23.0',
    publishedAt: '2026-10-01T12:00:00Z',
    updatedAt: null,
    loadout: {
      crown: loadoutItem('vanish-crown', 'Vanish Crown', 'Crown'),
      amulet: loadoutItem('petal-dance-amulet', 'Petal Dance Amulet', 'Amulet'),
      firstWeapon: loadoutItem('dancing-blade', 'Dancing Blade', 'Weapon'),
      secondWeapon: loadoutItem('throwing-knives', 'Throwing Knives', 'Weapon'),
      anchor: loadoutItem('some-anchor', 'Some Anchor', 'Anchor'),
      consumable: loadoutItem('some-potion', 'Some Potion', 'Consumable'),
    },
    setBonuses: [],
    changes: [],
    unavailableItems: [],
    outOfRotationItems: [],
    ...overrides,
  };
}

/** The values of a pick-list option, as Discord offers them. */
export function choicesOf(command: Command, optionName: string): string[] {
  const option = command.data.options?.find((candidate) => candidate.name === optionName);
  const choices = option && 'choices' in option ? option.choices ?? [] : [];

  return choices.map((choice) => String(choice.value));
}

const fixture = (file: string) => readFileSync(new URL(`fixtures/${file}`, import.meta.url), 'utf8');

/** What TowerHub answers on each path. */
export function towerHubResponses(): Record<string, string> {
  return { '/api/system/gamedata': fixture('gamedata.json'), '/api/mechanics': fixture('mechanics.json') };
}

/** Answers fetch from these bodies by path, as a 404 for any other, and returns the stub to count calls on. */
export function stubTowerHub(responses: Record<string, string>) {
  const stub = vi.fn(async (url: string) => {
    const body = responses[new URL(url).pathname];

    return body === undefined ? new Response(null, { status: 404 }) : new Response(body);
  });
  vi.stubGlobal('fetch', stub);

  return stub;
}
