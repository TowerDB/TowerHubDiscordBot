import { describe, expect, it } from 'vitest';

import { escapeLabel, escapeText, flattenMarkdown } from '../src/utils/markdown.js';

describe('flattenMarkdown', () => {
  it.each([
    ['## Heading\nSome **bold** and _italic_ text', 'Heading Some bold and italic text'],
    ['A [link](https://towerhub.io/items) here', 'A link here'],
    ['![a picture](https://example.com/a.png)', 'a picture'],
    ['- one\n- two\n1. three', 'one two three'],
    ['> quoted', 'quoted'],
    ['| a | b |\n| --- | --- |\n| c | d |', 'a b c d'],
    ['`code` and ~~gone~~', 'code and gone'],
    ['Use @item:ringblade with @build:bleed-dahla', 'Use ringblade with bleed-dahla'],
    ['Apply @mechanic:airborne-attack first', 'Apply airborne-attack first'],
  ])('flattens %j', (markdown, text) => {
    expect(flattenMarkdown(markdown)).toBe(text);
  });

  it('keeps a lone tilde, which is how players write "about"', () => {
    expect(flattenMarkdown('Stay over ~50% health')).toBe('Stay over ~50% health');
  });

  it('leaves nothing of a summary that was only an image with no text', () => {
    expect(flattenMarkdown('![](https://example.com/a.png)')).toBe('');
  });
});

describe('escapeText', () => {
  it.each([
    ['**bold**', '\\*\\*bold\\*\\*'],
    ['`code`', '\\`code\\`'],
    ['||spoiler||', '\\|\\|spoiler\\|\\|'],
    ['# heading', '\\# heading'],
    ['- item', '\\- item'],
    ['1. item', '1\\. item'],
    ['[Free Nitro](https://evil.example)', '\\[Free Nitro](https://evil.example)'],
  ])('shows %j as typed', (text, escaped) => {
    expect(escapeText(text)).toBe(escaped);
  });

  it('leaves plain text alone', () => {
    expect(escapeText('Dahla Basics: early rounds')).toBe('Dahla Basics: early rounds');
  });
});

describe('escapeLabel', () => {
  it.each([
    ['[S Tier] Bleed Dahla', '(S Tier) Bleed Dahla'],
    ['a stray ] bracket', 'a stray ) bracket'],
    ['[Free Nitro](https://evil.example)', '(Free Nitro)(https://evil.example)'],
  ])('keeps %j from ending the label', (text, label) => {
    expect(escapeLabel(text)).toBe(label);
  });
});
