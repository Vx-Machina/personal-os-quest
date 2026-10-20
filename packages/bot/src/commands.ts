/**
 * Slash-command definitions as raw Discord API JSON (no discord.js import), so they can be
 * validated in tests and registered with `application.commands.set(COMMANDS)`.
 * Option type numbers are fixed by the Discord API.
 */
import { DOMAINS, DOMAIN_INFO } from '@poq/core';

export const OPT = { SUB_COMMAND: 1, STRING: 3, INTEGER: 4, BOOLEAN: 5, NUMBER: 10 } as const;

export interface CommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: boolean;
  min_value?: number;
  max_value?: number;
  max_length?: number;
  choices?: { name: string; value: string | number }[];
  options?: CommandOption[];
}

export interface CommandJSON {
  name: string;
  description: string;
  type?: 1;
  options?: CommandOption[];
}

const id = (description: string): CommandOption => ({
  type: OPT.INTEGER,
  name: 'id',
  description,
  required: true,
  autocomplete: true,
  min_value: 1,
});

export const COMMANDS: CommandJSON[] = [
  {
    name: 'quest',
    description: 'Your quest log: dailies, habits and to-dos',
    options: [
      {
        type: OPT.SUB_COMMAND,
        name: 'list',
        description: 'Show your dailies, habits and to-dos with their ids',
        options: [
          {
            type: OPT.STRING,
            name: 'show',
            description: 'Which list (default: all)',
            choices: [
              { name: 'all', value: 'all' },
              { name: 'dailies', value: 'daily' },
              { name: 'habits', value: 'habit' },
              { name: 'to-dos', value: 'todo' },
            ],
          },
        ],
      },
      { type: OPT.SUB_COMMAND, name: 'done', description: 'Complete a daily or a to-do', options: [id('Quest id (start typing to search)')] },
      { type: OPT.SUB_COMMAND, name: 'undo', description: 'Uncheck a daily or to-do you completed by mistake', options: [id('Quest id')] },
      {
        type: OPT.SUB_COMMAND,
        name: 'add',
        description: 'Add a daily, habit or to-do',
        options: [
          {
            type: OPT.STRING,
            name: 'type',
            description: 'Kind of quest',
            required: true,
            choices: [
              { name: 'daily', value: 'daily' },
              { name: 'habit', value: 'habit' },
              { name: 'to-do', value: 'todo' },
            ],
          },
          { type: OPT.STRING, name: 'title', description: 'What to do', required: true, max_length: 120 },
          {
            type: OPT.STRING,
            name: 'domain',
            description: 'Life domain it grows',
            required: true,
            choices: DOMAINS.map((d) => ({ name: DOMAIN_INFO[d].label, value: d })),
          },
          {
            type: OPT.STRING,
            name: 'difficulty',
            description: 'Default: easy',
            choices: ['trivial', 'easy', 'medium', 'hard'].map((d) => ({ name: d, value: d })),
          },
        ],
      },
    ],
  },
  {
    name: 'habit',
    description: 'Score a habit: + for a good one, - for one you are breaking',
    options: [
      {
        type: OPT.STRING,
        name: 'direction',
        description: '+ or -',
        required: true,
        choices: [
          { name: '+', value: 'up' },
          { name: '-', value: 'down' },
        ],
      },
      id('Habit id (start typing to search)'),
    ],
  },
  {
    name: 'stats',
    description: 'Your hero: HP, XP, level, gold, streak and the nine life stats',
    options: [{ type: OPT.BOOLEAN, name: 'share', description: 'Post publicly in the channel (default: only you see it)' }],
  },
  { name: 'shop', description: 'Rewards and gear you can buy with gold' },
  {
    name: 'buy',
    description: 'Buy a reward or a piece of gear',
    options: [{ type: OPT.STRING, name: 'item', description: 'What to buy (start typing to search)', required: true, autocomplete: true }],
  },
  {
    name: 'goal',
    description: 'Your season goals, monthly milestones and weekly targets',
    options: [
      { type: OPT.SUB_COMMAND, name: 'list', description: 'Season goals with progress rings as bars' },
      { type: OPT.SUB_COMMAND, name: 'progress', description: 'One goal in detail: tracker, milestones, action plan', options: [id('Goal id (start typing to search)')] },
    ],
  },
  { name: 'today', description: 'Top 3 tasks, tracker status and today’s protocol checks' },
  {
    name: 'review',
    description: 'This week in numbers; add hansei notes to save your weekly reflection',
    options: [
      { type: OPT.STRING, name: 'went-well', description: 'Hansei: what went well?', max_length: 1000 },
      { type: OPT.STRING, name: 'didnt', description: "Hansei: what didn't?", max_length: 1000 },
      { type: OPT.STRING, name: 'change', description: 'Hansei: what will you change next week?', max_length: 1000 },
    ],
  },
  {
    name: 'log',
    description: 'Log a tracker entry from your phone',
    options: [
      { type: OPT.SUB_COMMAND, name: 'wake', description: 'Log your wake time', options: [{ type: OPT.STRING, name: 'time', description: 'HH:MM (default: now)', max_length: 5 }] },
      { type: OPT.SUB_COMMAND, name: 'sun', description: 'Log morning sunlight', options: [{ type: OPT.INTEGER, name: 'minutes', description: 'Minutes outside (default 10)', min_value: 1 }] },
      {
        type: OPT.SUB_COMMAND,
        name: 'run',
        description: 'Log a run',
        options: [
          { type: OPT.INTEGER, name: 'minutes', description: 'Duration', min_value: 1 },
          { type: OPT.NUMBER, name: 'km', description: 'Distance', min_value: 0.1 },
        ],
      },
      { type: OPT.SUB_COMMAND, name: 'gym', description: 'Log a gym session', options: [{ type: OPT.INTEGER, name: 'minutes', description: 'Duration', min_value: 1 }] },
      {
        type: OPT.SUB_COMMAND,
        name: 'meal',
        description: 'Log a meal',
        options: [
          {
            type: OPT.STRING,
            name: 'slot',
            description: 'Which meal',
            required: true,
            choices: [
              { name: 'breakfast', value: 'breakfast' },
              { name: 'lunch', value: 'lunch' },
              { name: 'dinner', value: 'dinner' },
            ],
          },
          { type: OPT.BOOLEAN, name: 'healthy', description: 'Was it healthy? (default yes)' },
        ],
      },
      {
        type: OPT.SUB_COMMAND,
        name: 'craving',
        description: 'Log a cigarette craving (shows your if-then plan)',
        options: [
          { type: OPT.BOOLEAN, name: 'resisted', description: 'Did you ride it out?', required: true },
          { type: OPT.INTEGER, name: 'intensity', description: '1-5', min_value: 1, max_value: 5 },
          { type: OPT.STRING, name: 'trigger', description: 'What set it off?', max_length: 200 },
        ],
      },
      { type: OPT.SUB_COMMAND, name: 'smoke', description: 'Log cigarettes smoked (no HP lost)', options: [{ type: OPT.INTEGER, name: 'count', description: 'How many (default 1)', min_value: 1, max_value: 100 }] },
      { type: OPT.SUB_COMMAND, name: 'pomodoro', description: 'Log a finished pomodoro', options: [{ type: OPT.INTEGER, name: 'goal', description: 'Goal it was for (start typing)', autocomplete: true, min_value: 1 }] },
      {
        type: OPT.SUB_COMMAND,
        name: 'mood',
        description: 'Daily mood and energy check-in',
        options: [
          { type: OPT.INTEGER, name: 'mood', description: '1-5', required: true, min_value: 1, max_value: 5 },
          { type: OPT.INTEGER, name: 'energy', description: '1-5', required: true, min_value: 1, max_value: 5 },
        ],
      },
    ],
  },
  {
    name: 'daily-reset',
    description: 'Roll the day over (missed dailies cost HP)',
    options: [{ type: OPT.BOOLEAN, name: 'force', description: 'End the day now, even before the reset time' }],
  },
];
