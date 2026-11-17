import { escapeMarkdown } from 'discord.js';

// Guides and builds are written by users, unlike the rest of what the bot shows, and it would all render under the
// bot's name. Footers and autocomplete choices show plain text, so a backslash would show there: they need none of this.

/** Shows the text as it was typed. Without this, a title could format itself or carry a link of its own into an embed. */
export function escapeText(text: string): string {
  return escapeMarkdown(text, { bulletedList: true, heading: true, maskedLink: true, numberedList: true });
}

/** For text inside a `[label](url)`. A bracket could close the label early, and escaping them only helps some of the time. */
export function escapeLabel(text: string): string {
  return escapeText(text.replaceAll('[', '(').replaceAll(']', ')'));
}

/**
 * Markdown as one line of plain text, without parsing it: links and images keep their text, and an embed its slug.
 * A lone ~ stays, as it's how players write "about". Follows stripMarkdown in TowerHub's client.
 */
export function flattenMarkdown(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^[\s|:-]+$/gm, '')
    .replace(/@(?:item|build|mechanic):|[*_`|]|~~/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
