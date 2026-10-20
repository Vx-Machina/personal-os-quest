/** Shape of the goals module state sent to clients (web app, Discord bot). */
import type { Domain } from '../domains';
import type { GoalProgress, MetricResult } from './progress';
import type { gymStats, mealStats, pomodoroStats, ProtocolState, runStats, smokingStats, sunStats, wakeStats } from './trackers';
import type {
  CheckinData,
  FearData,
  Goal,
  GoalSettings,
  GoalTask,
  HanseiData,
  IdentityData,
  IkigaiData,
  LeadData,
  LogEntry,
  ParetoData,
  ProtocolsData,
  TextData,
  YearReviewData,
} from './types';

export type { GoalProgress };

export interface GoalView extends Goal {
  progress: number;
  measure: MetricResult | null;
  tasksDone: number;
  tasksTotal: number;
  childIds: number[];
  questTitle: string | null;
  pomodorosToday: number;
  pomodorosTotal: number;
}

export interface WeekSummary {
  week: string;
  days: number;
  xp: number;
  questsDone: number;
  wakeAvg: string | null;
  wakeOnTime: number;
  runDays: number;
  gymSessions: number;
  sunDays: number;
  smokeFreeDays: number | null;
  cigarettes: number;
  cravings: number;
  cravingsResisted: number;
  pomodoros: number;
  mealDays: number;
  moodAvg: number | null;
  energyAvg: number | null;
  kaizenNotes: number;
  gratitudeNotes: number;
  protocolChecks: number;
}

export interface GoalState {
  today: string;
  week: string;
  year: string;
  now: string;
  timezone: string;
  settings: GoalSettings;
  goals: GoalView[];
  tasks: GoalTask[];
  top3: GoalTask[];
  suggestions: GoalTask[];
  seasonProgress: number;
  trackers: {
    smoking: ReturnType<typeof smokingStats>;
    wake: ReturnType<typeof wakeStats>;
    gym: ReturnType<typeof gymStats>;
    run: ReturnType<typeof runStats>;
    sun: ReturnType<typeof sunStats>;
    meals: ReturnType<typeof mealStats>;
    pomodoro: ReturnType<typeof pomodoroStats>;
  };
  protocols: ProtocolState[];
  /** Entries from the last 3 days, newest first (lets you correct a mistaken log). */
  recentLogs: LogEntry[];
  journal: {
    checkin: CheckinData | null;
    gratitude: TextData | null;
    kaizen: TextData | null;
    protocols: ProtocolsData | null;
    hansei: { thisWeek: HanseiData | null; lastWeek: HanseiData | null };
    pareto: { thisWeek: ParetoData | null; lastWeek: ParetoData | null };
    lead: { thisWeek: LeadData | null; nextWeek: LeadData | null };
    yearReview: { year: string; data: YearReviewData }[];
    ikigai: IkigaiData | null;
    identity: IdentityData | null;
    fears: { id: string; data: FearData; updatedAt: string }[];
  };
  mood: { day: string; mood: number | null; energy: number | null }[];
  streaks: { day: number; bestDay: number; smokeFree: number; wake: number; run: number; sun: number; meals: number; kaizen: number; gratitude: number; gym: string };
  wheel: { weeks: string[]; points: Record<Domain, number[]> };
  thisWeek: WeekSummary;
  lastWeek: WeekSummary;
}

