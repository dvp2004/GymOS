import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeEvent, FormEvent, PointerEvent } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './lib/supabase'
import './App.css'

const EXISTING_CHATGPT_COACH_URL = import.meta.env.VITE_EXISTING_CHATGPT_COACH_URL ?? ''

type Tab = 'today' | 'workout' | 'nutrition' | 'trends' | 'coach'
type WorkoutType = 'Upper' | 'Lower' | 'Mix' | 'Cardio' | 'Recovery' | 'Rest' | 'Custom'
type SyncState = 'local' | 'checking' | 'syncing' | 'synced' | 'error'
type AuthMode = 'sign-in' | 'sign-up'
type TrainingKind = 'upper' | 'lower' | 'mix' | 'cardio' | 'none'

type ExerciseEntry = {
  id: string
  name: string
  weight: string
  unit: 'lbs' | 'kg' | 'bodyweight'
  sets: string
  reps: string
  completedSets: number
}

type FoodItem = {
  id: string
  name: string
  calories: string
}

type MealTag =
  | 'high-protein'
  | 'low-protein'
  | 'heavy-carbs'
  | 'light-meal'
  | 'restaurant'
  | 'post-workout'
  | 'pre-workout'
  | 'late-meal'
  | 'hydration-poor'

type MealEntry = {
  id: string
  label: 'Pre-workout' | 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner' | 'Other'
  description: string
  proteinScore: 0 | 1 | 2 | 3
  tags: MealTag[]
  items: FoodItem[]
}

type DailyLog = {
  id: string
  date: string
  weightKg: string
  waistSizeCm: string
  sleepHours: string
  workoutType: WorkoutType
  gymTime: string
  preWorkout: string
  postGymEnergy: string
  treadmillDistanceKm: string
  treadmillMinutes: string
  treadmillIncline: string
  strengthCalories: string
  cardioCalories: string
  basketballCalories: string
  cyclingCalories: string
  notes: string
  exercises: ExerciseEntry[]
  meals: MealEntry[]
  createdAt: string
  updatedAt: string
}

type DailyLogRow = {
  id: string
  user_id: string
  log_date: string
  weight_kg: number | string | null
  waist_size_cm: number | string | null
  sleep_hours: number | string | null
  workout_type: string | null
  gym_time: string | null
  pre_workout: string | null
  post_gym_energy: number | null
  treadmill_distance_km: number | string | null
  treadmill_minutes: number | string | null
  treadmill_incline: number | string | null
  strength_calories: string | null
  cardio_calories: string | null
  basketball_calories: string | null
  cycling_calories: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type ExerciseRow = {
  id: string
  daily_log_id: string
  exercise_name: string
  weight: string | null
  unit: ExerciseEntry['unit'] | string | null
  sets: string | null
  reps: string | null
  completed_sets: number | null
  position: number
}

type MealRow = {
  id: string
  daily_log_id: string
  label: MealEntry['label'] | string
  description: string | null
  protein_score: number | null
  tags: string[] | null
  food_items: FoodItem[] | null
  position: number
}

type ExerciseHistorySummary = {
  lastLabel: string
  bestLabel: string
  lastPatch: Partial<ExerciseEntry>
  sessions: number
  lastScore: number | null
  bestScore: number | null
  bestDate: string | null
}

type ExercisePerformanceBadge = {
  label: string
  tone: 'new' | 'pr' | 'up' | 'match' | 'down'
}

type ParsedWorkoutText = {
  weightKg: string
  treadmillDistanceKm: string
  treadmillMinutes: string
  treadmillIncline: string
  strengthCalories: string
  cardioCalories: string
  basketballCalories: string
  cyclingCalories: string
  workoutType: WorkoutType
  exercises: ExerciseEntry[]
  warnings: ParserWarning[]
}

type TrendMetric =
  | 'weight'
  | 'waist'
  | 'cardio-distance'
  | 'cardio-minutes'
  | 'calories-total'
  | 'calories-strength'
  | 'calories-cardio'
  | 'calories-basketball'
  | 'calories-cycling'
  | 'food-calories'

type TrendRange = '1m' | '3m' | '1y' | 'all'

type ParserWarningLevel = 'info' | 'warning'

type ParserWarning = {
  id: string
  level: ParserWarningLevel
  message: string
  line?: string
  suggestion?: string
}

type AwardCategory = 'strength' | 'cardio' | 'basketball' | 'cycling'

type AwardEntry = {
  date: string
  value: number
  workoutType: WorkoutType
}

type AwardCard = {
  id: AwardCategory
  title: string
  subtitle: string
  unit: string
  best: AwardEntry | null
  topThree: AwardEntry[]
}

const TREND_RANGES: Array<{ id: TrendRange; label: string; days: number | null }> = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 90 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null },
]

const TREND_METRICS: Array<{ id: TrendMetric; label: string }> = [
  { id: 'weight', label: 'Weight' },
  { id: 'waist', label: 'Waist' },
  { id: 'cardio-distance', label: 'Cardio km' },
  { id: 'cardio-minutes', label: 'Cardio min' },
  { id: 'calories-total', label: 'Burned kcal' },
  { id: 'food-calories', label: 'Eaten kcal' },
  { id: 'calories-strength', label: 'Strength kcal' },
  { id: 'calories-cardio', label: 'Running kcal' },
  { id: 'calories-basketball', label: 'Basketball kcal' },
  { id: 'calories-cycling', label: 'Cycling kcal' },
]

const STORAGE_KEY = 'gymos.logs.v1'

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'today', label: 'Today', icon: '●' },
  { id: 'workout', label: 'Workout', icon: '◐' },
  { id: 'nutrition', label: 'Food', icon: '◒' },
  { id: 'trends', label: 'Trends', icon: '◓' },
  { id: 'coach', label: 'Coach', icon: '◆' },
]

const MEAL_TAGS: Array<{ id: MealTag; label: string }> = [
  { id: 'high-protein', label: 'High protein' },
  { id: 'low-protein', label: 'Low protein' },
  { id: 'heavy-carbs', label: 'Heavy carbs' },
  { id: 'light-meal', label: 'Light meal' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'pre-workout', label: 'Pre-workout' },
  { id: 'post-workout', label: 'Post-workout' },
  { id: 'late-meal', label: 'Late meal' },
  { id: 'hydration-poor', label: 'Hydration poor' },
]

const MEAL_TAG_IDS = new Set<MealTag>(MEAL_TAGS.map((tag) => tag.id))
const DEFAULT_MEAL_ORDER: MealEntry['label'][] = ['Pre-workout', 'Breakfast', 'Lunch', 'Snack', 'Dinner']

const LOWER_EXERCISE_CANONICALS = new Set([
  'squat',
  'reverse-lunge',
  'leg-curl',
  'leg-extension',
  'standing-calf-raise',
  'dumbbell-romanian-deadlift',
  'plank',
  'crunches',
])

const UPPER_EXERCISE_CANONICALS = new Set([
  'front-lat-pulldown',
  'machine-chest-press',
  'machine-shoulder-press',
  'machine-triceps-pushdown',
  'triceps-extension',
  'seated-row',
  'single-arm-row',
  'bicep-curl',
  'hammer-curl',
  'dumbbell-lateral-raise',
  'shoulder-shrug',
])

const GYM_QUOTES = [
  'Progress is rented. Rent is due daily.',
  'The boring reps are the ones that change you.',
  'Do the work. Let the trend prove it.',
  'Strong is built quietly, then noticed suddenly.',
  'One clean session beats ten perfect plans.',
  'You do not need motivation. You need a logged rep.',
  'Consistency is the compound interest of training.',
]

function AwardCategoryIcon({ category }: { category: AwardCategory }) {
  if (category === 'strength') {
    return (
      <span className="award-icon strength" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 10h2V8h2v8H5v-2H3v-4Zm4-1h10v6H7V9Zm10-1h2v2h2v4h-2v2h-2V8Z" />
        </svg>
      </span>
    )
  }

  if (category === 'cardio') {
    return (
      <span className="award-icon cardio" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M13.5 3 8 13h4l-1.5 8L16 11h-4.2L13.5 3Z" />
        </svg>
      </span>
    )
  }

  if (category === 'basketball') {
    return (
      <span className="award-icon basketball" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm-1 1.1A8.96 8.96 0 0 0 4.1 11H11V3.1Zm2 0V11h6.9A8.96 8.96 0 0 0 13 3.1ZM4.1 13A8.96 8.96 0 0 0 11 20.9V13H4.1Zm8.9 7.9A8.96 8.96 0 0 0 19.9 13H13v7.9Z" />
        </svg>
      </span>
    )
  }

  return (
    <span className="award-icon cycling" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M7 17.5a3.5 3.5 0 1 1-3.24-3.49A3.5 3.5 0 0 1 7 17.5Zm13.5 0a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM10 6h3l1.2 2.4h2.3a1 1 0 1 1 0 2h-3a1 1 0 0 1-.9-.56L11.8 8H10a1 1 0 1 1 0-2Zm1 11.5 2.4-5H9.8l1.2 2.4a1 1 0 0 1-1.8.9L7.1 11.5H6a1 1 0 1 1 0-2h1.7a1 1 0 0 1 .9.56l.8 1.54H14a1 1 0 0 1 .92 1.39l-2.08 4.51A1 1 0 1 1 11 17.5Z" />
      </svg>
    </span>
  )
}

function getDailyGymQuote(date: string) {
  const total = date.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return GYM_QUOTES[total % GYM_QUOTES.length]
}

function MotivationCard({ date }: { date: string }) {
  return (
    <section className="motivation-card span-2">
      <div>
        <p className="eyebrow">Training mindset</p>
        <h3>{getDailyGymQuote(date)}</h3>
      </div>
      <span>GymOS</span>
    </section>
  )
}

function getDisplayMeals(log: DailyLog) {
  return ensureDefaultMeals(log.meals)
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function makeMeal(label: MealEntry['label'], description = ''): MealEntry {
  return {
    id: makeId(),
    label,
    description,
    proteinScore: 1,
    tags: [],
    items: [],
  }
}

function makeDefaultMeal(label: MealEntry['label']): MealEntry {
  return {
    ...makeMeal(label),
    id: `default-${label.toLowerCase().replace(/\s+/g, '-')}`,
  }
}

function ensureDefaultMeals(meals: MealEntry[]) {
  const normalisedMeals = meals.map((meal) => ({
    ...meal,
    label: normaliseMealLabel(meal.label),
    // Important: do NOT call normaliseFoodItems here.
    // It removes blank items, which kills newly added empty food rows in the UI.
    items: Array.isArray(meal.items) ? meal.items : [],
  }))

  const existingByLabel = new Map<MealEntry['label'], MealEntry>()

  for (const meal of normalisedMeals) {
    existingByLabel.set(meal.label, meal)
  }

  const defaultMeals = DEFAULT_MEAL_ORDER.map((label) => {
    return existingByLabel.get(label) ?? makeDefaultMeal(label)
  })

  const extraMeals = normalisedMeals.filter((meal) => !DEFAULT_MEAL_ORDER.includes(meal.label))

  return [...defaultMeals, ...extraMeals]
}

function makeFoodItem(name = '', calories = ''): FoodItem {
  return {
    id: makeId(),
    name,
    calories,
  }
}

function normaliseFoodItems(value: unknown): FoodItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const raw = item as Record<string, unknown>
      const name = typeof raw.name === 'string' ? raw.name : ''
      const calories =
        typeof raw.calories === 'string' || typeof raw.calories === 'number'
          ? normaliseOptionalText(String(raw.calories))
          : ''

      if (!name.trim() && !calories.trim()) return null

      return {
        id: typeof raw.id === 'string' ? raw.id : makeId(),
        name,
        calories,
      }
    })
    .filter((item): item is FoodItem => Boolean(item))
}

function getMealCalories(meal: MealEntry) {
  return meal.items.reduce((sum, item) => sum + (safeNumber(item.calories) ?? 0), 0)
}

function getDailyFoodCalories(log: Pick<DailyLog, 'meals'>) {
  return log.meals.reduce((sum, meal) => sum + getMealCalories(meal), 0)
}

function getPreviousComparableWorkout(logs: DailyLog[], draft: DailyLog) {
  const previousSameType = sortLogs(logs).find(
    (log) => log.date < draft.date && log.workoutType === draft.workoutType && hasWorkoutData(log),
  )

  return previousSameType ?? getLastWorkout(logs, draft.date)
}

function normaliseOptionalText(value: unknown) {
  if (value === null || value === undefined) return ''

  const text = String(value).trim()

  if (!text || text === '-' || text === '—' || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'na') {
    return ''
  }

  return text
}

function cloudText(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function compareExerciseToHistory(exercise: ExerciseEntry, history: ExerciseHistorySummary | undefined) {
  if (!history) {
    return 'New movement in the current dataset.'
  }

  const currentScore = getExerciseScore(exercise)

  if (currentScore === null) {
    return 'Logged, but missing enough load/reps data for comparison.'
  }

  if (history.bestScore !== null && currentScore > history.bestScore) {
    return 'New best performance before saving today.'
  }

  if (history.bestScore !== null && currentScore === history.bestScore) {
    return 'Matches previous best.'
  }

  if (history.lastScore !== null && currentScore > history.lastScore) {
    return 'Improved versus last logged session.'
  }

  if (history.lastScore !== null && currentScore < history.lastScore) {
    return 'Dropped versus last logged session.'
  }

  return 'Comparable but direction is unclear.'
}

function buildWorkoutCoachComparison(draft: DailyLog, logs: DailyLog[]) {
  const previousComparable = getPreviousComparableWorkout(logs, draft)
  const history = buildExerciseHistory(logs, draft.date)

  return {
    comparedWith: previousComparable
      ? {
          date: previousComparable.date,
          workoutType: previousComparable.workoutType,
          exerciseCount: previousComparable.exercises.length,
          treadmillDistanceKm: previousComparable.treadmillDistanceKm || null,
          treadmillMinutes: previousComparable.treadmillMinutes || null,
        }
      : null,
    exerciseComparison: draft.exercises.map((exercise) => {
      const canonical = canonicalExerciseName(exercise.name)
      const exerciseHistory = history.get(canonical)

      return {
        name: displayExerciseName(canonical),
        today: formatExerciseEntry(exercise),
        bestBeforeToday: exerciseHistory?.bestLabel ?? null,
        lastBeforeToday: exerciseHistory?.lastLabel ?? null,
        status: compareExerciseToHistory(exercise, exerciseHistory),
      }
    }),
  }
}

function parseCaloriesValue(value: string) {
  const match = value.match(/([-\d.]+)\s*(?:kcal|cal|calories)?/i)
  const parsed = match?.[1]?.trim()

  if (!parsed || parsed === '-') return ''

  return parsed
}

function isCaloriesHeading(line: string) {
  return /^calories\s*(burnt|burned)?\s*:\s*$/i.test(line.trim())
}

function isCaloriesLine(line: string) {
  return /kcal|calories|cal\b/i.test(line) && line.includes(':')
}

function parseCaloriesLine(line: string) {
  const [rawLabel, rawValue = ''] = line.split(/:(.*)/s)
  const label = rawLabel.trim().toLowerCase()
  const calories = parseCaloriesValue(rawValue)

  if (!calories) {
    return {
      kind: null as 'strength' | 'cardio' | 'basketball' | 'cycling' | null,
      calories: '',
    }
  }

  if (
    label.includes('traditional strength') ||
    label.includes('strength training') ||
    label.includes('weight training') ||
    label.includes('weights') ||
    label.includes('gym')
  ) {
    return { kind: 'strength' as const, calories }
  }

  if (label.includes('basketball')) {
    return { kind: 'basketball' as const, calories }
  }

  if (
    label.includes('cycling') ||
    label.includes('cycle') ||
    label.includes('bike') ||
    label.includes('biking')
  ) {
    return { kind: 'cycling' as const, calories }
  }

  if (
    label.includes('running') ||
    label.includes('treadmill') ||
    label.includes('cardio') ||
    label.includes('stairmaster') ||
    label.includes('stairs')
  ) {
    return { kind: 'cardio' as const, calories }
  }

  return {
    kind: null as 'strength' | 'cardio' | 'basketball' | 'cycling' | null,
    calories,
  }
}

function getTotalCaloriesBurned(
  log: Pick<DailyLog, 'strengthCalories' | 'cardioCalories' | 'basketballCalories' | 'cyclingCalories'>,
) {
  return (
    (safeNumber(log.strengthCalories) ?? 0) +
    (safeNumber(log.cardioCalories) ?? 0) +
    (safeNumber(log.basketballCalories) ?? 0) +
    (safeNumber(log.cyclingCalories) ?? 0)
  )
}

function makeParserWarning(
  level: ParserWarningLevel,
  message: string,
  line?: string,
  suggestion?: string,
): ParserWarning {
  return {
    id: makeId(),
    level,
    message,
    line,
    suggestion,
  }
}

function isKnownExerciseName(name: string) {
  const cleaned = cleanExerciseName(name)

  return EXERCISE_ALIASES.some((alias) =>
    alias.patterns.some((pattern) => pattern.test(cleaned)),
  )
}

function isSuspiciousSets(value: string) {
  if (!value.trim()) return true
  return !/^\d+(\.\d+)?$/.test(value.trim())
}

function isSuspiciousReps(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return true

  if (/^\d+(\.\d+)?\s*(reps?|seconds?|secs?|sec|s)?$/.test(trimmed)) {
    return false
  }

  return true
}

function buildExerciseParseWarnings(exercise: ExerciseEntry, originalLine: string) {
  const warnings: ParserWarning[] = []

  if (!isKnownExerciseName(exercise.name)) {
    warnings.push(
      makeParserWarning(
        'info',
        `New or unknown exercise detected: ${exercise.name}`,
        originalLine,
        'If this is a real recurring exercise, keep it. If not, correct the name before saving.',
      ),
    )
  }

  if (!exercise.sets || isSuspiciousSets(exercise.sets)) {
    warnings.push(
      makeParserWarning(
        'warning',
        `Sets look suspicious for ${exercise.name}.`,
        originalLine,
        'Expected something like 3.',
      ),
    )
  }

  if (!exercise.reps || isSuspiciousReps(exercise.reps)) {
    warnings.push(
      makeParserWarning(
        'warning',
        `Reps look suspicious for ${exercise.name}.`,
        originalLine,
        'Expected something like 12 or 30 seconds.',
      ),
    )
  }

  if (
    /machine|curl|press|pulldown|pushdown|extension|row/i.test(originalLine) &&
    !exercise.weight
  ) {
    warnings.push(
      makeParserWarning(
        'warning',
        `Weight is missing for ${exercise.name}.`,
        originalLine,
        'If this was a machine/cable movement, add the load before saving.',
      ),
    )
  }

  return warnings
}

function classifyTrainingKind(exercises: ExerciseEntry[], hasCardio: boolean): TrainingKind {
  let hasUpper = false
  let hasLower = false

  for (const exercise of exercises) {
    const canonical = canonicalExerciseName(exercise.name)

    if (UPPER_EXERCISE_CANONICALS.has(canonical)) hasUpper = true
    if (LOWER_EXERCISE_CANONICALS.has(canonical)) hasLower = true
  }

  if (hasUpper && hasLower) return 'mix'
  if (hasUpper) return 'upper'
  if (hasLower) return 'lower'
  if (hasCardio && !exercises.length) return 'cardio'

  return 'none'
}

function trainingKindToWorkoutType(kind: TrainingKind): WorkoutType {
  if (kind === 'upper') return 'Upper'
  if (kind === 'lower') return 'Lower'
  if (kind === 'mix') return 'Mix'
  if (kind === 'cardio') return 'Cardio'

  return 'Rest'
}

function getDefaultWorkoutTypeForDate(date: string): WorkoutType {
  const day = new Date(`${date}T00:00:00`).getDay()

  if (day === 1 || day === 3 || day === 5) return 'Upper'
  if (day === 2 || day === 4) return 'Lower'

  return 'Rest'
}

function formatDateFull(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function buildTrendSeries(logs: DailyLog[], metric: TrendMetric, range: TrendRange) {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))

  const latestDate = sorted[sorted.length - 1]?.date ?? toInputDate(new Date())
  const latest = new Date(`${latestDate}T00:00:00`)
  const selectedRange = TREND_RANGES.find((item) => item.id === range)

  const startDate =
    selectedRange?.days === null || selectedRange?.days === undefined
      ? null
      : (() => {
          const start = new Date(latest)
          start.setDate(latest.getDate() - selectedRange.days + 1)
          return toInputDate(start)
        })()

  return sorted
    .filter((log) => !startDate || log.date >= startDate)
    .map((log) => {
      let value: number | null = null

      if (metric === 'weight') value = safeNumber(log.weightKg)
      if (metric === 'waist') value = safeNumber(log.waistSizeCm)
      if (metric === 'cardio-distance') value = safeNumber(log.treadmillDistanceKm)
      if (metric === 'cardio-minutes') value = parseDurationToMinutes(log.treadmillMinutes)
      if (metric === 'calories-total') value = getTotalCaloriesBurned(log) || null
      if (metric === 'calories-strength') value = safeNumber(log.strengthCalories)
      if (metric === 'calories-cardio') value = safeNumber(log.cardioCalories)
      if (metric === 'calories-basketball') value = safeNumber(log.basketballCalories)
      if (metric === 'calories-cycling') value = safeNumber(log.cyclingCalories)
      if (metric === 'food-calories') value = getDailyFoodCalories(log) || null

      return { date: log.date, value }
    })
    .filter((entry): entry is { date: string; value: number } => entry.value !== null)
}

function getTrendSummary(series: Array<{ date: string; value: number }>) {
  if (!series.length) {
    return {
      latest: null,
      average: null,
      delta: null,
      label: 'No data in selected range',
    }
  }

  if (series.length < 2) {
    return {
      latest: series[0].value,
      average: series[0].value,
      delta: null,
      label: `Only one point: ${formatDateFull(series[0].date)}`,
    }
  }

  const first = series[0]
  const latest = series[series.length - 1]
  const delta = latest.value - first.value
  const avg = average(series.map((entry) => entry.value))

  return {
    latest: latest.value,
    average: avg,
    delta,
    label: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} from ${formatDateFull(first.date)} to ${formatDateFull(latest.date)}`,
  }
}

function TrendLineChart({
  series,
  suffix,
}: {
  series: Array<{ date: string; value: number }>
  suffix: string
}) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)

  if (series.length < 2) {
    return <div className="empty-state">Need at least 2 logged values for this chart.</div>
  }

  const width = 720
  const height = 260
  const padding = 34
  const values = series.map((entry) => entry.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = series.map((entry, index) => {
    const x = padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2)
    const y = height - padding - ((entry.value - min) / range) * (height - padding * 2)

    return {
      ...entry,
      x,
      y,
      index,
    }
  })

  const path = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const activePoint = activePointIndex !== null ? points[activePointIndex] : points[points.length - 1]

  function setActiveFromPointer(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const pointerX = ((event.clientX - rect.left) / rect.width) * width

    const nearest = points.reduce((winner, point) => {
      return Math.abs(point.x - pointerX) < Math.abs(winner.x - pointerX) ? point : winner
    }, points[0])

    setActivePointIndex(nearest.index)
  }

  return (
    <div className="trend-chart-wrap">
      <div className="trend-chart-frame">
        <svg
          className="trend-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Trend chart"
          onPointerMove={setActiveFromPointer}
          onPointerDown={setActiveFromPointer}
          onPointerLeave={() => setActivePointIndex(null)}
        >
          <rect className="trend-chart-hitband" x="0" y="0" width={width} height={height} />
          <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
          <line x1={padding} x2={padding} y1={padding} y2={height - padding} />

          {activePoint && (
            <line
              className="trend-chart-crosshair"
              x1={activePoint.x}
              x2={activePoint.x}
              y1={padding}
              y2={height - padding}
            />
          )}

          <polyline points={path} fill="none" />

          {points.map((point) => (
            <circle
              key={`${point.date}-${point.value}`}
              className={`trend-chart-point ${activePoint?.index === point.index ? 'active' : ''}`}
              cx={point.x}
              cy={point.y}
              r={activePoint?.index === point.index ? 7 : 5}
            />
          ))}
        </svg>

        {activePoint && (
          <div
            className="trend-chart-tooltip"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${(activePoint.y / height) * 100}%`,
            }}
          >
            <strong>
              {activePoint.value.toFixed(1)}
              {suffix}
            </strong>
            <span>{formatDateFull(activePoint.date)}</span>
          </div>
        )}
      </div>

      <div className="trend-chart-caption">
        <span>{formatDateFull(series[0].date)}</span>
        <strong>
          Latest point {series[series.length - 1].value.toFixed(1)}
          {suffix}
        </strong>
        <span>{formatDateFull(series[series.length - 1].date)}</span>
      </div>
    </div>
  )
}

function toInputDate(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10)
}

function createEmptyLog(date = toInputDate(new Date())): DailyLog {
  const now = new Date().toISOString()

  return {
    id: makeId(),
    date,
    weightKg: '',
    waistSizeCm: '',
    sleepHours: '',
    workoutType: getDefaultWorkoutTypeForDate(date),
    gymTime: '',
    preWorkout: '',
    postGymEnergy: '',
    treadmillDistanceKm: '',
    treadmillMinutes: '',
    treadmillIncline: '6.0',
    strengthCalories: '',
    cardioCalories: '',
    basketballCalories: '',
    cyclingCalories: '',
    notes: '',
    exercises: [],
    meals: DEFAULT_MEAL_ORDER.map((label) => makeMeal(label)),
    createdAt: now,
    updatedAt: now,
  }
}

function isUnavailableValue(value: unknown) {
  if (value === null || value === undefined) return true
  const trimmed = String(value).trim().toLowerCase()
  return (
    !trimmed ||
    trimmed === '-' ||
    trimmed === '—' ||
    trimmed === 'n/a' ||
    trimmed === 'na' ||
    trimmed === 'null' ||
    trimmed === 'undefined'
  )
}

function safeNumber(value: string | number | null | undefined) {
  if (isUnavailableValue(value)) return null

  const cleaned = String(value)
    .trim()
    .replace(/,/g, '')
    .replace(/\s*(kg|kgs|cm|lbs|lb)$/i, '')

  if (isUnavailableValue(cleaned)) return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function toNullableNumber(value: string | number | null | undefined) {
  const parsed = safeNumber(value)
  return parsed === null ? null : parsed
}

function toNullableInteger(value: string | number | null | undefined) {
  const parsed = safeNumber(value)
  if (parsed === null) return null
  return Math.round(parsed)
}

function toNullableEnergy(value: string | number | null | undefined) {
  const parsed = toNullableInteger(value)
  if (parsed === null) return null

  // Supabase stores this as an optional 0-10 score. Do not let blanks become 0.
  return Math.min(Math.max(parsed, 0), 10)
}

function emptyToNull(value: string | null | undefined) {
  if (isUnavailableValue(value)) return null
  return String(value).trim()
}

function isCardioLine(line: string) {
  const lower = line.toLowerCase()

  if (/^(treadmill|stairmaster|stairs|stair master|cycling|cycle|bike|biking)\s*:/i.test(line)) {
    return true
  }

  if (/^b\.\s*/i.test(line) && (lower.includes('km') || lower.includes('incline'))) {
    return true
  }

  return (
    (lower.includes('km') || lower.includes('min') || /\d{1,2}:\d{2}/.test(lower)) &&
    (lower.includes('incline') ||
      lower.includes('level') ||
      lower.includes('resistance') ||
      lower.includes('stair') ||
      lower.includes('cycle') ||
      lower.includes('bike') ||
      lower.includes('treadmill'))
  )
}

function isPureCardioHeading(line: string) {
  return /^(treadmill|stairmaster|stairs|stair master|cycling|cycle|bike|biking)\s*:\s*$/i.test(line.trim())
}

function parseDurationToMinutes(value: string | number | null | undefined) {
  if (isUnavailableValue(value)) return null

  const trimmed = String(value).trim()
  if (!trimmed || trimmed.startsWith('-')) return null

  if (trimmed.includes(':')) {
    const [minutesRaw, secondsRaw = '0'] = trimmed.split(':')
    const minutes = Number(minutesRaw)
    const seconds = Number(secondsRaw)
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return minutes + seconds / 60
    }
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function parseWorkoutWeightLine(line: string) {
  const match = line.match(/weight\s*:\s*([-\d.]+)\s*kgs?/i)
  if (!match) return ''

  const value = match[1]?.trim()
  if (!value || value === '-') return ''

  return value
}

function parseCardioLine(line: string) {
  const cleaned = line
    .replace(/^(treadmill|stairmaster|stairs|stair master|cycling|cycle|bike|biking)\s*:\s*/i, '')
    .replace(/^b\.\s*/i, '')
    .trim()

  const distanceMatch = cleaned.match(/([-\d.]+)\s*km/i)
  const durationMatch =
    cleaned.match(/(?:^|[,| ])\s*([0-9]{1,2}:[0-9]{2})\s*(?:[,| ]|$)/i) ??
    cleaned.match(/([-\d.]+)\s*(?:min|mins|minutes)\b/i)
  const inclineMatch = cleaned.match(/incline\s*=?\s*([-\d.]+)/i)
  const levelMatch = cleaned.match(/(?:level|lvl|resistance)\s*=?\s*([-\d.]+)/i)

  const distance = distanceMatch?.[1]?.trim()
  const duration = durationMatch?.[1]?.trim()
  const incline = inclineMatch?.[1]?.trim()
  const level = levelMatch?.[1]?.trim()

  return {
    treadmillDistanceKm: distance && distance !== '-' ? distance : '',
    treadmillMinutes: duration && duration !== '-' && duration !== '-:00' ? duration : '',
    treadmillIncline: incline && incline !== '-' ? incline : level && level !== '-' ? `level ${level}` : '',
  }
}

function parseExerciseLine(line: string): ExerciseEntry | null {
  if (!line.includes(':')) return null
  if (/^weight\s*:/i.test(line)) return null
  if (/^treadmill\s*:/i.test(line)) return null

  const [rawName, rawDetails = ''] = line.split(/:(.*)/s)
  const name = rawName.trim()

  if (!name) return null

  const parts = rawDetails.split(',').map((part) => part.trim())

  const weightPart = parts[0] ?? ''
  const setsPart = parts[1] ?? ''
  const repsPart = parts.slice(2).join(', ') || ''

  const weightMatch = weightPart.match(/([-\d.]+)?\s*(lbs|lb|kg)?/i)
  const rawWeight = weightMatch?.[1]?.trim() ?? ''
  const rawUnit = weightMatch?.[2]?.toLowerCase()

  const weight = rawWeight && rawWeight !== '-' ? rawWeight : ''
  const unit: ExerciseEntry['unit'] =
    rawUnit === 'kg'
      ? 'kg'
      : rawUnit === 'lbs' || rawUnit === 'lb'
        ? 'lbs'
        : weight
          ? 'lbs'
          : 'bodyweight'

  const sets = setsPart && setsPart !== '-' ? setsPart : ''
  const reps = repsPart && repsPart !== '-' ? repsPart : ''

  const canonical = canonicalExerciseName(name)
  const displayName = displayExerciseName(canonical || name)

  return {
    id: makeId(),
    name: displayName,
    weight,
    unit,
    sets,
    reps,
    completedSets: 0,
  }
}

function inferWorkoutTypeFromExercises(exercises: ExerciseEntry[], hasCardio: boolean): WorkoutType {
  return trainingKindToWorkoutType(classifyTrainingKind(exercises, hasCardio))
}

function parseRawWorkoutText(raw: string): ParsedWorkoutText {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let weightKg = ''
  let treadmillDistanceKm = ''
  let treadmillMinutes = ''
  let treadmillIncline = ''
  let strengthCalories = ''
  let cardioCalories = ''
  let basketballCalories = ''
  let cyclingCalories = ''
  const exercises: ExerciseEntry[] = []
  const warnings: ParserWarning[] = []

  for (const line of lines) {
    if (/^weight\s*:/i.test(line)) {
      weightKg = parseWorkoutWeightLine(line)

      if (!weightKg) {
        warnings.push(
          makeParserWarning(
            'info',
            'Weight was left blank or unavailable.',
            line,
            'This is fine occasionally, but weight trends need repeated weigh-ins.',
          ),
        )
      }

      continue
    }

    if (isCaloriesHeading(line)) {
      continue
    }

    if (isCaloriesLine(line)) {
      const parsedCalories = parseCaloriesLine(line)

      if (parsedCalories.kind === 'strength') {
        strengthCalories = parsedCalories.calories
        continue
      }

      if (parsedCalories.kind === 'cardio') {
        cardioCalories = parsedCalories.calories
        continue
      }

      if (parsedCalories.kind === 'basketball') {
        basketballCalories = parsedCalories.calories
        continue
      }

      if (parsedCalories.kind === 'cycling') {
        cyclingCalories = parsedCalories.calories
        continue
      }

      warnings.push(
        makeParserWarning(
          'info',
          'Calories line detected but activity type was not recognised.',
          line,
          'Use labels like Traditional Strength Training, Running, Treadmill, Stairmaster, Basketball, or Cycling.',
        ),
      )

      continue
    }

    if (isPureCardioHeading(line)) {
      continue
    }

    if (isCardioLine(line)) {
      const cardio = parseCardioLine(line)

      treadmillDistanceKm = cardio.treadmillDistanceKm
      treadmillMinutes = cardio.treadmillMinutes
      treadmillIncline = cardio.treadmillIncline

      if (treadmillDistanceKm && !treadmillMinutes) {
        warnings.push(
          makeParserWarning(
            'warning',
            'Cardio distance was found but duration is missing.',
            line,
            'Add duration if you want cardio pace/progression to be useful.',
          ),
        )
      }

      if (!treadmillDistanceKm && !treadmillMinutes) {
        warnings.push(
          makeParserWarning(
            'warning',
            'Cardio line was detected but distance/duration could not be parsed.',
            line,
            'Use something like Treadmill: 0.42km, 05:00, incline=6.0 or Stairmaster: 10:00, level=5.',
          ),
        )
      }

      continue
    }

    const exercise = parseExerciseLine(line)

    if (exercise) {
      exercises.push(exercise)
      warnings.push(...buildExerciseParseWarnings(exercise, line))
      continue
    }

    if (line.includes(':')) {
      warnings.push(
        makeParserWarning(
          'warning',
          'This line was not understood by the parser.',
          line,
          'Check the format before saving.',
        ),
      )
    }
  }

  const hasCardio = Boolean(treadmillDistanceKm || treadmillMinutes)
  const workoutType = inferWorkoutTypeFromExercises(exercises, hasCardio)

  return {
    weightKg,
    treadmillDistanceKm,
    treadmillMinutes,
    treadmillIncline,
    strengthCalories,
    cardioCalories,
    basketballCalories,
    cyclingCalories,
    workoutType,
    exercises,
    warnings,
  }
}

function buildNotesWithRawWorkout(existingNotes: string, rawWorkout: string) {
  const marker = 'Raw workout log:'
  const existingWithoutOldRaw = existingNotes.split(marker)[0]?.trim() ?? ''
  const rawBlock = `${marker}\n${rawWorkout.trim()}`

  return [existingWithoutOldRaw, rawBlock].filter(Boolean).join('\n\n')
}

function buildFoodCaloriesDashboard(logs: DailyLog[]) {
  const totals = [...logs]
    .map((log) => ({
      date: log.date,
      total: getDailyFoodCalories(log),
      meals: ensureDefaultMeals(log.meals).map((meal) => ({
        label: meal.label,
        calories: getMealCalories(meal),
      })),
    }))
    .filter((item) => item.total > 0)

  const newestFirst = [...totals].sort((a, b) => b.date.localeCompare(a.date))

  const latest = newestFirst[0] ?? null

  const highest = totals.reduce<typeof totals[number] | null>((winner, item) => {
    if (!winner) return item
    return item.total > winner.total ? item : winner
  }, null)

  const recent = newestFirst.slice(0, 7)
  const recentAverage = recent.length ? Math.round(average(recent.map((item) => item.total)) ?? 0) : null

  return {
    loggedDays: totals.length,
    latest,
    highest,
    recentAverage,
  }
}

function loadLogs(): DailyLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => {
      try {
        return normaliseImportedLog(item)
      } catch {
        return null
      }
    }).filter((log): log is DailyLog => log !== null)
  } catch {
    return []
  }
}

function sortLogs(logs: DailyLog[]) {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date))
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatKg(value: number | null) {
  if (value === null) return '—'
  return `${value.toFixed(1)} kg`
}

function getWeightValues(logs: DailyLog[]) {
  return sortLogs(logs)
    .map((log) => ({ date: log.date, value: safeNumber(log.weightKg) }))
    .filter((entry): entry is { date: string; value: number } => entry.value !== null)
}

function normaliseWorkoutType(value: string | null): WorkoutType {
  const allowed: WorkoutType[] = ['Upper', 'Lower', 'Mix', 'Cardio', 'Recovery', 'Rest', 'Custom']
  return allowed.includes(value as WorkoutType) ? (value as WorkoutType) : 'Custom'
}

function normaliseExerciseUnit(value: string | null): ExerciseEntry['unit'] {
  if (value === 'kg' || value === 'bodyweight') return value
  return 'lbs'
}

function normaliseMealTags(value: unknown): MealTag[] {
  if (!Array.isArray(value)) return []

  return value
    .map((tag) => String(tag).trim())
    .filter((tag): tag is MealTag => MEAL_TAG_IDS.has(tag as MealTag))
}

function normaliseMealLabel(value: string): MealEntry['label'] {
  const allowed: MealEntry['label'][] = ['Pre-workout', 'Breakfast', 'Lunch', 'Snack', 'Dinner', 'Other']
  return allowed.includes(value as MealEntry['label']) ? (value as MealEntry['label']) : 'Other'
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const maybeError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter((part) => typeof part === 'string' && part.length > 0)
      .join(' · ') || JSON.stringify(error)
  }
  return String(error)
}

function isMissingWaistColumnError(error: unknown) {
  return getErrorMessage(error).toLowerCase().includes('waist_size_cm')
}

function isMissingMealTagsColumnError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()

  return (
    message.includes('meal_entries') &&
    (message.includes('tags') ||
      message.includes('column "tags"') ||
      message.includes("could not find the 'tags' column"))
  )
}

function buildMealInsertRows(log: DailyLog, cloudLogId: string, includeTags: boolean) {
  return log.meals.map((meal, index) => {
    const row: Record<string, unknown> = {
      id: isUuid(meal.id) ? meal.id : makeId(),
      daily_log_id: cloudLogId,
      label: meal.label,
      description: emptyToNull(meal.description),
      protein_score: meal.proteinScore,
      food_items: meal.items ?? [],
      position: index,
    }

    if (includeTags) {
      row.tags = meal.tags ?? []
    }

    return row
  })
}

function buildDailyLogPayload(log: DailyLog, userId: string, includeWaistSize: boolean) {
  const payload: Record<string, unknown> = {
    user_id: userId,
    log_date: log.date,
    weight_kg: toNullableNumber(log.weightKg),
    sleep_hours: toNullableNumber(log.sleepHours),
    workout_type: log.workoutType,
    gym_time: emptyToNull(log.gymTime),
    pre_workout: emptyToNull(log.preWorkout),
    post_gym_energy: toNullableEnergy(log.postGymEnergy),
    treadmill_distance_km: toNullableNumber(log.treadmillDistanceKm),
    treadmill_minutes: parseDurationToMinutes(log.treadmillMinutes),
    treadmill_incline: toNullableNumber(log.treadmillIncline),
    strength_calories: emptyToNull(log.strengthCalories),
    cardio_calories: emptyToNull(log.cardioCalories),
    basketball_calories: emptyToNull(log.basketballCalories),
    cycling_calories: emptyToNull(log.cyclingCalories),
    notes: emptyToNull(log.notes),
    updated_at: new Date().toISOString(),
  }

  if (includeWaistSize) {
    payload.waist_size_cm = toNullableNumber(log.waistSizeCm)
  }

  return payload
}

function mapCloudRowsToLogs(rows: DailyLogRow[], exerciseRows: ExerciseRow[], mealRows: MealRow[]) {
  return rows.map((row) => {
    const exercises = exerciseRows
      .filter((exercise) => exercise.daily_log_id === row.id)
      .sort((a, b) => a.position - b.position)
      .map((exercise) => ({
        id: exercise.id,
        name: exercise.exercise_name ?? '',
        weight: exercise.weight ?? '',
        unit: normaliseExerciseUnit(exercise.unit),
        sets: exercise.sets ?? '',
        reps: exercise.reps ?? '',
        completedSets: exercise.completed_sets ?? 0,
      }))

    const meals = mealRows
      .filter((meal) => meal.daily_log_id === row.id)
      .sort((a, b) => a.position - b.position)
      .map((meal) => ({
        id: meal.id,
        label: normaliseMealLabel(meal.label),
        description: meal.description ?? '',
        proteinScore: Math.min(Math.max(meal.protein_score ?? 1, 0), 3) as MealEntry['proteinScore'],
        tags: normaliseMealTags(meal.tags),
        items: normaliseFoodItems(meal.food_items),
      }))

    return {
      id: row.id,
      date: row.log_date,
      weightKg: cloudText(row.weight_kg),
      waistSizeCm: cloudText(row.waist_size_cm),
      sleepHours: cloudText(row.sleep_hours),
      workoutType: normaliseWorkoutType(row.workout_type),
      gymTime: cloudText(row.gym_time),
      preWorkout: cloudText(row.pre_workout),
      postGymEnergy: cloudText(row.post_gym_energy),
      treadmillDistanceKm: cloudText(row.treadmill_distance_km),
      treadmillMinutes: cloudText(row.treadmill_minutes),
      treadmillIncline: cloudText(row.treadmill_incline),
      strengthCalories: cloudText(row.strength_calories),
      cardioCalories: cloudText(row.cardio_calories),
      basketballCalories: cloudText(row.basketball_calories),
      cyclingCalories: cloudText(row.cycling_calories),
      notes: cloudText(row.notes),
      exercises,
      meals: ensureDefaultMeals(meals),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

async function fetchRelatedRows<T>(
  client: NonNullable<typeof supabase>,
  tableName: 'exercise_entries' | 'meal_entries',
  dailyLogIds: string[],
) {
  if (!dailyLogIds.length) return [] as T[]

  const allRows: T[] = []

  // Keep this conservative. 50 daily logs × 5 meals or ~10 exercises stays safely under common limits.
  const idChunks = chunkArray(dailyLogIds, 50)

  for (const ids of idChunks) {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .in('daily_log_id', ids)
      .order('daily_log_id', { ascending: true })
      .order('position', { ascending: true })

    if (error) throw error

    allRows.push(...((data ?? []) as T[]))
  }

  return allRows
}

async function fetchCloudLogs(userId: string) {
  const client = supabase
  if (!client) return []

  const { data: dailyRows, error: dailyError } = await client
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })

  if (dailyError) throw dailyError

  const rows = (dailyRows ?? []) as DailyLogRow[]
  const ids = rows.map((row) => row.id)

  if (!ids.length) return []

  const [exerciseRows, mealRows] = await Promise.all([
    fetchRelatedRows<ExerciseRow>(client, 'exercise_entries', ids),
    fetchRelatedRows<MealRow>(client, 'meal_entries', ids),
  ])

  console.log('Cloud fetch counts', {
    dailyLogs: rows.length,
    exerciseRows: exerciseRows.length,
    mealRows: mealRows.length,
    mealsForApr29: mealRows.filter((meal) => {
      const dailyLog = rows.find((row) => row.id === meal.daily_log_id)
      return dailyLog?.log_date === '2026-04-29'
    }),
  })

  return sortLogs(mapCloudRowsToLogs(rows, exerciseRows, mealRows))
}

async function saveLogToCloud(log: DailyLog, userId: string) {
  const client = supabase

  if (!client) {
    throw new Error('Supabase is not configured.')
  }

  const db = client

  async function saveDailyLog(includeWaistSize: boolean) {
    const payload = buildDailyLogPayload(log, userId, includeWaistSize)

    const { data: existingRows, error: lookupError } = await db
      .from('daily_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('log_date', log.date)
      .limit(1)

    if (lookupError) throw lookupError

    if (existingRows && existingRows.length > 0) {
      const existingId = (existingRows[0] as { id: string }).id

      const { data, error } = await db
        .from('daily_logs')
        .update(payload)
        .eq('id', existingId)
        .select('*')
        .single()

      if (error) throw error
      return data as DailyLogRow
    }

    const insertPayload = {
      ...payload,
      ...(isUuid(log.id) ? { id: log.id } : {}),
    }

    const { data, error } = await db
      .from('daily_logs')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) throw error
    return data as DailyLogRow
  }

  let savedRow: DailyLogRow

  try {
    savedRow = await saveDailyLog(true)
  } catch (error) {
    if (!isMissingWaistColumnError(error)) throw error

    savedRow = await saveDailyLog(false)
  }

  const cloudLogId = savedRow.id

  const [{ error: exerciseDeleteError }, { error: mealDeleteError }] = await Promise.all([
    db.from('exercise_entries').delete().eq('daily_log_id', cloudLogId),
    db.from('meal_entries').delete().eq('daily_log_id', cloudLogId),
  ])

  if (exerciseDeleteError) throw exerciseDeleteError
  if (mealDeleteError) throw mealDeleteError

  if (log.exercises.length) {
    const { error } = await db.from('exercise_entries').insert(
      log.exercises.map((exercise, index) => ({
        id: isUuid(exercise.id) ? exercise.id : makeId(),
        daily_log_id: cloudLogId,
        exercise_name: exercise.name || 'Unnamed exercise',
        weight: emptyToNull(exercise.weight),
        unit: exercise.unit,
        sets: emptyToNull(exercise.sets),
        reps: emptyToNull(exercise.reps),
        completed_sets: exercise.completedSets,
        position: index,
      })),
    )

    if (error) throw error
  }

  if (log.meals.length) {
    const { error } = await db.from('meal_entries').insert(buildMealInsertRows(log, cloudLogId, true))

    if (error) {
      if (!isMissingMealTagsColumnError(error)) throw error

      const { error: retryError } = await db
        .from('meal_entries')
        .insert(buildMealInsertRows(log, cloudLogId, false))

      if (retryError) throw retryError
    }
  }

  return {
    ...log,
    id: cloudLogId,
    createdAt: savedRow.created_at,
    updatedAt: savedRow.updated_at,
  }
}

function normaliseImportedLog(raw: unknown): DailyLog {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const date = typeof source.date === 'string' && source.date ? source.date : toInputDate(new Date())
  const base = createEmptyLog(date)

  const exercises = Array.isArray(source.exercises)
    ? source.exercises
        .map((item) => {
          if (!item || typeof item !== 'object') return null

          const entry = item as Record<string, unknown>

          return {
            id: typeof entry.id === 'string' ? entry.id : makeId(),
            name: typeof entry.name === 'string' ? entry.name : '',
            weight: normaliseOptionalText(entry.weight),
            unit: normaliseExerciseUnit(typeof entry.unit === 'string' ? entry.unit : null),
            sets: normaliseOptionalText(entry.sets),
            reps: normaliseOptionalText(entry.reps),
            completedSets: typeof entry.completedSets === 'number' ? entry.completedSets : 0,
          }
        })
        .filter((item): item is ExerciseEntry => Boolean(item))
    : base.exercises

  const meals = Array.isArray(source.meals)
    ? source.meals
        .map((item) => {
          if (!item || typeof item !== 'object') return null

          const entry = item as Record<string, unknown>

          return {
            id: typeof entry.id === 'string' ? entry.id : makeId(),
            label: normaliseMealLabel(typeof entry.label === 'string' ? entry.label : 'Other'),
            description: typeof entry.description === 'string' ? entry.description : '',
            proteinScore:
              typeof entry.proteinScore === 'number'
                ? (Math.min(Math.max(entry.proteinScore, 0), 3) as MealEntry['proteinScore'])
                : 1,
            tags: normaliseMealTags(entry.tags),
            items: normaliseFoodItems(entry.items),
          }
        })
        .filter((item): item is MealEntry => Boolean(item))
    : base.meals

  return {
    ...base,
    id: typeof source.id === 'string' ? source.id : base.id,
    date,
    weightKg: normaliseOptionalText(source.weightKg),
    waistSizeCm: normaliseOptionalText(source.waistSizeCm),
    sleepHours: normaliseOptionalText(source.sleepHours),
    workoutType: normaliseWorkoutType(typeof source.workoutType === 'string' ? source.workoutType : null),
    gymTime: normaliseOptionalText(source.gymTime),
    preWorkout: normaliseOptionalText(source.preWorkout),
    postGymEnergy: normaliseOptionalText(source.postGymEnergy),
    treadmillDistanceKm: normaliseOptionalText(source.treadmillDistanceKm),
    treadmillMinutes: normaliseOptionalText(source.treadmillMinutes),
    treadmillIncline: normaliseOptionalText(source.treadmillIncline) || base.treadmillIncline,
    strengthCalories: normaliseOptionalText(source.strengthCalories),
    cardioCalories: normaliseOptionalText(source.cardioCalories),
    basketballCalories: normaliseOptionalText(source.basketballCalories),
    cyclingCalories: normaliseOptionalText(source.cyclingCalories),
    notes: typeof source.notes === 'string' ? source.notes : '',
    exercises,
    meals: ensureDefaultMeals(meals.length ? meals : base.meals),
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : base.createdAt,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
  }
}

function BottomDock({
  activeTab,
  setActiveTab,
}: {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
}) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <nav className="gymos-bottom-dock" aria-label="Mobile navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={activeTab === tab.id ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab(tab.id)}
        >
          <span>{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>,
    document.body,
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [logs, setLogs] = useState<DailyLog[]>(loadLogs)
  const [activeDate, setActiveDate] = useState(toInputDate(new Date()))
  const [draft, setDraft] = useState<DailyLog>(() => createEmptyLog())
  const [coachQuestion, setCoachQuestion] = useState('What do you reckon about today’s workout and what should I focus on next?')
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [session, setSession] = useState<Session | null>(null)
  const [syncState, setSyncState] = useState<SyncState>(isSupabaseConfigured ? 'checking' : 'local')
  const [syncError, setSyncError] = useState('')
  const [forceLocalMode, setForceLocalMode] = useState(false)

  const user = session?.user ?? null
  const cloudMode = Boolean(isSupabaseConfigured && user && !forceLocalMode)

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo(0, 0)

      const workspace = document.querySelector('.workspace')
      if (workspace instanceof HTMLElement) {
        workspace.scrollTop = 0
      }

      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    })
  }, [activeTab])

  useEffect(() => {
    const client = supabase

    if (!client) {
      setSyncState('local')
      return
    }

    let mounted = true

    client.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setSyncState(data.session ? 'checking' : 'local')
    })

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setSyncState(nextSession ? 'checking' : 'local')
      setForceLocalMode(false)
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const activeUser = user

    if (!supabase || !activeUser || forceLocalMode) return

    const activeUserId = activeUser.id
    let cancelled = false

    async function loadCloud() {
      try {
        setSyncState('syncing')
        setSyncError('')
        const cloudLogs = await fetchCloudLogs(activeUserId)
        if (cancelled) return
        setLogs(cloudLogs)
        setSyncState('synced')
      } catch (error) {
        if (cancelled) return
        setSyncState('error')
        setSyncError(getErrorMessage(error))
      }
    }

    loadCloud()

    return () => {
      cancelled = true
    }
  }, [user, forceLocalMode])

  useEffect(() => {
    const existing = logs.find((log) => log.date === activeDate)
    setDraft(existing ? structuredClone(existing) : createEmptyLog(activeDate))
  }, [activeDate, logs])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
  }, [logs])

  const stats = useMemo(() => buildStats(logs), [logs])
  const coachPrompt = useMemo(
    () => buildCoachPrompt(draft, logs, coachQuestion),
    [draft, logs, coachQuestion],
  )
  const coachInsight = useMemo(() => buildCoachInsight(draft, stats), [draft, stats])

  function updateDraft<K extends keyof DailyLog>(key: K, value: DailyLog[K]) {
    setDraft((current) => ({ ...current, [key]: value, updatedAt: new Date().toISOString() }))
  }

  async function saveDraft() {
    const savedDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      createdAt: draft.createdAt || new Date().toISOString(),
    }

    try {
      setSaveState('idle')
      setSyncError('')

      const activeUser = cloudMode ? user : null
      const finalDraft = activeUser ? await saveLogToCloud(savedDraft, activeUser.id) : savedDraft

      setLogs((current) => sortLogs([finalDraft, ...current.filter((log) => log.date !== finalDraft.date)]))
      setSyncState(cloudMode ? 'synced' : 'local')
      setSaveState('saved')
      window.setTimeout(() => setSaveState('idle'), 1600)
    } catch (error) {
      setSyncState('error')
      setSyncError(getErrorMessage(error))
    }
  }

  async function syncLocalToCloud() {
    const activeUser = user

    if (!activeUser || !supabase) return

    try {
      setSyncState('syncing')
      setSyncError('')
      const synced: DailyLog[] = []

      for (const log of sortLogs(logs).reverse()) {
        synced.push(await saveLogToCloud(log, activeUser.id))
      }

      setLogs(sortLogs(synced))
      setSyncState('synced')
    } catch (error) {
      setSyncState('error')
      setSyncError(getErrorMessage(error))
    }
  }

  async function importLogsFromJson(raw: string) {
    let parsed: unknown

    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Import failed: this is not valid JSON.')
    }

    const items = Array.isArray(parsed) ? parsed : [parsed]
    if (!items.length) throw new Error('Import failed: the JSON array is empty.')

    const normalised = items.map(normaliseImportedLog)
    const activeUser = cloudMode ? user : null

    if (activeUser) {
      setSyncState('syncing')
      const synced: DailyLog[] = []

      for (const log of normalised) {
        try {
          synced.push(await saveLogToCloud(log, activeUser.id))
        } catch (error) {
          throw new Error(`Import failed on ${log.date}: ${getErrorMessage(error)}`)
        }
      }

      setLogs((current) =>
        sortLogs([
          ...synced,
          ...current.filter((existing) => !synced.some((log) => log.date === existing.date)),
        ]),
      )
      setSyncState('synced')
    } else {
      setLogs((current) =>
        sortLogs([
          ...normalised,
          ...current.filter((existing) => !normalised.some((log) => log.date === existing.date)),
        ]),
      )
      setSyncState('local')
    }

    return normalised.length
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setForceLocalMode(false)
    setSyncState('local')
  }

  function updateExercise(id: string, patch: Partial<ExerciseEntry>) {
    updateDraft(
      'exercises',
      draft.exercises.map((exercise) => (exercise.id === id ? { ...exercise, ...patch } : exercise)),
    )
  }

  function updateMeal(id: string, patch: Partial<MealEntry>) {
    setDraft((current) => {
      const currentMeals = ensureDefaultMeals(current.meals)

      const nextMeals = currentMeals.map((meal) => {
        if (meal.id === id) {
          return { ...meal, ...patch }
        }

        return meal
      })

      return {
        ...current,
        meals: nextMeals,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  function removeExercise(id: string) {
    updateDraft(
      'exercises',
      draft.exercises.filter((exercise) => exercise.id !== id),
    )
  }

  function addMeal() {
    updateDraft('meals', [...draft.meals, makeMeal('Other')])
  }

  function openExistingCoachChat() {
    if (!EXISTING_CHATGPT_COACH_URL) {
      window.alert('Existing ChatGPT coach URL is not configured.')
      return
    }

    window.open(EXISTING_CHATGPT_COACH_URL, '_blank', 'noopener,noreferrer')
  }

  async function copyCoachPrompt() {
    await navigator.clipboard.writeText(coachPrompt)
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1600)
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gymos-export-${toInputDate(new Date())}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (isSupabaseConfigured && !session && !forceLocalMode) {
    return <AuthGate localLogCount={logs.length} onContinueLocal={() => setForceLocalMode(true)} />
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="GymOS navigation">
        <div className="brand-lockup">
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Personal training system</p>
            <h1>GymOS</h1>
          </div>
        </div>

        <nav className="nav-stack">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <StorageCard
          cloudMode={cloudMode}
          configured={isSupabaseConfigured}
          forceLocalMode={forceLocalMode}
          logs={logs}
          syncError={syncError}
          syncLocalToCloud={syncLocalToCloud}
          syncState={syncState}
          user={user}
          signOut={signOut}
        />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{new Date(`${draft.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
            <h2>{draft.workoutType} day</h2>
          </div>
          <div className="topbar-actions">
            <input
              aria-label="Active log date"
              className="date-input"
              type="date"
              value={activeDate}
              onChange={(event) => setActiveDate(event.target.value)}
            />
            <button className="ghost-button" type="button" onClick={exportData} disabled={!logs.length}>
              Export
            </button>
            <button className="primary-button" type="button" onClick={saveDraft} disabled={syncState === 'syncing'}>
              {saveState === 'saved' ? 'Saved' : syncState === 'syncing' ? 'Syncing…' : 'Save log'}
            </button>
          </div>
        </header>
        {activeTab === 'today' && (
          <TodayView draft={draft} logs={logs} stats={stats} updateDraft={updateDraft} setActiveTab={setActiveTab} />
        )}

        {activeTab === 'workout' && (
          <WorkoutView
            draft={draft}
            logs={logs}
            updateDraft={updateDraft}
            updateExercise={updateExercise}
            removeExercise={removeExercise}
          />
        )}

        {activeTab === 'nutrition' && (
          <NutritionView
            draft={draft}
            updateMeal={updateMeal}
            addMeal={addMeal}
          />
        )}

        {activeTab === 'trends' && (
          <TrendsView
            logs={logs}
            stats={stats}
            importLogsFromJson={importLogsFromJson}
            setActiveDate={setActiveDate}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'coach' && (
          <CoachView
            coachInsight={coachInsight}
            coachPrompt={coachPrompt}
            coachQuestion={coachQuestion}
            copyCoachPrompt={copyCoachPrompt}
            copyState={copyState}
            setCoachQuestion={setCoachQuestion}
            openExistingCoachChat={openExistingCoachChat}
          />
        )}
      </section>

      <BottomDock activeTab={activeTab} setActiveTab={setActiveTab} />
    </main>
  )
}

function AuthGate({
  localLogCount,
  onContinueLocal,
}: {
  localLogCount: number
  onContinueLocal: () => void
}) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    try {
      setIsWorking(true)
      setMessage('')

      const result =
        mode === 'sign-in'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password })

      if (result.error) throw result.error

      if (mode === 'sign-up' && !result.data.session) {
        setMessage('Account created. Check your email if Supabase asks you to confirm the login.')
      } else {
        setMessage('Signed in. Loading GymOS…')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setIsWorking(false)
    }
  }

  async function signInWithGoogle() {
    if (!supabaseUrl || !supabaseAnonKey) {
      setMessage('Supabase URL or anon key is missing at runtime.')
      return
    }

    try {
      setIsWorking(true)
      setMessage('Redirecting to Google…')

      const authUrl = new URL(`${supabaseUrl}/auth/v1/authorize`)
      authUrl.searchParams.set('provider', 'google')
      authUrl.searchParams.set('redirect_to', window.location.origin)
      authUrl.searchParams.set('apikey', supabaseAnonKey)

      window.location.href = authUrl.toString()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed.')
      setIsWorking(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Private training system</p>
            <h1>GymOS</h1>
          </div>
        </div>

        <div>
          <h2>{mode === 'sign-in' ? 'Sign in to sync your logs' : 'Create your GymOS account'}</h2>
          <p>
            This unlocks the actual point of the app: the same weight, workout, food and fatigue logs on your
            iPhone and PC.
          </p>
        </div>

        <div className="auth-form">
          <button className="google-button" type="button" onClick={signInWithGoogle} disabled={isWorking}>
            <span className="google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>

          <div className="auth-divider">
            <span />
            <strong>or use email</strong>
            <span />
          </div>
        </div>

        <form className="auth-form" onSubmit={submitAuth}>
          <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              placeholder="Minimum 6 characters"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {message && <p className="auth-message">{message}</p>}

          <button className="primary-button" type="submit" disabled={isWorking}>
            {isWorking ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setMessage('')
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
            }}
          >
            {mode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}
          </button>
          <button className="ghost-button" type="button" onClick={onContinueLocal}>
            Continue local only ({localLogCount} saved)
          </button>
        </div>
      </section>
    </main>
  )
}

function StorageCard({
  cloudMode,
  configured,
  forceLocalMode,
  logs,
  syncError,
  syncLocalToCloud,
  syncState,
  user,
  signOut,
}: {
  cloudMode: boolean
  configured: boolean
  forceLocalMode: boolean
  logs: DailyLog[]
  syncError: string
  syncLocalToCloud: () => Promise<void>
  syncState: SyncState
  user: User | null
  signOut: () => Promise<void>
}) {
  return (
    <div className="sync-card">
      <p className="eyebrow">Storage mode</p>
      <div className="sync-title">
        <span className={`sync-dot ${cloudMode ? 'cloud' : syncState === 'error' ? 'error' : ''}`} />
        <strong>{cloudMode ? 'Cloud sync active' : configured && forceLocalMode ? 'Local override' : 'Local-first'}</strong>
      </div>
      <span>
        {cloudMode
          ? `Signed in${user?.email ? ` as ${user.email}` : ''}. Logs save to Supabase and this browser.`
          : configured
            ? 'Supabase is configured, but this session is local-only.'
            : 'Supabase is not configured yet. Data is saved only in this browser.'}
      </span>

      {syncError && <p className="sync-error">{syncError}</p>}

      <div className="storage-actions">
        {user && !cloudMode && (
          <button className="ghost-button" type="button" onClick={syncLocalToCloud} disabled={!logs.length || syncState === 'syncing'}>
            Push local logs
          </button>
        )}
        {cloudMode && (
          <button className="ghost-button" type="button" onClick={syncLocalToCloud} disabled={!logs.length || syncState === 'syncing'}>
            Re-sync
          </button>
        )}
        {user && (
          <button className="danger-button" type="button" onClick={signOut}>
            Sign out
          </button>
        )}
      </div>
    </div>
  )
}

function TodayView({
  draft,
  logs,
  stats,
  updateDraft,
  setActiveTab,
}: {
  draft: DailyLog
  logs: DailyLog[]
  stats: ReturnType<typeof buildStats>
  updateDraft: <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => void
  setActiveTab: (tab: Tab) => void
}) {
  const lastWorkout = useMemo(() => getLastWorkout(logs, draft.date), [logs, draft.date])
  const nextWorkout = useMemo(() => getNextWorkoutRecommendation(logs, draft), [logs, draft])
  const weekly = useMemo(() => buildWeeklyActivity(logs, draft.date), [logs, draft.date])
  const sparkline = useMemo(() => getWeightSparklinePoints(logs), [logs])
  const coverage = useMemo(() => buildDataCoverage(logs), [logs])
  const bodyStatus = draft.weightKg ? `${draft.weightKg} kg` : stats.latestWeightLabel
  const workoutSummary = draft.exercises.length ? `${draft.exercises.length} exercises · ${draft.treadmillDistanceKm || '—'} km treadmill` : 'No workout details saved yet'
  const totalCalories = getTotalCaloriesBurned(draft)
  const todayMeals = getDisplayMeals(draft)
  const foodCalories = getDailyFoodCalories({ meals: todayMeals })  
  const plannedWorkout =
    draft.workoutType === 'Custom' || draft.workoutType === 'Mix' || draft.workoutType === 'Cardio' || draft.workoutType === 'Recovery'
      ? getDefaultWorkoutTypeForDate(draft.date)
      : draft.workoutType

  return (
    <div className="today-layout">
      <section className="command-card">
        <div className="command-content">
          <p className="eyebrow">Today’s command centre</p>
          <h3>{nextWorkout.headline}</h3>
          <p>{nextWorkout.reason}</p>
          <div className="command-actions">
            <button className="primary-button" type="button" onClick={() => setActiveTab('workout')}>
              {draft.exercises.length ? 'Open workout' : 'Paste workout'}
            </button>
            <button className="ghost-button" type="button" onClick={() => setActiveTab('nutrition')}>
              Log food
            </button>
          </div>
        </div>
        <div className="readiness-ring" aria-label={`${stats.trainingDaysLast7} workouts in recent logs`}>
          <strong>{stats.trainingDaysLast7}</strong>
          <span>/7 recent</span>
        </div>
      </section>
      <MotivationCard date={draft.date} />
      <section className="panel quick-log-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Fast log</p>
            <h3>Body check</h3>
          </div>
          <span className="status-pill">All optional</span>
        </div>
        <div className="quick-inputs">
          <label>
            Weight
            <input
              inputMode="decimal"
              placeholder="92.0"
              value={draft.weightKg}
              onChange={(event) => updateDraft('weightKg', event.target.value)}
            />
          </label>

          <label>
            Waist cm
            <input
              inputMode="decimal"
              placeholder="optional"
              value={draft.waistSizeCm}
              onChange={(event) => updateDraft('waistSizeCm', event.target.value)}
            />
          </label>

          <label>
            Sleep
            <input
              inputMode="decimal"
              placeholder="7.0"
              value={draft.sleepHours}
              onChange={(event) => updateDraft('sleepHours', event.target.value)}
            />
          </label>

          <label>
            Today’s plan
            <select
              value={plannedWorkout}
              onChange={(event) => updateDraft('workoutType', event.target.value as WorkoutType)}
            >
              <option value="Upper">Upper</option>
              <option value="Lower">Lower</option>
              <option value="Rest">Rest</option>
            </select>
          </label>
        </div>
      </section>

      <section className="insight-grid span-2">
        <article className="metric-card hero-metric">
          <p>Body status</p>
          <strong>{bodyStatus}</strong>
          <span>{stats.weightDeltaText}</span>
          <MiniSparkline points={sparkline} />
        </article>

        <article className="metric-card">
          <p>Today’s workout</p>
          <strong>{plannedWorkout}</strong>
          <span>{workoutSummary}</span>
        </article>

        <article className="metric-card">
          <p>Calories burned</p>
          <strong>{totalCalories ? `${totalCalories}` : '—'}</strong>
          <span>
            Strength {draft.strengthCalories || '—'} · Cardio {draft.cardioCalories || '—'} · Basketball{' '}
            {draft.basketballCalories || '—'} · Cycling {draft.cyclingCalories || '—'}
          </span>
        </article>

        <article className="metric-card">
          <p>Cardio last 7</p>
          <strong>{stats.cardioMinutesLast7} min</strong>
          <span>{stats.cardioDistanceLast7Label} logged distance</span>
        </article>

        <article className="metric-card">
          <p>Food intake</p>
          <strong>{foodCalories ? `${foodCalories}` : '—'}</strong>
          <span>
            {getDisplayMeals(draft)
              .filter((meal) => ['Pre-workout', 'Breakfast', 'Lunch', 'Dinner'].includes(meal.label))
              .map((meal) => {
                const label = meal.label === 'Pre-workout' ? 'Pre' : meal.label
                const kcal = getMealCalories(meal) || '—'
                return `${label} ${kcal}`
              })
              .join(' · ')}
          </span>
        </article>

        <article className="metric-card">
          <p>Data quality</p>
          <strong>{coverage.weightLogged}/{coverage.total}</strong>
          <span>weight logs · waist {coverage.waistLogged}/{coverage.total}</span>
        </article>
      </section>

      <section className="panel span-2 weekly-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">This week</p>
            <h3>Consistency map</h3>
          </div>
          <span className="status-pill">{weekly.filter((day) => day.hasWorkout).length}/7 active</span>
        </div>
        <div className="weekly-dots">
          {weekly.map((day) => (
            <div className={`week-dot ${day.hasWorkout ? day.type.toLowerCase() : ''}`} key={day.date}>
              <span>{day.label}</span>
              <strong>{day.dayNumber}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-2 split-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Last session</p>
            <h3>{lastWorkout ? `${lastWorkout.workoutType} · ${formatDateShort(lastWorkout.date)}` : 'No previous workout yet'}</h3>
          </div>
          <button className="ghost-button" type="button" onClick={() => setActiveTab('trends')}>
            View trends
          </button>
        </div>
        <div className="last-workout-grid">
          <div>
            <span>Exercises</span>
            <strong>{lastWorkout?.exercises.length ?? 0}</strong>
          </div>
          <div>
            <span>Treadmill</span>
            <strong>{lastWorkout?.treadmillDistanceKm || '—'} km</strong>
          </div>
          <div>
            <span>Weight then</span>
            <strong>{lastWorkout?.weightKg ? `${lastWorkout.weightKg} kg` : '—'}</strong>
          </div>
        </div>
      </section>

      <section className="panel span-2 form-panel collapsible-form-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Detail log</p>
            <h3>Notes and timing</h3>
          </div>
          <button className="ghost-button" type="button" onClick={() => setActiveTab('coach')}>
            Ask coach
          </button>
        </div>
        <div className="form-grid">
          <label>
            Gym time
            <input
              placeholder="10:15-11:45"
              value={draft.gymTime}
              onChange={(event) => updateDraft('gymTime', event.target.value)}
            />
          </label>
          <label>
            Pre-workout food
            <input
              placeholder="banana + latte"
              value={draft.preWorkout}
              onChange={(event) => updateDraft('preWorkout', event.target.value)}
            />
          </label>
        </div>
        <label>
          Notes / doubts for today
          <textarea
            placeholder="Felt tired after gym. Need better food plan."
            value={draft.notes}
            onChange={(event) => updateDraft('notes', event.target.value)}
          />
        </label>
      </section>
    </div>
  )
}

function WorkoutView({
  draft,
  logs,
  updateDraft,
  updateExercise,
  removeExercise,
}: {
  draft: DailyLog
  logs: DailyLog[]
  updateDraft: <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => void
  updateExercise: (id: string, patch: Partial<ExerciseEntry>) => void
  removeExercise: (id: string) => void
}) {
  const [rawWorkoutText, setRawWorkoutText] = useState('')
  const [rawWorkoutMessage, setRawWorkoutMessage] = useState('')
  const [parseWarnings, setParseWarnings] = useState<ParserWarning[]>([])
  const [parsedPreview, setParsedPreview] = useState<ParsedWorkoutText | null>(null)

  const exerciseHistory = useMemo(() => buildExerciseHistory(logs, draft.date), [logs, draft.date])

  function previewRawWorkoutText() {
    if (!rawWorkoutText.trim()) {
      setRawWorkoutMessage('Paste a workout log first.')
      setParsedPreview(null)
      setParseWarnings([])
      return
    }

    const parsed = parseRawWorkoutText(rawWorkoutText)

    if (!parsed.exercises.length && !parsed.treadmillDistanceKm && !parsed.treadmillMinutes && !parsed.weightKg) {
      setRawWorkoutMessage('Nothing useful was detected. Check the format and try again.')
      setParsedPreview(null)
      setParseWarnings(parsed.warnings)
      return
    }

    setParsedPreview(parsed)
    setParseWarnings(parsed.warnings)
    setRawWorkoutMessage(
      `Preview ready: ${parsed.exercises.length} exercise${parsed.exercises.length === 1 ? '' : 's'} detected as ${parsed.workoutType}.`,
    )
  }

  function applyParsedWorkoutText() {
    const parsed = parsedPreview ?? parseRawWorkoutText(rawWorkoutText)

    if (!parsed.exercises.length && !parsed.treadmillDistanceKm && !parsed.treadmillMinutes && !parsed.weightKg) {
      setRawWorkoutMessage('Nothing useful was detected. Check the format and try again.')
      setParseWarnings(parsed.warnings)
      return
    }

    if (parsed.weightKg) {
      updateDraft('weightKg', parsed.weightKg)
    }

    updateDraft('workoutType', parsed.workoutType)
    updateDraft('treadmillDistanceKm', parsed.treadmillDistanceKm)
    updateDraft('treadmillMinutes', parsed.treadmillMinutes)
    updateDraft('treadmillIncline', parsed.treadmillIncline || draft.treadmillIncline)
    if (parsed.strengthCalories) updateDraft('strengthCalories', parsed.strengthCalories)
    if (parsed.cardioCalories) updateDraft('cardioCalories', parsed.cardioCalories)
    if (parsed.basketballCalories) updateDraft('basketballCalories', parsed.basketballCalories)
    if (parsed.cyclingCalories) updateDraft('cyclingCalories', parsed.cyclingCalories)
    updateDraft('exercises', parsed.exercises)
    updateDraft('notes', buildNotesWithRawWorkout(draft.notes, rawWorkoutText))

    setParsedPreview(parsed)
    setParseWarnings(parsed.warnings)
    setRawWorkoutMessage(
      `Applied ${parsed.exercises.length} exercise${parsed.exercises.length === 1 ? '' : 's'} to ${formatDateShort(draft.date)}. Click Save log to sync.`,
    )
  }

  return (
    <div className="view-grid">
      <section className="panel span-2 raw-workout-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Post-session import</p>
            <h3>Paste the work. Keep the proof.</h3>
          </div>
          <button className="primary-button" type="button" onClick={applyParsedWorkoutText}>
            Apply to {formatDateShort(draft.date)}
          </button>
        </div>

        <p className="helper-copy">
          Paste your raw gym note exactly as you write it. GymOS will structure your body weight, cardio, exercises, sets, reps, Apple Watch calories, and clean exercise names. Preview first, fix anything suspicious, then apply and save.
        </p>

        <textarea
          className="raw-workout-box"
          placeholder={`Weight: 92 kgs
Treadmill: 0.42km, 05:00, incline=6.0
Squats: 0lbs, 3, 12
Reverse Lunge: 0lbs, 3, 12
Dumbbell Romanian Deadlift: 5lbs, 3, 12
Leg extension (Quadriceps): 30lbs, 3, 12
Leg curl (Glutes & Hamstrings): 20lbs, 3, 12
Standing calf raise: 5lbs, 3, 12
Plank: , 3, 35 seconds
Crunches: , 3, 12
Calories Burnt:
Traditional Strength Training: 112 kcal
Running: 109 kcal
Basketball: 1329 kcal`}
          value={rawWorkoutText}
          onChange={(event) => {
            setRawWorkoutText(event.target.value)
            setRawWorkoutMessage('')
            setParseWarnings([])
            setParsedPreview(null)
          }}
        />

        <div className="raw-workout-actions">
          <button className="ghost-button" type="button" onClick={() => {
            setRawWorkoutText('')
            setRawWorkoutMessage('')
            setParseWarnings([])
            setParsedPreview(null)
          }}>
            Clear
          </button>

          <button className="ghost-button" type="button" onClick={previewRawWorkoutText}>
            Preview parse
          </button>

          <button className="primary-button" type="button" onClick={applyParsedWorkoutText}>
            Apply to {formatDateShort(draft.date)}
          </button>

          {rawWorkoutMessage && <span>{rawWorkoutMessage}</span>}
        </div>

        {parsedPreview && (
          <div className="parsed-preview-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Parsed preview</p>
                <h3>{parsedPreview.workoutType} detected</h3>
              </div>
              <span className="status-pill">{parsedPreview.exercises.length} exercises</span>
            </div>

            <div className="parsed-preview-stats">
              <article>
                <span>Weight</span>
                <strong>{parsedPreview.weightKg ? `${parsedPreview.weightKg} kg` : '—'}</strong>
              </article>
              <article>
                <span>Treadmill</span>
                <strong>
                  {parsedPreview.treadmillDistanceKm || '—'} km · {parsedPreview.treadmillMinutes || '—'}
                </strong>
              </article>
              <article>
                <span>Incline</span>
                <strong>{parsedPreview.treadmillIncline || '—'}</strong>
              </article>
              <article>
                <span>Calories</span>
                <strong>
                  {Number(
                    (safeNumber(parsedPreview.strengthCalories) ?? 0) +
                      (safeNumber(parsedPreview.cardioCalories) ?? 0) +
                      (safeNumber(parsedPreview.basketballCalories) ?? 0) +
                      (safeNumber(parsedPreview.cyclingCalories) ?? 0),
                  ) || '—'} kcal
                </strong>
              </article>
              <article>
                <span>Warnings</span>
                <strong>{parsedPreview.warnings.length}</strong>
              </article>
            </div>

            <div className="parsed-preview-list">
              {parsedPreview.exercises.map((exercise) => (
                <div className="parsed-preview-row" key={exercise.id}>
                  <strong>{exercise.name}</strong>
                  <span>
                    {exercise.weight || '—'} {exercise.unit !== 'bodyweight' ? exercise.unit : ''} · {exercise.sets || '—'} × {exercise.reps || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {parseWarnings.length > 0 && (
          <div className="parser-warning-list">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Parser review</p>
                <h3>Check before saving</h3>
              </div>
              <span className="status-pill">{parseWarnings.length} flags</span>
            </div>

            {parseWarnings.map((warning) => (
              <article className={`parser-warning ${warning.level}`} key={warning.id}>
                <strong>{warning.message}</strong>
                {warning.line && <code>{warning.line}</code>}
                {warning.suggestion && <span>{warning.suggestion}</span>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel span-2 form-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Parsed result</p>
            <h3>{draft.workoutType} workout</h3>
          </div>
          <span className="status-pill">{draft.exercises.length} exercises</span>
        </div>

        <div className="exercise-list">
          {draft.exercises.length === 0 && (
            <div className="empty-state">
              No workout parsed yet. Paste your workout above, apply it to this date, review the result, then Save log.
            </div>
          )}

          {draft.exercises.map((exercise) => {
            const canonicalName = canonicalExerciseName(exercise.name)
            const history = exerciseHistory.get(canonicalName)
            const performanceBadge = getExercisePerformanceBadge(exercise, history)

            return (
              <article className="exercise-card" key={exercise.id}>
                <div className="exercise-main">
                  <div className="exercise-title-row">
                    <input
                      aria-label="Exercise name"
                      className="exercise-name"
                      value={exercise.name}
                      onChange={(event) => updateExercise(exercise.id, { name: event.target.value })}
                    />
                    {performanceBadge && (
                      <span className={`performance-badge ${performanceBadge.tone}`}>
                        {performanceBadge.label}
                      </span>
                    )}
                  </div>

                  <div className="mini-grid">
                    <input
                      aria-label="Weight"
                      placeholder="Weight"
                      value={exercise.weight}
                      onChange={(event) => updateExercise(exercise.id, { weight: event.target.value })}
                    />
                    <select
                      aria-label="Unit"
                      value={exercise.unit}
                      onChange={(event) =>
                        updateExercise(exercise.id, { unit: event.target.value as ExerciseEntry['unit'] })
                      }
                    >
                      <option value="lbs">lbs</option>
                      <option value="kg">kg</option>
                      <option value="bodyweight">bodyweight</option>
                    </select>
                    <input
                      aria-label="Sets"
                      placeholder="Sets"
                      value={exercise.sets}
                      onChange={(event) => updateExercise(exercise.id, { sets: event.target.value })}
                    />
                    <input
                      aria-label="Reps"
                      placeholder="Reps"
                      value={exercise.reps}
                      onChange={(event) => updateExercise(exercise.id, { reps: event.target.value })}
                    />
                  </div>
                </div>

                {history && (
                  <div className="exercise-history-strip">
                    <span>Last: {history.lastLabel}</span>
                    <span>Best: {history.bestLabel}</span>
                    <button
                      className="micro-button"
                      type="button"
                      onClick={() => updateExercise(exercise.id, history.lastPatch)}
                    >
                      Copy last
                    </button>
                  </div>
                )}

                <button className="danger-button" type="button" onClick={() => removeExercise(exercise.id)}>
                  Remove
                </button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="panel span-2 form-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Parsed cardio</p>
            <h3>Treadmill / cardio</h3>
          </div>
        </div>

        <div className="form-grid">
          <label>
            Distance km
            <input
              inputMode="decimal"
              placeholder="1.25"
              value={draft.treadmillDistanceKm}
              onChange={(event) => updateDraft('treadmillDistanceKm', event.target.value)}
            />
          </label>
          <label>
            Duration min
            <input
              inputMode="decimal"
              placeholder="15:00"
              value={draft.treadmillMinutes}
              onChange={(event) => updateDraft('treadmillMinutes', event.target.value)}
            />
          </label>
          <label>
            Incline
            <input
              inputMode="decimal"
              placeholder="6.0"
              value={draft.treadmillIncline}
              onChange={(event) => updateDraft('treadmillIncline', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel span-2 form-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Apple Watch / activity</p>
            <h3>Calories burned</h3>
          </div>
          <span className="status-pill">
            {getTotalCaloriesBurned(draft) ? `${getTotalCaloriesBurned(draft)} kcal` : 'Optional'}
          </span>
        </div>

        <div className="form-grid">
          <label>
            Strength kcal
            <input
              inputMode="decimal"
              placeholder="112"
              value={draft.strengthCalories}
              onChange={(event) => updateDraft('strengthCalories', event.target.value)}
            />
          </label>

          <label>
            Cardio / running kcal
            <input
              inputMode="decimal"
              placeholder="109"
              value={draft.cardioCalories}
              onChange={(event) => updateDraft('cardioCalories', event.target.value)}
            />
          </label>

          <label>
            Basketball kcal
            <input
              inputMode="decimal"
              placeholder="1329"
              value={draft.basketballCalories}
              onChange={(event) => updateDraft('basketballCalories', event.target.value)}
            />
          </label>

          <label>
            Cycling kcal
            <input
              inputMode="decimal"
              placeholder="240"
              value={draft.cyclingCalories}
              onChange={(event) => updateDraft('cyclingCalories', event.target.value)}
            />
          </label>
        </div>
      </section>

    </div>
  )
}

function NutritionView({
  draft,
  updateMeal,
  addMeal,
}: {
  draft: DailyLog
  updateMeal: (id: string, patch: Partial<MealEntry>) => void
  addMeal: () => void
}) {
  const displayMeals = getDisplayMeals(draft)
  console.log(
    'NutritionView meals',
    draft.date,
    displayMeals.map((meal) => ({
      label: meal.label,
      items: meal.items,
      kcal: getMealCalories(meal),
    })),
  )
  const dailyFoodCalories = getDailyFoodCalories({ meals: displayMeals })

  function addFoodItem(meal: MealEntry) {
    updateMeal(meal.id, {
      items: [...meal.items, makeFoodItem()],
    })
  }

  function updateFoodItem(meal: MealEntry, itemId: string, patch: Partial<FoodItem>) {
    updateMeal(meal.id, {
      items: meal.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    })
  }

  function removeFoodItem(meal: MealEntry, itemId: string) {
    updateMeal(meal.id, {
      items: meal.items.filter((item) => item.id !== itemId),
    })
  }

  function displayMealLabel(label: MealEntry['label']) {
    return label === 'Snack' ? 'Snacks' : label
  }

  return (
    <div className="view-grid">
      <section className="panel span-2 nutrition-summary-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Food log</p>
            <h3>Track what you ate, not vague labels.</h3>
          </div>
          <span className="status-pill">
            {dailyFoodCalories ? `${dailyFoodCalories} kcal` : 'No kcal yet'}
          </span>
        </div>

        <p className="helper-copy">
          Add each food item under the meal where you ate it, then enter the kcal from your food tracking app.
          GymOS will total each meal and the full day.
        </p>
      </section>

      {displayMeals.map((meal) => {
        const mealCalories = getMealCalories(meal)

        return (
          <section className="meal-card food-item-meal-card" key={`${meal.label}-${meal.id}`}>
            <div className="meal-header-row">
              <div>
                <p className="eyebrow">{displayMealLabel(meal.label)}</p>
                <h3>{mealCalories ? `${mealCalories} kcal` : 'No kcal yet'}</h3>
              </div>

              <button className="ghost-button" type="button" onClick={() => addFoodItem(meal)}>
                Add food
              </button>
            </div>

            <div className="food-item-list">
              {meal.items.length === 0 && (
                <div className="empty-state">
                  No food items yet. Add what you ate and the kcal from your tracker.
                </div>
              )}

              {meal.items.map((item) => (
                <div className="food-item-row" key={item.id}>
                  <input
                    aria-label="Food item"
                    placeholder="e.g. 2 eggs / dal rice / protein bar"
                    value={item.name}
                    onChange={(event) => updateFoodItem(meal, item.id, { name: event.target.value })}
                  />

                  <input
                    aria-label="Calories"
                    inputMode="decimal"
                    placeholder="kcal"
                    value={item.calories}
                    onChange={(event) => updateFoodItem(meal, item.id, { calories: event.target.value })}
                  />

                  <button
                    className="micro-button"
                    type="button"
                    onClick={() => removeFoodItem(meal, item.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <label className="meal-notes-label">
              Meal notes, optional
              <textarea
                placeholder="Anything useful about this meal?"
                value={meal.description}
                onChange={(event) => updateMeal(meal.id, { description: event.target.value })}
              />
            </label>
          </section>
        )
      })}

      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Daily intake</p>
            <h3>{dailyFoodCalories ? `${dailyFoodCalories} kcal logged` : 'No calories logged yet'}</h3>
          </div>
          <button className="ghost-button" type="button" onClick={addMeal}>
            Add another meal
          </button>
        </div>

        <div className="meal-calorie-breakdown">
          {displayMeals.map((meal) => (
            <article key={`breakdown-${meal.label}-${meal.id}`}>
              <span>{displayMealLabel(meal.label)}</span>
              <strong>{getMealCalories(meal) || '—'} kcal</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function TrendsView({
  logs,
  stats,
  importLogsFromJson,
  setActiveDate,
  setActiveTab,
}: {
  logs: DailyLog[]
  stats: ReturnType<typeof buildStats>
  importLogsFromJson: (raw: string) => Promise<number>
  setActiveDate: (date: string) => void
  setActiveTab: (tab: Tab) => void
}) {
  const sorted = sortLogs(logs)
  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const latestWaist = sorted.find((log) => log.waistSizeCm)?.waistSizeCm ?? ''
  const exerciseDashboard = useMemo(() => buildExerciseDashboard(logs), [logs])
  const caloriesDashboard = useMemo(() => buildCaloriesDashboard(logs), [logs])
  const splitCounts = useMemo(() => buildSplitCounts(logs), [logs])
  const cardioStats = useMemo(() => buildCardioDashboard(logs), [logs])
  const heatmap = useMemo(() => buildConsistencyHeatmap(logs), [logs])
  const foodCaloriesDashboard = useMemo(() => buildFoodCaloriesDashboard(logs), [logs])
  const coverage = useMemo(
    () => buildDataCoverage(logs, heatmap.days.map((day) => day.date)),
    [logs, heatmap],
  )
  const exerciseDeepDive = useMemo(() => buildExerciseDeepDive(logs), [logs])
  const [selectedExercise, setSelectedExercise] = useState('')
  const selectedExerciseInsight = exerciseDeepDive.find((exercise) => exercise.canonicalName === selectedExercise) ?? exerciseDeepDive[0] ?? null
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<TrendMetric>('weight')
  const [selectedTrendRange, setSelectedTrendRange] = useState<TrendRange>('3m')
  const trendSeries = useMemo(
    () => buildTrendSeries(logs, selectedTrendMetric, selectedTrendRange),
    [logs, selectedTrendMetric, selectedTrendRange],
  )
  const trendSummary = useMemo(() => getTrendSummary(trendSeries), [trendSeries])
  const awardsDashboard = useMemo(() => buildAwardsDashboard(logs), [logs])
  const [selectedAwardCategory, setSelectedAwardCategory] = useState<AwardCategory>('strength')
  const selectedAward = awardsDashboard.find((award) => award.id === selectedAwardCategory) ?? awardsDashboard[0] ?? null
  const trendSuffix =
    selectedTrendMetric === 'weight'
      ? ' kg'
      : selectedTrendMetric === 'waist'
        ? ' cm'
        : selectedTrendMetric === 'cardio-distance'
          ? ' km'
          : selectedTrendMetric === 'cardio-minutes'
            ? ' min'
            : ' kcal'

  async function handleImport() {
    try {
      setImportMessage('Importing…')
      const count = await importLogsFromJson(importText)
      setImportText('')
      setImportMessage(`Imported ${count} log${count === 1 ? '' : 's'}.`)
    } catch (error) {
      setImportMessage(getErrorMessage(error))
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setImportText(text)
      setImportMessage(`Loaded ${file.name}. Review it, then click Import logs.`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Could not read the selected file.')
    } finally {
      event.target.value = ''
    }
  }

  function editLog(date: string) {
    setActiveDate(date)
    setActiveTab('today')
  }

  return (
    <div className="view-grid">
      <section className="panel span-2">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reality check</p>
            <h3>Trends, not single weigh-ins</h3>
          </div>
          <span className="status-pill">{logs.length} logs saved</span>
        </div>
        <div className="trend-strip">
          <div>
            <span>7-day average</span>
            <strong>{formatKg(stats.sevenDayAverage)}</strong>
          </div>
          <div>
            <span>14-day average</span>
            <strong>{formatKg(stats.fourteenDayAverage)}</strong>
          </div>
          <div>
            <span>Latest waist</span>
            <strong>{latestWaist ? `${latestWaist} cm` : '—'}</strong>
          </div>
          <div>
            <span>Cardio last 7</span>
            <strong>{stats.cardioMinutesLast7} min</strong>
          </div>
        </div>
      </section>

      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Interactive trend</p>
            <h3>Body and cardio graph</h3>
          </div>
          <span className="status-pill">{trendSeries.length} points</span>
        </div>

        <div className="trend-toggle-row">
          {TREND_METRICS.map((metric) => (
            <button
              key={metric.id}
              className={selectedTrendMetric === metric.id ? 'chip active' : 'chip'}
              type="button"
              onClick={() => setSelectedTrendMetric(metric.id)}
            >
              {metric.label}
            </button>
          ))}
        </div>

        <div className="trend-range-row">
          {TREND_RANGES.map((range) => (
            <button
              key={range.id}
              className={selectedTrendRange === range.id ? 'range-chip active' : 'range-chip'}
              type="button"
              onClick={() => setSelectedTrendRange(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="trend-chart-summary">
          <strong>
            {trendSummary.average === null ? '—' : `${trendSummary.average.toFixed(1)}${trendSuffix}`}
          </strong>
          <span>
            Average across selected range · {trendSeries.length} point{trendSeries.length === 1 ? '' : 's'} · {trendSummary.label}
          </span>
        </div>

        <TrendLineChart series={trendSeries} suffix={trendSuffix} />
      </section>

      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Consistency</p>
            <h3>8-week training heatmap</h3>
          </div>
          <span className={`status-pill heatmap-score ${heatmap.tone}`}>
            {heatmap.activeDays}/{heatmap.totalDays} active
          </span>
        </div>

        <div className="heatmap-legend">
          <span><i className="heat-cell upper" /> Upper</span>
          <span><i className="heat-cell lower" /> Lower</span>
          <span><i className="heat-cell mix" /> Mix</span>
          <span><i className="heat-cell cardio" /> Cardio only</span>
        </div>

        <div className="heatmap-weekdays" aria-hidden="true">
          {heatmap.weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="heatmap-grid" aria-label="Workout consistency heatmap">
          {heatmap.days.map((day) => (
            <span
              className={`heat-cell ${day.kind}`}
              key={day.date}
              title={`${formatDateShort(day.date)} · ${day.type}`}
            />
          ))}
        </div>

        <p className="helper-copy tight">
          Colour shows strict workout classification. Cardio only appears when no upper or lower strength work was logged that day.
        </p>

        <div className="coverage-grid">
          <article>
            <span>Weight coverage, 8w</span>
            <strong>{coverage.weightLogged}/{coverage.total}</strong>
          </article>
          <article>
            <span>Waist coverage, 8w</span>
            <strong>{coverage.waistLogged}/{coverage.total}</strong>
          </article>
          <article>
            <span>Cardio coverage, 8w</span>
            <strong>{coverage.cardioLogged}/{coverage.total}</strong>
          </article>
          <article>
            <span>Food coverage, 8w</span>
            <strong>{coverage.foodLogged}/{coverage.total}</strong>
          </article>
        </div>
      </section>


      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Progressive overload</p>
            <h3>Exercise progression board</h3>
          </div>
          <span className="status-pill">{exerciseDashboard.progression.length} tracked</span>
        </div>

        <div className="progression-grid">
          {exerciseDashboard.progression.length === 0 && (
            <div className="empty-state">Add a few more repeated exercise logs and this will show load, reps and session progress.</div>
          )}
          {exerciseDashboard.progression.slice(0, 8).map((item) => (
            <article className="progress-card" key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.sessions} sessions logged</span>
              </div>
              <div className="progress-values">
                <span>First: {item.firstLabel}</span>
                <span>Latest: {item.latestLabel}</span>
                <span>Best load: {item.bestLabel}</span>
              </div>
              <em>{item.deltaLabel}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Hidden signal</p>
            <h3>Exercise deep dive</h3>
          </div>
          <span className="status-pill">{exerciseDeepDive.length} movements</span>
        </div>

        {exerciseDeepDive.length === 0 ? (
          <div className="empty-state">Log repeated exercises to unlock movement-level insights.</div>
        ) : (
          <div className="deep-dive-grid">
            <label>
              Movement
              <select value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>
                {exerciseDeepDive.map((exercise) => (
                  <option key={exercise.canonicalName} value={exercise.canonicalName}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedExerciseInsight && (
              <article className="deep-dive-card">
                <div>
                  <span>Momentum</span>
                  <strong>{selectedExerciseInsight.momentum}</strong>
                </div>
                <p>{selectedExerciseInsight.hiddenInsight}</p>
                <div className="deep-dive-stats">
                  <span>Sessions: {selectedExerciseInsight.sessions}</span>
                  <span>First: {selectedExerciseInsight.firstLabel}</span>
                  <span>Latest: {selectedExerciseInsight.latestLabel}</span>
                  <span>
                    Best: {selectedExerciseInsight.bestLabel}
                    {selectedExerciseInsight.bestDate ? ` · ${formatDateShort(selectedExerciseInsight.bestDate)}` : ''}
                  </span>
                </div>
              </article>
            )}
          </div>
        )}
      </section>

      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Training intelligence</p>
            <h3>Patterns from repeated exercises</h3>
          </div>
        </div>

        <div className="analysis-grid">
          <article className="analysis-card">
            <span>Split balance</span>
            <strong>{splitCounts.summary}</strong>
            <p>
              Upper {splitCounts.Upper} · Lower {splitCounts.Lower} · Mix {splitCounts.Mix} · Cardio {splitCounts.Cardio} · Rest {splitCounts.Rest}
            </p>
          </article>

          <article className="analysis-card">
            <span>Cardio best</span>
            <strong>{cardioStats.bestDistanceLabel}</strong>
            <p>Longest duration: {cardioStats.bestDurationLabel}; latest logged: {cardioStats.latestLabel}</p>
          </article>

          <article className="analysis-card">
            <span>Calories burned</span>
            <strong>
              {caloriesDashboard.best
                ? `${caloriesDashboard.best.total} kcal`
                : '—'}
            </strong>
            <p>
              {caloriesDashboard.best
                ? `Best logged burn on ${formatDateFull(caloriesDashboard.best.date)}. Recent average: ${
                    caloriesDashboard.recentAverage ?? '—'
                  } kcal across logged calorie days. Cycling best: ${
                    caloriesDashboard.bestByCategory.cycling?.cycling || '—'
                  } kcal.`
                : 'Add Apple Watch calories to unlock burn comparisons.'}
            </p>
          </article>

          <article className="analysis-card">
            <span>Volume leaders</span>
            <strong>{exerciseDashboard.volumeLeaders[0]?.name ?? '—'}</strong>
            <p>
              {exerciseDashboard.volumeLeaders
                .slice(0, 4)
                .map((item) => `${item.name} ${item.volumeLabel}`)
                .join(' · ') || 'Need more weighted entries.'}
            </p>
          </article>

          <article className="analysis-card">
            <span>Food calories</span>
            <strong>
              {foodCaloriesDashboard.latest
                ? `${foodCaloriesDashboard.latest.total} kcal`
                : '—'}
            </strong>
            <p>
              {foodCaloriesDashboard.latest
                ? `Latest logged intake: ${formatDateFull(foodCaloriesDashboard.latest.date)}. Recent average: ${
                    foodCaloriesDashboard.recentAverage ?? '—'
                  } kcal. Highest logged day: ${
                    foodCaloriesDashboard.highest
                      ? `${foodCaloriesDashboard.highest.total} kcal on ${formatDateFull(foodCaloriesDashboard.highest.date)}`
                      : '—'
                  }.`
                : 'Add food items and kcal to unlock intake trends.'}
            </p>
          </article>
        </div>
      </section>

      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Awards cabinet</p>
            <h3>Best achievements of all time</h3>
          </div>
          <span className="status-pill">
            {awardsDashboard.filter((award) => award.best).length}/4 tracked
          </span>
        </div>

        <div className="awards-grid">
          {awardsDashboard.map((award) => (
            <button
              key={award.id}
              type="button"
              className={selectedAwardCategory === award.id ? 'award-card active' : 'award-card'}
              onClick={() => setSelectedAwardCategory(award.id)}
            >
              <div className="award-card-top">
                <AwardCategoryIcon category={award.id} />
                <div>
                  <span className="award-card-label">{award.title}</span>
                  <strong>
                    {award.best ? `${award.best.value} ${award.unit}` : '—'}
                  </strong>
                </div>
              </div>

              <p className="award-card-subtitle">{award.subtitle}</p>

              <span className="award-card-date">
                {award.best ? formatDateFull(award.best.date) : 'No data logged yet'}
              </span>
            </button>
          ))}
        </div>

        {selectedAward && (
          <div className="award-detail-panel">
            <div className="award-detail-header">
              <div className="award-detail-title">
                <AwardCategoryIcon category={selectedAward.id} />
                <div>
                  <p className="eyebrow">Top 3</p>
                  <h4>{selectedAward.title} personal bests</h4>
                </div>
              </div>

              <span className="status-pill">
                {selectedAward.best ? `${selectedAward.best.value} ${selectedAward.unit}` : 'No data'}
              </span>
            </div>

            {selectedAward.topThree.length > 0 ? (
              <div className="award-top-three">
                {selectedAward.topThree.map((entry, index) => (
                  <article className="award-rank-card" key={`${selectedAward.id}-${entry.date}-${entry.value}-${index}`}>
                    <span className="award-rank-badge">#{index + 1}</span>
                    <strong>{entry.value} kcal</strong>
                    <p>{formatDateFull(entry.date)}</p>
                    <span>{selectedAward.title}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">No achievements logged yet for this category.</div>
            )}
          </div>
        )}
      </section>

      <section className="panel span-2 form-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Backfill</p>
            <h3>Import old logs</h3>
          </div>
        </div>
        <p className="helper-copy">
          Upload a JSON file or paste a JSON array of logs. Date is the only required field because it identifies the day; every fitness field can be blank.
        </p>
        <div className="file-import-row">
          <label className="file-import-button">
            Upload JSON
            <input accept="application/json,.json,.txt" type="file" onChange={handleImportFile} />
          </label>
          <span>Missing values such as blank strings, “-”, “n/a”, and “—” are imported as unavailable, not zero.</span>
        </div>
        <textarea
          className="import-box"
          placeholder={`[
  {
    "date": "2026-04-08",
    "weightKg": "92",
    "waistSizeCm": "",
    "sleepHours": "",
    "workoutType": "Upper",
    "gymTime": "10:15-11:45",
    "preWorkout": "2 bananas + latte",
    "treadmillDistanceKm": "1.00",
    "treadmillMinutes": "11:58",
    "treadmillIncline": "6.0",
    "notes": "Felt tired after gym",
    "exercises": [],
    "meals": []
  }
]`}
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
        />
        <div className="import-actions">
          <button className="primary-button" type="button" onClick={handleImport} disabled={!importText.trim()}>
            Import logs
          </button>
          {importMessage && <span>{importMessage}</span>}
        </div>
      </section>

      <section className="panel span-2">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">History</p>
            <h3>Recent logs</h3>
          </div>
        </div>

        <div className="history-list">
          {sorted.length === 0 && <div className="empty-state">No saved logs yet. Save today’s entry first.</div>}
          {sorted.slice(0, 30).map((log) => (
            <article className="history-row" key={log.id}>
              <div>
                <strong>{new Date(`${log.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</strong>
                <span>{log.workoutType} · {log.exercises.length} exercises</span>
              </div>
              <div>
                <strong>{log.weightKg ? `${log.weightKg} kg` : '—'}</strong>
                <span>Waist {log.waistSizeCm || '—'} cm · Treadmill {log.treadmillDistanceKm || '—'} km</span>
              </div>
              <button className="ghost-button compact-button" type="button" onClick={() => editLog(log.date)}>
                Edit
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function CoachView({
  coachInsight,
  coachPrompt,
  coachQuestion,
  copyCoachPrompt,
  copyState,
  setCoachQuestion,
  openExistingCoachChat,
}: {
  coachInsight: string[]
  coachPrompt: string
  coachQuestion: string
  copyCoachPrompt: () => Promise<void>
  copyState: 'idle' | 'copied'
  setCoachQuestion: (question: string) => void
  openExistingCoachChat: () => void
}) {
  return (
    <div className="view-grid">
      <section className="panel span-2 coach-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">End-of-day coach handoff</p>
            <h3>Send today’s full log to ChatGPT</h3>
          </div>
          <div className="coach-actions">
            <button className="ghost-button" type="button" onClick={openExistingCoachChat}>
              Open existing ChatGPT coach
            </button>
            <button className="primary-button" type="button" onClick={copyCoachPrompt}>
              {copyState === 'copied' ? 'Copied' : 'Copy end-of-day report'}
            </button>
          </div>
        </div>

        <label>
          Question
          <textarea value={coachQuestion} onChange={(event) => setCoachQuestion(event.target.value)} />
        </label>

        <div className="coach-insight">
          <h4>Immediate read</h4>
          <ul>
            {coachInsight.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <label>
          End-of-day report to paste into your existing ChatGPT gym chat
          <textarea className="prompt-box" readOnly value={coachPrompt} />
        </label>
      </section>
    </div>
  )
}


function formatDateShort(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function hasWorkoutData(log: DailyLog) {
  return Boolean(log.exercises.length || log.treadmillDistanceKm || log.treadmillMinutes)
}

function getLastWorkout(logs: DailyLog[], beforeDate?: string) {
  const sorted = sortLogs(logs).filter(hasWorkoutData)

  if (!beforeDate) {
    return sorted[0] ?? null
  }

  return sorted.find((log) => log.date < beforeDate) ?? sorted.find((log) => log.date !== beforeDate) ?? null
}

function getNextWorkoutRecommendation(logs: DailyLog[], draft: DailyLog) {
  const recent = sortLogs(logs).filter(hasWorkoutData)
  const last = getLastWorkout(logs, draft.date)
  const recentTypes = recent.filter((log) => log.date !== draft.date).slice(0, 3).map((log) => log.workoutType)

  if (draft.exercises.length) {
    return {
      headline: `${draft.workoutType} workout is loaded`,
      reason: 'Review the parsed workout, check previous/best performance, then save only what actually happened.',
    }
  }

  if (!last) {
    return {
      headline: 'Paste your first workout log',
      reason: 'Start by pasting the exact workout format you already use. GymOS will structure it and build trends from there.',
    }
  }

  if (recentTypes.filter((type) => type === 'Upper').length >= 2) {
    return {
      headline: 'Lower body should probably be next',
      reason: 'Your recent logs lean upper-heavy. Balance matters if you want recomposition, not just repeated upper-body volume.',
    }
  }

  if (last.workoutType === 'Lower') {
    return {
      headline: 'Upper day makes sense next',
      reason: `Last saved workout was Lower on ${formatDateShort(last.date)}. Keep the rotation deliberate.`,
    }
  }

  if (last.workoutType === 'Upper') {
    return {
      headline: 'Lower or recovery should be considered',
      reason: `Last saved workout was Upper on ${formatDateShort(last.date)}. Do not let habit turn every session into upper body.`,
    }
  }

  return {
    headline: 'Paste today’s actual workout',
    reason: `Last saved workout was ${last.workoutType} on ${formatDateShort(last.date)}. Log what you actually did, then let trends judge it.`,
  }
}

function buildWeeklyActivity(logs: DailyLog[], anchorDate: string) {
  const anchor = new Date(`${anchorDate}T00:00:00`)
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))

  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const iso = toInputDate(date)
    const log = logs.find((item) => item.date === iso)
    return {
      date: iso,
      label: date.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 1),
      dayNumber: date.getDate(),
      hasWorkout: Boolean(log && hasWorkoutData(log)),
      type: log?.workoutType ?? 'Rest',
    }
  })
}

function getWeightSparklinePoints(logs: DailyLog[]) {
  const values = getWeightValues(logs).slice(0, 14).reverse()
  if (values.length < 2) return ''
  const weights = values.map((entry) => entry.value)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const width = 220
  const height = 64
  const range = max - min || 1

  return values
    .map((entry, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width
      const y = height - ((entry.value - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function MiniSparkline({ points }: { points: string }) {
  if (!points) {
    return <div className="mini-sparkline empty">Need 2+ weigh-ins</div>
  }

  return (
    <svg className="mini-sparkline" viewBox="0 0 220 64" role="img" aria-label="Recent weight sparkline">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function buildDataCoverage(logs: DailyLog[], dateWindow?: string[]) {
  const scopedLogs = dateWindow
    ? dateWindow
        .map((date) => logs.find((log) => log.date === date))
        .filter((log): log is DailyLog => Boolean(log))
    : logs

  const total = dateWindow?.length ?? logs.length

  return {
    total,
    weightLogged: scopedLogs.filter((log) => safeNumber(log.weightKg) !== null).length,
    waistLogged: scopedLogs.filter((log) => safeNumber(log.waistSizeCm) !== null).length,
    cardioLogged: scopedLogs.filter(
      (log) => safeNumber(log.treadmillDistanceKm) !== null || parseDurationToMinutes(log.treadmillMinutes) !== null,
    ).length,
    foodLogged: scopedLogs.filter((log) => log.meals.some((meal) => meal.description.trim())).length,
  }
}

function buildCaloriesDashboard(logs: DailyLog[]) {
  const totals = [...logs]
    .filter((log) => getTotalCaloriesBurned(log) > 0)
    .map((log) => ({
      date: log.date,
      total: getTotalCaloriesBurned(log),
      strength: safeNumber(log.strengthCalories) ?? 0,
      cardio: safeNumber(log.cardioCalories) ?? 0,
      basketball: safeNumber(log.basketballCalories) ?? 0,
      cycling: safeNumber(log.cyclingCalories) ?? 0,
      workoutType: log.workoutType,
    }))

  const newestFirst = [...totals].sort((a, b) => b.date.localeCompare(a.date))

  const best = totals.reduce<typeof totals[number] | null>((winner, item) => {
    if (!winner) return item
    return item.total > winner.total ? item : winner
  }, null)

  const recent = newestFirst.slice(0, 7)
  const recentAverage = recent.length ? Math.round(average(recent.map((item) => item.total)) ?? 0) : null

  const bestByCategory = {
    strength: totals.reduce<typeof totals[number] | null>((winner, item) => {
      if (!winner) return item
      return item.strength > winner.strength ? item : winner
    }, null),
    cardio: totals.reduce<typeof totals[number] | null>((winner, item) => {
      if (!winner) return item
      return item.cardio > winner.cardio ? item : winner
    }, null),
    basketball: totals.reduce<typeof totals[number] | null>((winner, item) => {
      if (!winner) return item
      return item.basketball > winner.basketball ? item : winner
    }, null),
    cycling: totals.reduce<typeof totals[number] | null>((winner, item) => {
      if (!winner) return item
      return item.cycling > winner.cycling ? item : winner
    }, null),
  }

  return {
    loggedDays: totals.length,
    best,
    bestByCategory,
    recentAverage,
    totalAllTime: totals.reduce((sum, item) => sum + item.total, 0),
  }
}

function getAwardCategoryValue(log: DailyLog, category: AwardCategory) {
  if (category === 'strength') return safeNumber(log.strengthCalories) ?? 0
  if (category === 'cardio') return safeNumber(log.cardioCalories) ?? 0
  if (category === 'basketball') return safeNumber(log.basketballCalories) ?? 0
  return safeNumber(log.cyclingCalories) ?? 0
}

function buildAwardsDashboard(logs: DailyLog[]): AwardCard[] {
  const categories: Array<{
    id: AwardCategory
    title: string
    subtitle: string
  }> = [
    {
      id: 'strength',
      title: 'Strength',
      subtitle: 'Best traditional strength session',
    },
    {
      id: 'cardio',
      title: 'Running / Cardio',
      subtitle: 'Best treadmill / running / cardio burn',
    },
    {
      id: 'basketball',
      title: 'Basketball',
      subtitle: 'Best basketball calorie burn',
    },
    {
      id: 'cycling',
      title: 'Cycling',
      subtitle: 'Best cycling calorie burn',
    },
  ]

  return categories.map((category) => {
    const entries: AwardEntry[] = sortLogs(logs)
      .map((log) => ({
        date: log.date,
        value: getAwardCategoryValue(log, category.id),
        workoutType: log.workoutType,
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value
        return a.date.localeCompare(b.date)
      })

    return {
      id: category.id,
      title: category.title,
      subtitle: category.subtitle,
      unit: 'kcal',
      best: entries[0] ?? null,
      topThree: entries.slice(0, 3),
    }
  })
}

function buildExerciseHistory(logs: DailyLog[], currentDate: string) {
  const history = new Map<string, ExerciseHistorySummary>()
  const byName = new Map<
    string,
    Array<{
      date: string
      exercise: ExerciseEntry
      score: number | null
    }>
  >()

  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (log.date >= currentDate) continue

    for (const exercise of log.exercises) {
      const name = canonicalExerciseName(exercise.name)
      if (!name) continue

      const items = byName.get(name) ?? []
      items.push({
        date: log.date,
        exercise,
        score: getExerciseScore(exercise),
      })
      byName.set(name, items)
    }
  }

  for (const [name, entries] of byName) {
    const last = entries[entries.length - 1]

    const best = entries.reduce<(typeof entries)[number] | null>((winner, item) => {
      if (!winner) return item

      const itemScore = item.score ?? 0
      const winnerScore = winner.score ?? 0

      if (itemScore > winnerScore) return item
      return winner
    }, null)

    history.set(name, {
      lastLabel: `${formatExerciseEntry(last.exercise)} · ${formatDateShort(last.date)}`,
      bestLabel: best ? `${formatExerciseEntry(best.exercise)} · ${formatDateShort(best.date)}` : '—',
      lastPatch: {
        weight: last.exercise.weight,
        unit: last.exercise.unit,
        sets: last.exercise.sets,
        reps: last.exercise.reps,
      },
      sessions: entries.length,
      lastScore: last.score,
      bestScore: best?.score ?? null,
      bestDate: best?.date ?? null,
    })
  }

  return history
}

function buildConsistencyHeatmap(logs: DailyLog[]) {
  const sorted = sortLogs(logs)
  const latestDate = sorted[0]?.date ?? toInputDate(new Date())
  const latest = new Date(`${latestDate}T00:00:00`)

  const weekStart = new Date(latest)
  weekStart.setDate(latest.getDate() - ((latest.getDay() + 6) % 7))

  const start = new Date(weekStart)
  start.setDate(weekStart.getDate() - 49)

  const days = Array.from({ length: 56 }).map((_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)

    const iso = toInputDate(date)
    const log = logs.find((item) => item.date === iso)
    const hasCardio = Boolean(log?.treadmillDistanceKm || log?.treadmillMinutes)
    const kind = log ? classifyTrainingKind(log.exercises, hasCardio) : 'none'

    return {
      date: iso,
      weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayNumber: date.getDate(),
      kind,
      type: trainingKindToWorkoutType(kind),
      active: kind !== 'none',
    }
  })

  const activeDays = days.filter((day) => day.active).length
  const ratio = activeDays / days.length
  const tone = ratio >= 0.6 ? 'good' : ratio >= 0.35 ? 'medium' : 'low'

  return {
    days,
    activeDays,
    totalDays: days.length,
    tone,
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  }
}

function buildExerciseDeepDive(logs: DailyLog[]) {
  const byExercise = new Map<
    string,
    Array<{
      date: string
      exercise: ExerciseEntry
      score: number | null
      weight: number | null
      reps: number | null
      sets: number | null
    }>
  >()

  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const exercise of log.exercises) {
      const canonical = canonicalExerciseName(exercise.name)
      if (!canonical) continue

      const items = byExercise.get(canonical) ?? []
      items.push({
        date: log.date,
        exercise,
        score: getExerciseScore(exercise),
        weight: firstNumber(exercise.weight),
        reps: firstNumber(exercise.reps),
        sets: firstNumber(exercise.sets),
      })
      byExercise.set(canonical, items)
    }
  }

  return [...byExercise.entries()]
    .map(([canonicalName, entries]) => {
      const first = entries[0]
      const latest = entries[entries.length - 1]

      const best = entries.reduce<typeof entries[number] | null>((winner, entry) => {
        if (!winner) return entry
        return (entry.score ?? -Infinity) > (winner.score ?? -Infinity) ? entry : winner
      }, null)

      const previous = entries.length >= 2 ? entries[entries.length - 2] : null
      const latestScore = latest.score
      const previousScore = previous?.score ?? null

      const momentum =
        latestScore !== null && previousScore !== null
          ? latestScore > previousScore
            ? 'Improving'
            : latestScore < previousScore
              ? 'Dropped vs last'
              : 'Flat'
          : 'Need more data'

      return {
        canonicalName,
        name: displayExerciseName(canonicalName),
        sessions: entries.length,
        firstDate: first.date,
        latestDate: latest.date,
        firstLabel: formatExerciseEntry(first.exercise),
        latestLabel: formatExerciseEntry(latest.exercise),
        bestLabel: best ? formatExerciseEntry(best.exercise) : '—',
        bestDate: best?.date ?? null,
        momentum,
        hiddenInsight:
          entries.length < 3
            ? 'Too little data. Keep logging this movement.'
            : momentum === 'Improving'
              ? 'This movement is trending positively. Keep it in rotation.'
              : momentum === 'Dropped vs last'
                ? 'Performance dipped. Check sleep, food, fatigue, or whether this came later in the session.'
                : 'Load is flat. Progress may need more reps, cleaner form, or a small load increase.',
      }
    })
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
}

const EXERCISE_ALIASES: Array<{
  canonical: string
  display: string
  patterns: RegExp[]
}> = [
  {
    canonical: 'front-lat-pulldown',
    display: 'Front lat-pulldown',
    patterns: [/lat\s*-?\s*pulldown/i, /front\s+lat/i],
  },
  {
    canonical: 'machine-chest-press',
    display: 'Machine chest press',
    patterns: [/chest\s+press/i],
  },
  {
    canonical: 'machine-shoulder-press',
    display: 'Machine shoulder press',
    patterns: [/shoulder\s+press/i],
  },
  {
    canonical: 'machine-triceps-pushdown',
    display: 'Machine triceps pushdown',
    patterns: [/triceps?\s+push\s*-?\s*down/i, /triceps?\s+pushdown/i],
  },
  {
    canonical: 'triceps-extension',
    display: 'Triceps extension',
    patterns: [/triceps?\s+extension/i],
  },
  {
    canonical: 'seated-row',
    display: 'Seated row',
    patterns: [/seated\s+row/i],
  },
  {
    canonical: 'single-arm-row',
    display: 'Single-arm row',
    patterns: [/single\s+arm\s+row/i, /one\s+arm\s+row/i],
  },
  {
    canonical: 'bicep-curl',
    display: 'Bicep curl',
    patterns: [/biceps?\s*-?\s*curl/i, /machine\s+biceps?\s*-?\s*curl/i],
  },
  {
    canonical: 'hammer-curl',
    display: 'Hammer curl',
    patterns: [/hammer\s+curl/i],
  },
  {
    canonical: 'dumbbell-lateral-raise',
    display: 'Dumbbell lateral raise',
    patterns: [/lateral\s+raise/i],
  },
  {
    canonical: 'shoulder-shrug',
    display: 'Shoulder shrug',
    patterns: [/shoulder\s+shrug/i, /\bshrug\b/i],
  },
  {
    canonical: 'leg-curl',
    display: 'Leg curl',
    patterns: [/leg\s+curl/i],
  },
  {
    canonical: 'leg-extension',
    display: 'Leg extension',
    patterns: [/leg\s+extension/i],
  },
  {
    canonical: 'standing-calf-raise',
    display: 'Standing calf raise',
    patterns: [/calf\s*-?\s*raise/i, /standing\s+calf/i],
  },
  {
    canonical: 'dumbbell-romanian-deadlift',
    display: 'Dumbbell Romanian deadlift',
    patterns: [/romanian\s+deadlift/i, /\brdl\b/i],
  },
  {
    canonical: 'reverse-lunge',
    display: 'Reverse lunge',
    patterns: [/reverse\s+lunge/i],
  },
  {
    canonical: 'squat',
    display: 'Squat',
    patterns: [/\bsquat/i],
  },
  {
    canonical: 'plank',
    display: 'Plank',
    patterns: [/\bplank\b/i],
  },
  {
    canonical: 'crunches',
    display: 'Crunches',
    patterns: [/^crunch(es)?$/i, /^ab\s*crunch(es)?$/i],
  },
]

function cleanExerciseName(name: string) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bmachine\b/g, ' ')
    .replace(/\bdumbbell\b/g, ' dumbbell ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalExerciseName(name: string) {
  const cleaned = cleanExerciseName(name)

  for (const alias of EXERCISE_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(cleaned))) {
      return alias.canonical
    }
  }

  return cleaned
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function displayExerciseName(nameOrCanonical: string) {
  const canonical =
    EXERCISE_ALIASES.some((item) => item.canonical === nameOrCanonical)
      ? nameOrCanonical
      : canonicalExerciseName(nameOrCanonical)

  const alias = EXERCISE_ALIASES.find((item) => item.canonical === canonical)

  if (alias) return alias.display

  return nameOrCanonical
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function firstNumber(value: string | number | null | undefined) {
  if (isUnavailableValue(value)) return null
  const match = String(value).match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function formatLoad(weight: number | null, unit: ExerciseEntry['unit'] | string | null | undefined, fallback = '—') {
  if (unit === 'bodyweight') return 'bodyweight'
  if (weight === null) return fallback
  const value = weight % 1 === 0 ? weight.toFixed(0) : weight.toFixed(1)
  return `${value} ${unit || 'lbs'}`
}

function formatExerciseEntry(exercise: ExerciseEntry) {
  const weight = firstNumber(exercise.weight)
  const sets = firstNumber(exercise.sets)
  const reps = firstNumber(exercise.reps)
  const load = formatLoad(weight, exercise.unit)
  const scheme = sets && reps ? `${sets}×${reps}` : sets ? `${sets} sets` : reps ? `${reps} reps` : 'logged'
  return `${load}, ${scheme}`
}

function normalisedLoadInLbs(exercise: ExerciseEntry) {
  const weight = firstNumber(exercise.weight)

  if (weight === null) return null
  if (exercise.unit === 'kg') return weight * 2.20462
  if (exercise.unit === 'bodyweight') return null

  return weight
}

function getExerciseScore(exercise: ExerciseEntry) {
  const load = normalisedLoadInLbs(exercise)
  const sets = firstNumber(exercise.sets)
  const reps = firstNumber(exercise.reps)

  if (load !== null) {
    return load * 1000 + (reps ?? 0) * 10 + (sets ?? 0)
  }

  if (reps !== null || sets !== null) {
    return (reps ?? 0) * 10 + (sets ?? 0)
  }

  return null
}

function getExercisePerformanceBadge(
  exercise: ExerciseEntry,
  history: ExerciseHistorySummary | undefined,
): ExercisePerformanceBadge | null {
  const canonical = canonicalExerciseName(exercise.name)
  if (!canonical) return null

  const currentScore = getExerciseScore(exercise)

  if (!history) {
    return { label: 'NEW', tone: 'new' }
  }

  if (currentScore === null) return null

  if (history.bestScore !== null && currentScore > history.bestScore) {
    return { label: 'New PR', tone: 'pr' }
  }

  if (history.bestScore !== null && currentScore === history.bestScore) {
    return { label: 'Matches best', tone: 'match' }
  }

  if (history.lastScore !== null && currentScore > history.lastScore) {
    return { label: 'Up vs last', tone: 'up' }
  }

  if (history.lastScore !== null && currentScore < history.lastScore) {
    return { label: 'Below last', tone: 'down' }
  }

  return null
}

function buildExerciseDashboard(logs: DailyLog[]) {
  const byExercise = new Map<
    string,
    Array<{
      date: string
      exercise: ExerciseEntry
      weight: number | null
      score: number | null
      volume: number | null
    }>
  >()

  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const exercise of log.exercises) {
      const name = canonicalExerciseName(exercise.name)
      if (!name) continue

      const weight = firstNumber(exercise.weight)
      const sets = firstNumber(exercise.sets)
      const reps = firstNumber(exercise.reps)
      const score = getExerciseScore(exercise)
      const volume = weight !== null && weight > 0 && sets !== null && reps !== null ? weight * sets * reps : null
      const items = byExercise.get(name) ?? []

      items.push({ date: log.date, exercise, weight, score, volume })
      byExercise.set(name, items)
    }
  }

  const progression = [...byExercise.entries()]
    .filter(([, entries]) => entries.length >= 2)
    .map(([name, entries]) => {
      const first = entries[0]
      const latest = entries[entries.length - 1]

      const best = entries.reduce<typeof entries[number] | null>((winner, entry) => {
        if (!winner) return entry
        return (entry.score ?? -Infinity) > (winner.score ?? -Infinity) ? entry : winner
      }, null)

      const firstWeight = first.weight
      const latestWeight = latest.weight
      const delta = firstWeight !== null && latestWeight !== null ? latestWeight - firstWeight : null
      const unit = latest.exercise.unit || 'lbs'

      return {
        name: displayExerciseName(name),
        canonicalName: name,
        sessions: entries.length,
        firstLabel: formatExerciseEntry(first.exercise),
        latestLabel: formatExerciseEntry(latest.exercise),
        bestLabel: best ? formatExerciseEntry(best.exercise) : '—',
        bestDate: best?.date ?? null,
        deltaLabel:
          delta === null
            ? 'Track load consistently to see direction.'
            : delta > 0
              ? `Up ${delta.toFixed(delta % 1 === 0 ? 0 : 1)} ${unit} since first log.`
              : delta < 0
                ? `Down ${Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)} ${unit} since first log.`
                : 'Load is flat; look for rep quality, form, or consistency improvements.',
      }
    })
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))

  const volumeLeaders = [...byExercise.entries()]
    .map(([name, entries]) => ({
      name: displayExerciseName(name),
      canonicalName: name,
      volume: entries.reduce((sum, entry) => sum + (entry.volume ?? 0), 0),
    }))
    .filter((item) => item.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .map((item) => ({
      ...item,
      volumeLabel: item.volume >= 1000 ? `${Math.round(item.volume / 100) / 10}k` : `${Math.round(item.volume)}`,
    }))

  return { progression, volumeLeaders }
}

function buildSplitCounts(logs: DailyLog[]) {
  const counts: Record<WorkoutType, number> = {
    Upper: 0,
    Lower: 0,
    Mix: 0,
    Cardio: 0,
    Recovery: 0,
    Rest: 0,
    Custom: 0,
  }

  for (const log of logs) {
    counts[log.workoutType] += 1
  }

  const summary = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type, count]) => `${type} ${count}`)
    .join(' · ') || 'No split data yet'

  return { ...counts, summary }
}

function buildCardioDashboard(logs: DailyLog[]) {
  const entries = sortLogs(logs)
    .map((log) => ({
      date: log.date,
      distance: safeNumber(log.treadmillDistanceKm),
      minutes: parseDurationToMinutes(log.treadmillMinutes),
    }))
    .filter((entry) => entry.distance !== null || entry.minutes !== null)

  const latest = entries[0]
  const bestDistance = entries.reduce<typeof entries[number] | null>((winner, entry) => {
    if (entry.distance === null) return winner
    if (!winner || winner.distance === null || entry.distance > winner.distance) return entry
    return winner
  }, null)
  const bestDuration = entries.reduce<typeof entries[number] | null>((winner, entry) => {
    if (entry.minutes === null) return winner
    if (!winner || winner.minutes === null || entry.minutes > winner.minutes) return entry
    return winner
  }, null)

  return {
    latestLabel: latest ? `${latest.distance ?? '—'} km / ${latest.minutes === null ? '—' : `${Math.round(latest.minutes)} min`}` : '—',
    bestDistanceLabel: bestDistance?.distance === null || !bestDistance ? '—' : `${bestDistance.distance.toFixed(2)} km`,
    bestDurationLabel: bestDuration?.minutes === null || !bestDuration ? '—' : `${Math.round(bestDuration.minutes)} min`,
  }
}

function buildStats(logs: DailyLog[]) {
  const sorted = sortLogs(logs)
  const weights = getWeightValues(sorted)
  const sevenWeights = weights.slice(0, 7).map((entry) => entry.value)
  const fourteenWeights = weights.slice(0, 14).map((entry) => entry.value)
  const sevenDayAverage = average(sevenWeights)
  const fourteenDayAverage = average(fourteenWeights)
  const latestWeight = weights[0]?.value ?? null
  const oldestRecentWeight = weights[Math.min(weights.length - 1, 6)]?.value ?? null
  const delta = latestWeight !== null && oldestRecentWeight !== null ? latestWeight - oldestRecentWeight : null
  const last7 = sorted.slice(0, 7)
  const trainingDaysLast7 = last7.filter((log) => log.workoutType !== 'Rest' && hasWorkoutData(log)).length
  const cardioMinutesLast7 = last7.reduce((sum, log) => sum + (parseDurationToMinutes(log.treadmillMinutes) ?? 0), 0)
  const cardioDistanceLast7 = last7.reduce((sum, log) => sum + (safeNumber(log.treadmillDistanceKm) ?? 0), 0)

  return {
    sevenDayAverage,
    latestWeightLabel: latestWeight === null ? 'No weigh-in' : `${latestWeight.toFixed(1)} kg`,
    fourteenDayAverage,
    trainingDaysLast7,
    cardioMinutesLast7: Math.round(cardioMinutesLast7),
    cardioDistanceLast7Label: `${cardioDistanceLast7.toFixed(2)} km`,
    weightDeltaText:
      delta === null
        ? 'Need more weigh-ins'
        : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg vs recent log`,
  }
}

function buildCoachInsight(draft: DailyLog, stats: ReturnType<typeof buildStats>) {
  const insights: string[] = []
  const sleep = safeNumber(draft.sleepHours)
  const displayMeals = ensureDefaultMeals(draft.meals)
  const foodCalories = getDailyFoodCalories({ meals: displayMeals })
  const totalBurnedCalories = getTotalCaloriesBurned(draft)

  const foodText = displayMeals
    .flatMap((meal) => [
      meal.description,
      ...meal.items.map((item) => item.name),
    ])
    .join(' ')

  const hasProteinSignal = /egg|eggs|yoghurt|yogurt|curd|milk|paneer|chicken|fish|tuna|salmon|shrimp|prawns|protein|dal|lentil|lentils|chickpeas|beans|tofu|mutton|beef/i.test(
    `${draft.preWorkout} ${foodText}`,
  )

  if (!draft.weightKg) {
    insights.push('Weight is missing. That is fine occasionally, but trends need repeated weigh-ins.')
  }

  if (sleep !== null && sleep < 7) {
    insights.push('Sleep is under 7 hours. Recovery quality will be harder to judge.')
  }

  if (draft.exercises.length === 0 && !draft.treadmillDistanceKm && !draft.treadmillMinutes) {
    insights.push('No workout is logged yet. Paste the raw workout first, then save.')
  }

  if (!foodCalories) {
    insights.push('Food intake is not logged yet. Add food items and kcal before asking for end-of-day coaching.')
  }

  if (foodCalories && totalBurnedCalories && foodCalories < totalBurnedCalories * 0.7) {
    insights.push('Food kcal looks very low compared with activity burn. Check that meals are fully logged before reading too much into the day.')
  }

  if (foodCalories && !hasProteinSignal) {
    insights.push('Food is logged, but the protein signal looks weak from item names. Add clearer item names if protein was actually included.')
  }

  if (draft.exercises.length > 8) {
    insights.push('This is a long session. More exercises are not automatically better progress.')
  }

  if (stats.sevenDayAverage === null) {
    insights.push('Save at least 7 weigh-ins before judging the scale seriously.')
  }

  if (!insights.length) {
    insights.push('Today is structurally fine. The useful question is whether load, reps, consistency, intake, and recovery are improving.')
  }

  return insights
}

function buildCoachPrompt(draft: DailyLog, logs: DailyLog[], question: string) {
  const stats = buildStats(logs)
  const exerciseDashboard = buildExerciseDashboard(logs)
  const foodDashboard = buildFoodCaloriesDashboard(logs)
  const workoutComparison = buildWorkoutCoachComparison(draft, logs)

  const draftMeals = ensureDefaultMeals(draft.meals)
  const draftFoodCalories = getDailyFoodCalories({ meals: draftMeals })

  const recentLogs = sortLogs(logs)
    .slice(0, 14)
    .map((log) => {
      const meals = ensureDefaultMeals(log.meals)

      return {
        date: log.date,
        weightKg: log.weightKg || null,
        waistSizeCm: log.waistSizeCm || null,
        workoutType: log.workoutType,
        treadmillDistanceKm: log.treadmillDistanceKm || null,
        treadmillMinutes: log.treadmillMinutes || null,
        strengthCalories: log.strengthCalories || null,
        cardioCalories: log.cardioCalories || null,
        basketballCalories: log.basketballCalories || null,
        cyclingCalories: log.cyclingCalories || null,
        totalCaloriesBurned: getTotalCaloriesBurned(log) || null,
        foodCalories: getDailyFoodCalories({ meals }) || null,
        exerciseCount: log.exercises.length,
        exercises: log.exercises.map((exercise) => ({
          name: exercise.name,
          weight: exercise.weight || null,
          unit: exercise.unit,
          sets: exercise.sets || null,
          reps: exercise.reps || null,
        })),
        meals: meals.map((meal) => ({
          label: meal.label,
          calories: getMealCalories(meal),
          items: meal.items,
          description: meal.description || null,
        })),
      }
    })

  return `You are my direct fitness analyst. Be practical, blunt, and evidence-based.

Goal: body recomposition, fat loss, better gym consistency, maintain or gain strength.

Question: ${question}

Today’s log:
${JSON.stringify(
  {
    ...draft,
    meals: draftMeals,
    totalFoodCalories: draftFoodCalories || null,
    totalCaloriesBurned: getTotalCaloriesBurned(draft) || null,
  },
  null,
  2,
)}

Workout comparison:
${JSON.stringify(workoutComparison, null, 2)}

Recent trend summary:
- Today calories burned: strength ${draft.strengthCalories || '—'} kcal, cardio/running ${draft.cardioCalories || '—'} kcal, basketball ${draft.basketballCalories || '—'} kcal, cycling ${draft.cyclingCalories || '—'} kcal, total ${getTotalCaloriesBurned(draft) || '—'} kcal
- Today food intake: ${draftFoodCalories || '—'} kcal
- Latest logged food intake: ${
    foodDashboard.latest
      ? `${foodDashboard.latest.total} kcal on ${formatDateFull(foodDashboard.latest.date)}`
      : '—'
  }
- Recent food intake average: ${foodDashboard.recentAverage ?? '—'} kcal
- Highest logged food intake: ${
    foodDashboard.highest
      ? `${foodDashboard.highest.total} kcal on ${formatDateFull(foodDashboard.highest.date)}`
      : '—'
  }
- 7-day average weight: ${formatKg(stats.sevenDayAverage)}
- 14-day average weight: ${formatKg(stats.fourteenDayAverage)}
- Training days in recent 7 logs: ${stats.trainingDaysLast7}/7
- Cardio minutes in recent 7 logs: ${stats.cardioMinutesLast7}
- Cardio distance in recent 7 logs: ${stats.cardioDistanceLast7Label}

Top exercise progression:
${JSON.stringify(exerciseDashboard.progression.slice(0, 8), null, 2)}

Recent logs:
${JSON.stringify(recentLogs, null, 2)}

Give me:
1. What went well in today’s workout
2. What changed compared with the previous comparable workout
3. Which exercises improved, matched best, dropped, or lack enough data
4. Whether today fits the intended weekly Upper/Lower/Rest structure
5. What the scale/cardio trend means without overreacting
6. Whether food intake looks complete enough to judge the day
7. What protein signal is visible from the actual food item names, without pretending certainty
8. What to do in the next workout
9. One hard truth I may be avoiding`
}

export {
  canonicalExerciseName,
  displayExerciseName,
  inferWorkoutTypeFromExercises,
  parseRawWorkoutText,
}

export default App
