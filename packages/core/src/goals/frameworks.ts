/**
 * One-line explanations shown as tooltips. Each names the idea and where it comes from.
 * Paraphrased on purpose: short, practical, no essays.
 */
import type { ProtocolKey } from './types';

export interface Framework {
  name: string;
  source: string;
  idea: string;
}

export const FRAMEWORKS = {
  rpm: { name: 'RPM', source: 'Tony Robbins, Rapid Planning Method', idea: 'Result (what exactly), Purpose (why it matters), Massive action plan (the steps). Purpose first keeps you going.' },
  wheelReview: { name: 'Wheel of life review', source: 'Tony Robbins (and coaching practice)', idea: 'Once a year, rate each life area 1-10 to see where you are out of balance and choose where to focus.' },
  pareto: { name: '80/20', source: 'Pareto principle, applied by Tim Ferriss', idea: 'A small share of activities drives most results (and most stress). Do more of the first, cut the second.' },
  easy: { name: 'If it were easy', source: 'Tim Ferriss, Tools of Titans', idea: 'Ask what this would look like if it were easy. It often reveals a simpler path.' },
  fear: { name: 'Fear-setting', source: 'Tim Ferriss, TED 2017', idea: 'Define the worst cases, how to prevent and repair them, the benefits of trying and the cost of doing nothing.' },
  lead: { name: 'Lead domino', source: 'Tim Ferriss, after Gary Keller’s The ONE Thing', idea: 'Pick the one task this week that makes everything else easier or unnecessary.' },
  ikigai: { name: 'Ikigai', source: 'Japanese idea of a reason for being', idea: 'Map what you love, what you are good at, what the world needs and what you can be paid for. The four-circle map is a popular Western framing.' },
  kaizen: { name: 'Kaizen', source: 'Japanese continuous improvement (Toyota)', idea: 'One small improvement a day. 1% better daily compounds to about 37x in a year (1.01^365).' },
  hansei: { name: 'Hansei', source: 'Japanese self-reflection practice', idea: 'Honest weekly look back: what went well, what did not, what you will change. No blame, just adjustment.' },
  ichigo: { name: 'Ichigo ichie', source: 'Japanese tea ceremony saying, "one time, one meeting"', idea: 'This moment will not come again. Note one thing you were present for or grateful for today.' },
  protocols: { name: 'Daily protocols', source: 'Inspired by the Huberman Lab podcast', idea: 'General wellbeing habits, not medical advice. All optional: switch off any that do not suit you.' },
  ifThen: { name: 'Implementation intentions', source: 'Peter Gollwitzer', idea: 'Plan "if X happens, then I will do Y" in advance, so the decision is already made when X shows up.' },
  stacking: { name: 'Habit stacking', source: 'James Clear, Atomic Habits (after BJ Fogg)', idea: 'Anchor a new habit to an existing one: "After I [current habit], I will [new habit]."' },
  woop: { name: 'WOOP', source: 'Gabriele Oettingen', idea: 'Wish, Outcome, Obstacle, Plan. Picture the outcome, name the inner obstacle, then plan for it.' },
  identity: { name: 'Identity-based habits', source: 'James Clear, Atomic Habits', idea: 'Decide who you want to be; each small action is a vote for that identity.' },
  checkin: { name: 'Mood and energy check-in', source: 'Self-tracking practice', idea: 'Rate mood and energy 1-5 once a day. Over weeks you can see what lifts or drains you.' },
  pomodoro: { name: 'Pomodoro Technique', source: 'Francesco Cirillo', idea: '25 minutes of single-task focus, then a 5-minute break. Count them to see real effort.' },
  season: { name: '90-day seasons', source: 'Quarterly planning practice', idea: 'Long enough to change something, short enough to stay focused. Break it into monthly milestones and weekly targets.' },
  gym48: { name: '48-hour rule', source: 'Training consistency rule of thumb', idea: 'Never let two days pass without a session. The card turns red when 48 hours have gone by.' },
  slips: { name: 'Slips', source: 'Quit-smoking support practice', idea: 'A slip is data, not failure. Log it, reset and keep going. Free help in France: Tabac Info Service, 39 89, tabac-info-service.fr.' },
} satisfies Record<string, Framework>;

export type FrameworkKey = keyof typeof FRAMEWORKS;

export const PROTOCOLS: { key: ProtocolKey; label: string; idea: string }[] = [
  { key: 'sunlight', label: 'Morning sunlight', idea: 'Get outdoor daylight soon after waking, ideally within 30-60 minutes.' },
  { key: 'focus', label: 'Focus block (up to 90 min)', idea: 'One deep, single-task block of up to about 90 minutes.' },
  { key: 'movement', label: 'Movement', idea: 'Move your body every day: walk, run or train.' },
  { key: 'exposure', label: 'Cold or heat exposure', idea: 'Optional deliberate cold (shower) or heat (sauna). Skip it if it does not suit you.' },
  { key: 'caffeine', label: 'Caffeine timing', idea: 'Commonly suggested: delay caffeine 90-120 minutes after waking and avoid it later in the day.' },
  { key: 'winddown', label: 'Wind-down', idea: 'Dim lights and put screens away before bed.' },
  { key: 'sleep', label: 'Sleep window', idea: 'In bed at your set bedtime, roughly the same time each night.' },
];

export const PROTOCOL_DISCLAIMER = 'General wellbeing habits, not medical advice.';
