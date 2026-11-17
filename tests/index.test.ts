import { EventEmitter } from 'node:events';

import { Events } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SNOWFLAKE = '123456789012345678';
const REQUESTS_PER_USER = 10;

const mocks = vi.hoisted(() => ({
  clients: [] as unknown[],
  login: vi.fn(),
  destroy: vi.fn(),
  execute: vi.fn(),
  autocomplete: vi.fn(),
  handleShare: vi.fn(),
  isShareComponent: vi.fn(),
  replyWithFailure: vi.fn(),
  refreshGameData: vi.fn(),
}));

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  const { EventEmitter: Emitter } = await import('node:events');

  class FakeClient extends Emitter {
    login = mocks.login;
    destroy = mocks.destroy;

    constructor() {
      super();
      mocks.clients.push(this);
    }
  }

  return { ...actual, Client: FakeClient };
});

vi.mock('../src/commands/registry.js', () => ({
  createRegistry: () => ({
    commands: [{ data: { name: 'ping' } }],
    find: (name: string) => (name === 'ping' ? { data: { name }, execute: mocks.execute, autocomplete: mocks.autocomplete } : undefined),
  }),
}));

vi.mock('../src/gameData.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/gameData.js')>(),
  GameDataCache: class {
    refresh = mocks.refreshGameData;
  },
}));

vi.mock('../src/share.js', () => ({
  handleShare: mocks.handleShare,
  isShareComponent: mocks.isShareComponent,
}));

vi.mock('../src/utils/replies.js', () => ({ replyWithFailure: mocks.replyWithFailure }));

type Handler = (...args: unknown[]) => unknown;

interface Started {
  client: EventEmitter;
  /** Calls every listener for the event and waits for them. */
  dispatch(event: string, ...args: unknown[]): Promise<void>;
  /** What the bot registered with process.on and process.once. */
  processHandlers: Map<string, Handler>;
  exit: ReturnType<typeof vi.spyOn>;
}

/** Imports index.ts afresh, which starts the bot, with the process and Discord stubbed. */
async function start(guildId = ''): Promise<Started> {
  vi.resetModules();
  vi.stubEnv('GUILD_ID', guildId);
  // Empty, so a developer's .env can't change the limits the tests count against.
  for (const name of ['MAX_REQUESTS_PER_SERVER_PER_MINUTE', 'MAX_REQUESTS_PER_USER_PER_MINUTE', 'MAX_BUTTON_CLICKS_PER_SERVER_PER_MINUTE', 'MAX_BUTTON_CLICKS_PER_USER_PER_MINUTE', 'MAX_SUGGESTIONS_PER_USER_PER_MINUTE']) {
    vi.stubEnv(name, '');
  }
  mocks.clients.length = 0;

  const processHandlers = new Map<string, Handler>();
  const register = (event: string, handler: Handler): NodeJS.Process => {
    processHandlers.set(event, handler);

    return process;
  };
  vi.spyOn(process, 'on').mockImplementation(register as never);
  vi.spyOn(process, 'once').mockImplementation(register as never);
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

  await import('../src/index.js');
  const client = mocks.clients[0] as EventEmitter;

  return {
    client,
    exit,
    processHandlers,
    async dispatch(event, ...args) {
      await Promise.all(client.listeners(event).map((listener) => (listener as Handler)(...args)));
    },
  };
}

function chatCommand(overrides: Record<string, unknown> = {}) {
  return {
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isChatInputCommand: () => true,
    commandName: 'ping',
    options: { data: [] },
    user: { id: 'user-1', tag: 'steve' },
    inGuild: () => true,
    channel: { name: 'general' },
    channelId: 'channel-1',
    guild: { name: 'TowerHub' },
    guildId: 'guild-1',
    reply: vi.fn(async () => undefined),
    ...overrides,
  };
}

function autocomplete(overrides: Record<string, unknown> = {}) {
  return {
    ...chatCommand({ isAutocomplete: () => true, isChatInputCommand: () => false }),
    respond: vi.fn(async () => undefined),
    ...overrides,
  };
}

function button(overrides: Record<string, unknown> = {}) {
  return chatCommand({
    isMessageComponent: () => true,
    isChatInputCommand: () => false,
    customId: 'share',
    ...overrides,
  });
}

beforeEach(() => {
  mocks.login.mockResolvedValue('token');
  mocks.destroy.mockResolvedValue(undefined);
  mocks.execute.mockResolvedValue(undefined);
  mocks.autocomplete.mockResolvedValue(undefined);
  mocks.handleShare.mockResolvedValue(undefined);
  mocks.isShareComponent.mockReturnValue(true);
  mocks.replyWithFailure.mockResolvedValue(undefined);
  mocks.refreshGameData.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('startup', () => {
  it('logs in with the token and starts loading game data', async () => {
    await start();

    expect(mocks.login).toHaveBeenCalledWith('test-token');
    expect(mocks.refreshGameData).toHaveBeenCalledOnce();
  });

  it('exits when logging in fails', async () => {
    mocks.login.mockRejectedValue(new Error('bad token'));

    const { exit } = await start();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    expect(console.error).toHaveBeenCalledWith('Failed to log in:', expect.any(Error));
  });

  it('registers the commands globally when no server is set', async () => {
    const { dispatch } = await start();
    const set = vi.fn(async () => undefined);

    await dispatch(Events.ClientReady, { user: { tag: 'bot' }, application: { commands: { set } }, guilds: { fetch: vi.fn() } });

    expect(set).toHaveBeenCalledWith([{ name: 'ping' }]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('globally'));
  });

  it('registers the commands to the server when one is set', async () => {
    const { dispatch } = await start(SNOWFLAKE);
    const set = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => ({ name: 'Dev', commands: { set } }));

    await dispatch(Events.ClientReady, { user: { tag: 'bot' }, application: { commands: { set: vi.fn() } }, guilds: { fetch } });

    expect(fetch).toHaveBeenCalledWith(SNOWFLAKE);
    expect(set).toHaveBeenCalledWith([{ name: 'ping' }]);
  });

  it('logs a failed registration and carries on', async () => {
    const { dispatch } = await start();
    const set = vi.fn(async () => {
      throw new Error('nope');
    });

    await dispatch(Events.ClientReady, { user: { tag: 'bot' }, application: { commands: { set } }, guilds: { fetch: vi.fn() } });

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to register commands globally'), expect.any(Error));
    expect(console.log).toHaveBeenCalledWith('Logged in as bot.');
  });
});

describe('shutdown', () => {
  it('exits when an error nothing caught is thrown', async () => {
    const { processHandlers, exit } = await start();

    processHandlers.get('uncaughtException')?.(new Error('boom'));

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('stays up on a rejection nothing caught', async () => {
    const { processHandlers, exit } = await start();

    processHandlers.get('unhandledRejection')?.(new Error('boom'));

    expect(exit).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('exits when Discord invalidates the session', async () => {
    const { dispatch, exit } = await start();

    await dispatch(Events.Invalidated);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it.each(['SIGTERM', 'SIGINT'])('logs out and exits cleanly on %s', async (signal) => {
    const { processHandlers, exit } = await start();

    processHandlers.get(signal)?.();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});

describe('commands', () => {
  it('runs a command and logs how it went', async () => {
    const { dispatch } = await start();
    const interaction = chatCommand();

    await dispatch(Events.InteractionCreate, interaction);

    expect(mocks.execute).toHaveBeenCalledWith(interaction);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\/ping from steve \(user-1\) in #general on TowerHub \(guild-1\): done in \d+ms$/));
  });

  it('ignores a command it does not have', async () => {
    const { dispatch } = await start();

    await dispatch(Events.InteractionCreate, chatCommand({ commandName: 'nope' }));

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('ignores interactions that are not commands, suggestions or buttons', async () => {
    const { dispatch } = await start();

    await dispatch(Events.InteractionCreate, chatCommand({ isChatInputCommand: () => false }));

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('tells the user a command failed', async () => {
    mocks.execute.mockRejectedValue(new Error('boom'));
    const { dispatch } = await start();
    const interaction = chatCommand();

    await dispatch(Events.InteractionCreate, interaction);

    expect(mocks.replyWithFailure).toHaveBeenCalledWith(interaction, 'That command failed. Try again in a moment.');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('failed after'), expect.any(Error));
  });

  it('tells the user game data is still loading', async () => {
    const { GameDataNotLoadedError } = await import('../src/gameData.js');
    mocks.execute.mockRejectedValue(new GameDataNotLoadedError());
    const { dispatch } = await start();
    const interaction = chatCommand();

    await dispatch(Events.InteractionCreate, interaction);

    expect(mocks.replyWithFailure).toHaveBeenCalledWith(interaction, expect.stringContaining('still loading'));
  });

  it('throttles a user past the limit and says so privately', async () => {
    const { dispatch } = await start();
    const interaction = chatCommand();

    for (let call = 0; call < REQUESTS_PER_USER; call += 1) {
      await dispatch(Events.InteractionCreate, interaction);
    }
    expect(interaction.reply).not.toHaveBeenCalled();

    await dispatch(Events.InteractionCreate, interaction);

    expect(mocks.execute).toHaveBeenCalledTimes(REQUESTS_PER_USER);
    expect(interaction.reply).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('throttled (user limit'));
  });

  it('counts each user on their own', async () => {
    const { dispatch } = await start();

    for (let call = 0; call < REQUESTS_PER_USER; call += 1) {
      await dispatch(Events.InteractionCreate, chatCommand());
    }
    await dispatch(Events.InteractionCreate, chatCommand({ user: { id: 'user-2', tag: 'other' } }));

    expect(mocks.execute).toHaveBeenCalledTimes(REQUESTS_PER_USER + 1);
  });
});

describe('suggestions', () => {
  it('are asked of the command', async () => {
    const { dispatch } = await start();
    const interaction = autocomplete();

    await dispatch(Events.InteractionCreate, interaction);

    expect(mocks.autocomplete).toHaveBeenCalledWith(interaction);
  });

  it('answer with none once a user types past the limit', async () => {
    const { dispatch } = await start();
    const interaction = autocomplete();

    for (let call = 0; call < 61; call += 1) {
      await dispatch(Events.InteractionCreate, interaction);
    }

    expect(mocks.autocomplete).toHaveBeenCalledTimes(60);
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('answer with none and log an error when they fail', async () => {
    mocks.autocomplete.mockRejectedValue(new Error('boom'));
    const { dispatch } = await start();
    const interaction = autocomplete();

    await dispatch(Events.InteractionCreate, interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Autocomplete for "ping"'), expect.any(Error));
  });

  it('only warn when game data has not loaded', async () => {
    const { GameDataNotLoadedError } = await import('../src/gameData.js');
    mocks.autocomplete.mockRejectedValue(new GameDataNotLoadedError());
    const { dispatch } = await start();
    const interaction = autocomplete();

    await dispatch(Events.InteractionCreate, interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'));
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('buttons', () => {
  it('are handed to the share handler', async () => {
    const { dispatch } = await start();
    const interaction = button();

    await dispatch(Events.InteractionCreate, interaction);

    expect(mocks.handleShare).toHaveBeenCalledWith(interaction);
  });

  it('are ignored unless they share', async () => {
    mocks.isShareComponent.mockReturnValue(false);
    const { dispatch } = await start();

    await dispatch(Events.InteractionCreate, button({ customId: 'other' }));

    expect(mocks.handleShare).not.toHaveBeenCalled();
  });

  it('tell the user when sharing fails', async () => {
    mocks.handleShare.mockRejectedValue(new Error('boom'));
    const { dispatch } = await start();
    const interaction = button();

    await dispatch(Events.InteractionCreate, interaction);

    expect(mocks.replyWithFailure).toHaveBeenCalledWith(interaction, expect.stringContaining('didn\'t work'));
  });

  it('are throttled past the limit and the user is told', async () => {
    const { dispatch } = await start();
    const interaction = button();

    for (let click = 0; click < REQUESTS_PER_USER + 1; click += 1) {
      await dispatch(Events.InteractionCreate, interaction);
    }

    expect(mocks.handleShare).toHaveBeenCalledTimes(REQUESTS_PER_USER);
    expect(interaction.reply).toHaveBeenCalledOnce();
  });
});
