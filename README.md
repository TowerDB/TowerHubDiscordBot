# TowerHub Bot

A Discord bot with slash commands for an FAQ, social links, eternal and item lookups, TowerHub's
guides and builds, random builds and a glossary.

Eternals, items and glossary terms come from the [TowerHub](https://towerhub.io) API and stay up to
date with the game, cached in memory for 30 minutes. Guides and builds are searched on TowerHub
each time. The FAQ, social links and the icons and portraits on the embeds live in this repo. The
only remaining placeholders are the server ID and bot token in `.env`. See [Content](#content).

The commands cross-reference each other: `/eternals` names an eternal's four items, `/item`
gives one item's abilities and tier upgrades, and the ability tags on both are glossary terms,
so `/glossary term:crushing` explains them.

## Commands

| Command | Description |
| --- | --- |
| `/help [command]` | Lists commands. With an argument, shows that command's syntax and examples. |
| `/faq [topic]` | Lists FAQ topics. With an argument, shows that topic's numbered questions and answers. |
| `/socials` | Links the official social channels. |
| `/eternals [name]` | Lists every eternal. With an argument, shows their ability, set bonus, and items. |
| `/item [eternal] [slot] [name]` | Shows an item and the abilities it grants. `eternal:` includes an **Echo** choice for items tied to no eternal; `slot:` covers crowns, amulets, weapons, anchors and consumables. The options combine and each works alone. |
| `/randombuild` | Rolls a random build from the Echo items and the items of eternals currently in rotation: one crown, one amulet and two different weapons. Only you see the result. |
| `/glossary [term]` | Defines a term. With no argument, lists them all. |
| `/guide [name] [category] [author] [sort]` | Finds guides on TowerHub. One match shows its summary and links to the guide; several list the first 10 and link to the rest. With no options, lists the latest. |
| `/build [name] [eternal] [item] [author] [sort]` | Finds builds on TowerHub, the same way. One match shows its loadout, set bonuses and what has changed since its patch. `eternal:` finds builds using any of that eternal's items. |

`/help` replies so only you see it. `/faq`, `/socials`, `/eternals`, `/item`, `/guide`, `/build` and
`/glossary term:` do too, with a **Post to channel** button that posts the same embeds publicly,
marked with who shared them. The post is a plain message rather than a reply, since a reply would
point at the private one and read as deleted once it's dismissed, so the bot needs to be able to
send messages and embed links in that channel. So does whoever clicks it: the bot only posts what
they could have posted themselves. The button comes off the private reply once the post goes through.

`/item slot:`, `/guide category:` and the `sort:` options are pick-lists. Every other option that
looks something up uses **autocomplete**: the items and terms are well past Discord's 25-choice
cap, and the eternals, guides and builds can change while the bot runs. Matches are ranked exact, then prefix, then word-start, then anywhere. `/item name:` only suggests items that
fit the `eternal:` and `slot:` already picked, so `eternal:Dahla` narrows it to her four, and
`/guide name:` and `/build name:` only suggest what the options already picked would find.

Typed values are still matched leniently — case-insensitive, tolerant of partial names and
small typos, so `stealthd` finds Stealthed and `essense` finds Essence. `/faq` also takes each
topic's aliases. When several entries match equally well the bot lists them rather than guessing
(`/glossary term:damage` → the four Damage terms); when nothing matches it says so and points
at the command that lists everything.

`/guide` and `/build` are the exception: TowerHub does the searching, so `name:` needs letters that
are in the title as written, and `author:` needs the whole username, ignoring case. Their
suggestions cover that, and picking one of a `name:` opens that result. `/build eternal:` and
`item:` are lenient like the rest.

## Setup

1. **Create the application** at <https://discord.com/developers/applications> → *New Application* → *Bot*.
2. **Copy the token**: *Bot → Reset Token*. No privileged intents are needed — slash commands
   arrive as interactions, so the Message Content intent stays **off**.
3. **Invite the bot**, substituting your *General Information → Application ID*:
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=274877926400&scope=bot%20applications.commands
   ```
   The permissions are View Channel, Send Messages, Embed Links and Send Messages in Threads (for **Post to channel** in threads).
   The `applications.commands` scope is what allows slash commands; without it they never appear.
4. **Configure**:
   ```sh
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN`, plus `GUILD_ID` for local testing (enable *Settings → Advanced → Developer Mode* in Discord, then right-click → *Copy ID*).
   The [rate limits](#rate-limiting) have working defaults and can be left alone.
5. **Run**:
   ```sh
   npm install
   npm run dev     # watch mode
   npm run build && npm start   # production
   npm test        # see Testing
   ```

Commands register themselves on startup — there is no separate deploy step. Without `GUILD_ID`
they register globally, which Discord can take up to an hour to propagate; with it set they
register to that server instead and appear immediately, so use it while developing and leave it
unset in production.

## Rate limiting

Commands and button clicks are throttled by a **sliding window** one minute wide, in
[src/rateLimit.ts](src/rateLimit.ts). Each bucket keeps the timestamp of every request still
inside its window, so the window moves continuously instead of resetting on a clock boundary —
5 requests at 0:59 do not let another 5 through at 1:00.

| Variable | Default | Scope |
| --- | --- | --- |
| `MAX_REQUESTS_PER_SERVER_PER_MINUTE` | 50 | Every command in one server, from anyone. |
| `MAX_REQUESTS_PER_USER_PER_MINUTE` | 10 | One person's commands, wherever they run them. |
| `MAX_BUTTON_CLICKS_PER_SERVER_PER_MINUTE` | 75 | Every button click in one server, from anyone. |
| `MAX_BUTTON_CLICKS_PER_USER_PER_MINUTE` | 10 | One person's button clicks, wherever they click them. |
| `MAX_SUGGESTIONS_PER_USER_PER_MINUTE` | 60 | One person's autocomplete suggestions. Past it they get none. |
| `TOWERHUB_BOT_KEY` | required | Secret. Sent as `X-Bot-Key`; when it matches TowerHub's `RateLimit__Reads__BotKey`, TowerHub doesn't count the bot's reads. |

Each must be whole and positive; anything else falls back to the default rather than leaving the
bot unthrottled. Button clicks are counted separately from commands, so a burst of clicks
can't lock everyone out of commands.

The per-server limits keep one busy server from using up every other server's share. There is no
bot-wide limit. DMs have no server, so only the per-user limit counts them. The narrowest limit is
checked first — the person, then their server — and a request that is turned away consumes nothing from any of
them, so being throttled never eats into the budget it was just denied.

When a limit is hit the command or click does nothing, and the bot replies with the same notice
whichever limit it was: **Slow down** — *Please wait a moment and try again.* It never says which
limit was hit. The only difference is who sees it:

- **Per-server command limit** — a visible reply in the channel, since everyone there is held back.
  Only the first in a minute is public, and the rest are ephemeral, so a raid can't turn the
  notices themselves into spam.
- **Every other limit** — an ephemeral reply only that person can see, keeping one person's spam
  out of the channel, and keeping one busy server's traffic out of every other server's channels.

Autocomplete is deliberately **not** throttled: it fires on every keystroke, it cannot be
replied to, and it runs entirely from data already in memory.

The windows live in the bot's process, so restarting clears them and a second instance would
count separately.

## Logs

Every slash command logs one line to the console (Railway's deploy logs), with the command as
typed, who ran it (name and user id) and where (channel, then server name and id), ending in how
it went:

```
/glossary term:"damage over time" from steve (284716395027349504) in #general on "TowerHub" (1180412563857285120): done in 212ms
/item eternal:Dahla from alex (190553828741234688) in #general on Arkheron (1093476218840539156): throttled (server limit, 41s until a slot frees up)
/faq topic:Beta from steve (284716395027349504) in #general on "TowerHub" (1180412563857285120): failed after 35ms
```

Done lines go to stdout, throttled ones as warnings and failures as errors with the stack after
them. Option values and server names with spaces or punctuation are quoted, so free text like a
typed `/glossary term:` can't pass for the rest of the line. Autocomplete and button clicks aren't
logged, except when a click is throttled or either one fails; those lines name the channel and
server too.

## Content

Eternals, items and the glossary come from the [TowerHub](https://towerhub.io) API. Everything
else lives in this repo as files, which can be edited without touching code. Restart the bot to
pick up changes to them.

| Source | Holds |
| --- | --- |
| `GET /api/system/gamedata` | Every eternal and every item in the game, as of the latest patch. |
| `GET /api/mechanics` | Every glossary term. |
| `GET /api/guides`, `GET /api/builds` | Published guides and builds, filtered and paged by TowerHub. Each also has `/{slug}` for one, and `/authors` for the usernames that have published. |
| `data/faq.json` | FAQ topics, each a list of `question`/`answer` pairs plus optional `aliases` (`playtest` → Beta). `/faq` numbers them in file order. |
| `data/socials.json` | Social links, each a `name`/`url` pair. `/socials` lists them in file order. |
| `images/items/`, `images/eternals/` | Item icons and eternal portraits, one PNG per TowerHub slug. |

Run `npm test` after editing. It checks the content more thoroughly than startup does, from
missing images to aliases that clash; see [Testing](#testing).

### Game data

The bot loads the game data before it logs in and keeps it in memory for 30 minutes
([src/gameData.ts](src/gameData.ts)). Discord allows 3 seconds to answer a command and TowerHub can
take longer than that, so nothing that reads game data waits on it. Once the data expires, the next
command or autocomplete keystroke is answered from what's in memory and starts a refresh, which
everything arriving in the meantime shares. So that one answer can be older than 30 minutes; the
ones after it aren't.

If a refresh fails, the bot keeps what it has and tries again a minute later. If TowerHub is down
when the bot starts, it logs in anyway: `/faq`, `/socials` and `/help` work, and the game commands
answer *Try again in a moment* until a load succeeds. Set `TOWERHUB_URL` to use another instance,
such as a local one on `http://localhost:5080`.

A change on TowerHub needs no restart or deploy here. New eternals appear in `/eternals` and
`/item eternal:` by themselves, because those options use autocomplete rather than a list
registered with Discord. TowerHub imports a new eternal with its title and description blank until
someone writes them, so the embeds leave out whatever is empty.

How the embeds read TowerHub's model:

- **Ownership** is on the item (`eternalSlug`). An item with none is an Echo item, which is what
  `/item eternal:Echo` lists.
- **Weapons** always have two abilities, the primary basic attack then the secondary one on a
  cooldown. The embed labels them by that order.
- **Levels** hold an ability's full stats at each level, so the embed shows the first level in
  full and only what changes after that, numbered like the game (`II`, `III`). Core abilities and
  basic attacks have one level. `damageText` is free text such as `15 / 15 / 10+10`, shown as
  **Damage**.
- **`upgradeEffect`** is dropped only when it merely restates the numbers ("Blind Duration 6s" vs
  "Blind duration increased to 6 seconds"). Text that adds something, or that leaves the number
  out ("Radius increased"), is shown alongside them.
- **Mechanics** are glossary terms, so `/glossary` explains them. One that arrives with an upgrade
  names the level, like `Invulnerable III`.
- **Links** go to TowerHub. A detail embed's title opens that eternal's or item's page, and a
  list's title opens `/eternals`, or `/items` filtered like the list. TowerHub has no Echo filter,
  so an Echo list opens on everything in its slot. Item and eternal names inside these embeds
  link to their own pages.

There are no per-character health/damage/speed stats — every player has the same 200 Essence
and 100 Fortitude.

### Guides and builds

`/guide` and `/build` ask TowerHub for each new search ([src/content.ts](src/content.ts)), keeping
what it answers for 30 seconds, so a deleted guide can linger that long. That makes them the only commands that wait on
it ([src/utils/browse.ts](src/utils/browse.ts)):

- **Commands** defer, which shows Discord's loading message and allows 15 minutes instead of 3
  seconds, then edit that message with the answer. If TowerHub fails, the message says it's
  unavailable and to try again later.
- **Autocomplete** can't defer, so a suggestion gives up after 2 seconds and answers with none.
  Suggestions are cached for 30 seconds ([src/utils/ttlCache.ts](src/utils/ttlCache.ts)), so
  typing the same thing again, or several people doing so, costs one request.
- **Filters** go to TowerHub under the same names its site reads from the address, so a list's title
  opens that same list. A list stops at 10, and paging through the rest happens on TowerHub.
- **A picked suggestion** is sent as `slug:<slug>` and opened directly. Titles aren't unique, and
  TowerHub's search doesn't read slugs.

Anyone with a TowerHub username writes this text, so unlike game data it can't be trusted to behave
in an embed ([src/utils/markdown.ts](src/utils/markdown.ts)). Titles, names, usernames and summaries
are escaped to show as typed, and a build's Markdown summary is flattened to plain text. A title
inside the bot's own `[label](url)` has its square brackets turned into round ones, so `[S Tier]`
shows as `(S Tier)`, as a bracket could otherwise end the label early. Footers and autocomplete
choices don't render Markdown and need none of this.

A guide's body stays on TowerHub: it can run to 20,000 characters of tables and images. Only
`eternal/<slug>` thumbnails show, as the bot has no copy of TowerHub's other art.

### Images

Icons and portraits are local files named after the TowerHub slug (`images/items/bow.png`).
TowerHub's API doesn't say where its art is, and the file names change with each of its builds.
The embed thumbnail points at the same file in this repo on GitHub, under `IMAGE_BASE_URL`
(default: `https://raw.githubusercontent.com/TowerDB/TowerHubDiscordBot/main/`). Discord fetches
it once and caches it. `npm test` checks every slug in the saved TowerHub data; the bot itself
doesn't, and a missing file just leaves the embed without a thumbnail. That's what a new item
gets until someone adds its PNG.

To add one, drop a PNG into `images/`, named after the slug; anything about 256px across is plenty,
since Discord shows thumbnails at 80px. **It only shows up once it's on `main`** (or whichever
branch `IMAGE_BASE_URL` names). Replacing an image under the same name can keep showing the old
one for a while, because Discord caches by URL.

## Adding a command

1. Create `src/commands/yourCommand.ts` exporting a `Command` (see [src/types.ts](src/types.ts)).
   Give it a `SlashCommandBuilder` as `data`, plus `usage` and `examples` for /help.
2. Add it to the `commands` array in [src/commands/registry.ts](src/commands/registry.ts).

`/help` reads that array, so the new command documents itself. The tests read it too, and check
that its `usage` and `examples` name it and that it has an `autocomplete` handler if any option
asks for one.

## Testing

```sh
npm test             # run once
npm run test:watch   # re-run on every save
```

The tests use [Vitest](https://vitest.dev/) and live in `tests/`. CI runs them on every pull
request and push to `main`, alongside typecheck, lint and build. None of them talk to Discord:
the logic is tested as plain functions, and the rest checks the content against what Discord
will accept.

- **Logic.** `rateLimit.test.ts`, `search.test.ts`, `share.test.ts` and `logging.test.ts` cover
  the sliding-window limits, lookup ranking and typo tolerance, the Post to channel button, and
  how commands appear in the logs. The rate limiter takes the current time as an argument, so
  windows are tested by passing timestamps rather than waiting. `replies.test.ts` covers how a
  failure is reported, depending on what the command or button had already done, and
  `markdown.test.ts` how text written by users is made safe to show.
- **Guides and builds.** `content.test.ts` runs `/guide` and `/build` against a stubbed TowerHub:
  which address each option becomes, one match against several against none, and suggestions when
  TowerHub fails. There are no saved responses for these, as the embeds are tested with hand-written
  ones in `helpers.ts`, including text written to break them.
- **Game data cache.** `gameData.test.ts` covers the 30-minute expiry, answering from what's in
  memory during a refresh, sharing one refresh, and keeping good data through a failed one. It
  tells time with fake timers rather than waiting.
- **Content.** `data.test.ts` checks the files and a saved copy of TowerHub's responses in
  `tests/fixtures/`, which `tests/setup.ts` loads the way the bot does at startup, so nothing
  reaches the network: unique slugs, each eternal carrying a crown, an amulet and two weapons, an
  image for each slug, every mechanic having a glossary entry, and every item name, glossary
  term, FAQ topic and alias finding only its own entry. An alias shared by two entries makes the
  bot list both instead of answering.
- **Embeds.** `embeds.test.ts` renders every embed the bot can send from the saved data, and
  every `/item eternal: slot:` combination. It fails if one would break Discord's limits or have
  its text cut short. `commands.test.ts` checks that every command registers and documents itself
  as described in [Adding a command](#adding-a-command).

After a content edit, a failure names the entry to fix: an alias that's another topic's name, a
mechanic missing from the glossary, an ability too long for its embed.

The saved copy doesn't update itself, and what's live on TowerHub isn't tested. To check a new
patch against the tests, refresh it and run them:

```sh
curl -o tests/fixtures/gamedata.json https://towerhub.io/api/system/gamedata
curl -o tests/fixtures/mechanics.json https://towerhub.io/api/mechanics
```

## Layout

```
data/          Content kept here: faq and socials JSON
images/        Item icons and eternal portraits
src/
  index.ts     Client setup, command registration, interaction dispatch, shutdown
  config.ts    Env vars, with defaults for the optional ones
  rateLimit.ts Sliding-window throttling, per server and per user
  share.ts     The Post to channel button on private replies, and its click
  data.ts      Loads and validates the JSON files
  gameData.ts  Eternals, items and the glossary from TowerHub, cached in memory for 30 minutes
  content.ts   Guides and builds from TowerHub, cached for 30 seconds
  types.ts     Command, TowerHub's models and the content types: Eternal, Item, FaqTopic, SocialLink
  commands/    One file per command, plus registry.ts
  embeds/      The embeds, one file per concept (eternals, items, glossary…), with the shared
               builders in general.ts
  utils/       Helpers that aren't embeds, one file per concept, with the shared ones
               (truncation, normalizing) in general.ts
    discordLimits.ts  Discord's embed, message and autocomplete limits, in one place
    search.ts  Name/alias matching with typo tolerance, lookup replies, autocomplete
    browse.ts  /guide and /build's search, reply and suggestions, which wait on TowerHub
    markdown.ts  Making text written by users safe to show in an embed
    replies.ts  Answering a deferred command, and reporting a failure
    images.ts  Image paths to their GitHub URLs
    towerhub.ts  TowerHub's API and page addresses
    abilities.ts  An ability's text: stats by level, upgrades and mechanics
    logging.ts The one-line description of a command in the logs
tests/         Vitest tests, one file per area, and a saved copy of TowerHub's responses; see Testing
```