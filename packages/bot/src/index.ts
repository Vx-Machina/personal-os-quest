/**
 * Discord front end. Reads the bot token from DISCORD_TOKEN (never hard-coded),
 * registers the slash commands, and forwards every interaction to handlers.ts,
 * which talks to the same HTTP API as the web app.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type ApplicationCommandDataResolvable,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type User,
} from 'discord.js';
import { createApi } from './api';
import { COMMANDS } from './commands';
import { handle, suggest, type Ctx, type ParsedCommand, type Reply } from './handlers';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error('DISCORD_TOKEN is not set. Copy .env.example to .env and paste your bot token (see README, "Discord bot").');
  process.exit(1);
}
const guildId = process.env.DISCORD_GUILD_ID?.trim() || undefined;
const ownerId = process.env.DISCORD_OWNER_ID?.trim() || undefined;
const api = createApi(process.env.API_URL?.trim() || 'http://127.0.0.1:8787');

const ctxFor = (user: User): Ctx => ({ api, user: { id: user.id, name: user.globalName ?? user.username }, ownerId });

function parse(i: ChatInputCommandInteraction | AutocompleteInteraction): ParsedCommand {
  const sub = i.options.getSubcommand(false) ?? undefined;
  const raw = sub ? (i.options.data[0]?.options ?? []) : i.options.data;
  return { name: i.commandName, sub, options: Object.fromEntries(raw.map((o) => [o.name, o.value])) };
}

function toDiscord(reply: Reply): InteractionReplyOptions {
  return {
    content: reply.content,
    embeds: reply.embeds,
    files: reply.files?.map((f) => ({ attachment: f.data, name: f.name })),
    flags: reply.private ? MessageFlags.Ephemeral : undefined,
  };
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const commands = COMMANDS as unknown as ApplicationCommandDataResolvable[];
  try {
    if (guildId) {
      const guild = await c.guilds.fetch(guildId);
      await guild.commands.set(commands);
      console.log(`Registered ${COMMANDS.length} commands in guild ${guild.name} (instant).`);
    } else {
      await c.application.commands.set(commands);
      console.log(`Registered ${COMMANDS.length} global commands (can take up to an hour to show up).`);
    }
  } catch (e) {
    console.error('Could not register slash commands:', e);
  }
  console.log(`Invite: https://discord.com/oauth2/authorize?client_id=${c.application.id}&scope=bot%20applications.commands&permissions=0`);
  if (!ownerId) console.log('Tip: set DISCORD_OWNER_ID to your Discord user id to control the same hero as the web app.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    try {
      const focused = interaction.options.getFocused(true);
      await interaction.respond(await suggest(parse(interaction), { name: focused.name, value: String(focused.value) }, ctxFor(interaction.user)));
    } catch (e) {
      console.error('Autocomplete failed:', e);
      await interaction.respond([]).catch(() => undefined);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  try {
    const reply = await handle(parse(interaction), ctxFor(interaction.user));
    await interaction.reply(toDiscord(reply));
  } catch (e) {
    console.error(`/${interaction.commandName} failed:`, e);
    const msg = { content: '⚠️ Something went wrong. Check the bot console.', flags: MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => undefined);
    else await interaction.reply(msg).catch(() => undefined);
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void client.destroy().finally(() => process.exit(0));
  });
}

await client.login(token);
