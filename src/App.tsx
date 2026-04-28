import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './lib/supabase'
import './App.css'

type Tab = 'today' | 'workout' | 'nutrition' | 'trends' | 'coach'
type WorkoutType = 'Upper' | 'Lower' | 'Cardio' | 'Recovery' | 'Rest' | 'Custom'
type SyncState = 'local' | 'checking' | 'syncing' | 'synced' | 'error'
type AuthMode = 'sign-in' | 'sign-up'

type ExerciseEntry = {
  id: string
  name: string
  weight: string
  unit: 'lbs' | 'kg' | 'bodyweight'
  sets: string
  reps: string
  completedSets: number
}

type MealEntry = {
  id: string
  label: 'Pre-workout' | 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner' | 'Other'
  description: string
  proteinScore: 0 | 1 | 2 | 3
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
  position: number
}

const STORAGE_KEY = 'gymos.logs.v1'

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'today', label: 'Today', icon: '●' },
  { id: 'workout', label: 'Workout', icon: '◐' },
  { id: 'nutrition', label: 'Food', icon: '◒' },
  { id: 'trends', label: 'Trends', icon: '◓' },
  { id: 'coach', label: 'Coach', icon: '◆' },
]

const workoutTemplates: Record<Exclude<WorkoutType, 'Custom' | 'Rest' | 'Recovery' | 'Cardio'>, ExerciseEntry[]> = {
  Upper: [
    makeExercise('Front lat-pulldown', '65', 'lbs', '3', '12'),
    makeExercise('Machine chest press', '40', 'lbs', '3', '12'),
    makeExercise('Seated row', '65', 'lbs', '3', '12'),
    makeExercise('Bicep curl', '15', 'lbs', '3', '12'),
    makeExercise('Hammer curl', '15', 'lbs', '3', '15'),
    makeExercise('Dumbbell lateral raise', '10', 'lbs', '3', '12'),
    makeExercise('Single-arm row', '15', 'lbs', '3', '12'),
  ],
  Lower: [
    makeExercise('Leg curl', '', 'lbs', '3', '15'),
    makeExercise('Leg extension', '', 'lbs', '3', '15'),
    makeExercise('Dumbbell Romanian deadlift', '', 'lbs', '3', '12'),
    makeExercise('Supported squat', '', 'bodyweight', '3', '10'),
    makeExercise('Calf raises', '', 'bodyweight', '3', '18'),
    makeExercise('Plank', '', 'bodyweight', '3', '45 sec'),
  ],
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function makeExercise(
  name = '',
  weight = '',
  unit: ExerciseEntry['unit'] = 'lbs',
  sets = '3',
  reps = '12',
): ExerciseEntry {
  return {
    id: makeId(),
    name,
    weight,
    unit,
    sets,
    reps,
    completedSets: 0,
  }
}

function makeMeal(label: MealEntry['label'], description = ''): MealEntry {
  return {
    id: makeId(),
    label,
    description,
    proteinScore: 1,
  }
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
    workoutType: 'Upper',
    gymTime: '',
    preWorkout: '',
    postGymEnergy: '',
    treadmillDistanceKm: '',
    treadmillMinutes: '',
    treadmillIncline: '6.0',
    notes: '',
    exercises: workoutTemplates.Upper.map((exercise) => ({ ...exercise, id: makeId() })),
    meals: [
      makeMeal('Pre-workout'),
      makeMeal('Lunch'),
      makeMeal('Snack'),
      makeMeal('Dinner'),
    ],
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
  const allowed: WorkoutType[] = ['Upper', 'Lower', 'Cardio', 'Recovery', 'Rest', 'Custom']
  return allowed.includes(value as WorkoutType) ? (value as WorkoutType) : 'Custom'
}

function normaliseExerciseUnit(value: string | null): ExerciseEntry['unit'] {
  if (value === 'kg' || value === 'bodyweight') return value
  return 'lbs'
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
    notes: emptyToNull(log.notes),
    updated_at: new Date().toISOString(),
  }

  if (includeWaistSize) {
    payload.waist_size_cm = toNullableNumber(log.waistSizeCm)
  }

  return payload
}

function mapCloudRowsToLogs(dailyRows: DailyLogRow[], exerciseRows: ExerciseRow[], mealRows: MealRow[]) {
  return dailyRows.map((row) => {
    const exercises = exerciseRows
      .filter((exercise) => exercise.daily_log_id === row.id)
      .sort((a, b) => a.position - b.position)
      .map((exercise) => ({
        id: exercise.id,
        name: exercise.exercise_name,
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
      }))

    return {
      id: row.id,
      date: row.log_date,
      weightKg: row.weight_kg === null ? '' : String(row.weight_kg),
      waistSizeCm: row.waist_size_cm === null ? '' : String(row.waist_size_cm),
      sleepHours: row.sleep_hours === null ? '' : String(row.sleep_hours),
      workoutType: normaliseWorkoutType(row.workout_type),
      gymTime: row.gym_time ?? '',
      preWorkout: row.pre_workout ?? '',
      postGymEnergy: row.post_gym_energy === null ? '' : String(row.post_gym_energy),
      treadmillDistanceKm: row.treadmill_distance_km === null ? '' : String(row.treadmill_distance_km),
      treadmillMinutes: row.treadmill_minutes === null ? '' : String(row.treadmill_minutes),
      treadmillIncline: row.treadmill_incline === null ? '' : String(row.treadmill_incline),
      notes: row.notes ?? '',
      exercises,
      meals,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies DailyLog
  })
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

  const [{ data: exerciseRows, error: exerciseError }, { data: mealRows, error: mealError }] =
    await Promise.all([
      client.from('exercise_entries').select('*').in('daily_log_id', ids).order('position', { ascending: true }),
      client.from('meal_entries').select('*').in('daily_log_id', ids).order('position', { ascending: true }),
    ])

  if (exerciseError) throw exerciseError
  if (mealError) throw mealError

  return sortLogs(mapCloudRowsToLogs(rows, (exerciseRows ?? []) as ExerciseRow[], (mealRows ?? []) as MealRow[]))
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
    const { error } = await db.from('meal_entries').insert(
      log.meals.map((meal, index) => ({
        id: isUuid(meal.id) ? meal.id : makeId(),
        daily_log_id: cloudLogId,
        label: meal.label,
        description: emptyToNull(meal.description),
        protein_score: meal.proteinScore,
        position: index,
      })),
    )

    if (error) throw error
  }

  return {
    ...log,
    id: cloudLogId,
    createdAt: savedRow.created_at,
    updatedAt: savedRow.updated_at,
  }
}

function normaliseImportedLog(item: unknown): DailyLog {
  if (!item || typeof item !== 'object') {
    throw new Error('Import failed: every item must be an object.')
  }

  const source = item as Partial<DailyLog> & Record<string, unknown>
  const date = typeof source.date === 'string' ? source.date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Import failed: every log needs a date in YYYY-MM-DD format.')
  }

  const base = createEmptyLog(date)
  const exercises = Array.isArray(source.exercises)
    ? source.exercises.map((exercise) => {
        const entry = exercise as Partial<ExerciseEntry>
        return {
          id: typeof entry.id === 'string' ? entry.id : makeId(),
          name: typeof entry.name === 'string' ? entry.name : '',
          weight: typeof entry.weight === 'string' ? entry.weight : '',
          unit: normaliseExerciseUnit(typeof entry.unit === 'string' ? entry.unit : null),
          sets: typeof entry.sets === 'string' ? entry.sets : '',
          reps: typeof entry.reps === 'string' ? entry.reps : '',
          completedSets: typeof entry.completedSets === 'number' ? entry.completedSets : 0,
        }
      })
    : []

  const meals = Array.isArray(source.meals)
    ? source.meals.map((meal) => {
        const entry = meal as Partial<MealEntry>
        return {
          id: typeof entry.id === 'string' ? entry.id : makeId(),
          label: normaliseMealLabel(typeof entry.label === 'string' ? entry.label : 'Other'),
          description: typeof entry.description === 'string' ? entry.description : '',
          proteinScore: typeof entry.proteinScore === 'number'
            ? (Math.min(Math.max(entry.proteinScore, 0), 3) as MealEntry['proteinScore'])
            : 1,
        }
      })
    : []

  return {
    ...base,
    id: typeof source.id === 'string' ? source.id : base.id,
    weightKg: typeof source.weightKg === 'string' ? source.weightKg : source.weightKg == null ? '' : String(source.weightKg),
    waistSizeCm: typeof source.waistSizeCm === 'string' ? source.waistSizeCm : source.waistSizeCm == null ? '' : String(source.waistSizeCm),
    sleepHours: typeof source.sleepHours === 'string' ? source.sleepHours : source.sleepHours == null ? '' : String(source.sleepHours),
    workoutType: normaliseWorkoutType(typeof source.workoutType === 'string' ? source.workoutType : null),
    gymTime: typeof source.gymTime === 'string' ? source.gymTime : '',
    preWorkout: typeof source.preWorkout === 'string' ? source.preWorkout : '',
    postGymEnergy: typeof source.postGymEnergy === 'string' ? source.postGymEnergy : source.postGymEnergy == null ? '' : String(source.postGymEnergy),
    treadmillDistanceKm: typeof source.treadmillDistanceKm === 'string' ? source.treadmillDistanceKm : source.treadmillDistanceKm == null ? '' : String(source.treadmillDistanceKm),
    treadmillMinutes: typeof source.treadmillMinutes === 'string' ? source.treadmillMinutes : source.treadmillMinutes == null ? '' : String(source.treadmillMinutes),
    treadmillIncline: typeof source.treadmillIncline === 'string' ? source.treadmillIncline : source.treadmillIncline == null ? '' : String(source.treadmillIncline),
    notes: typeof source.notes === 'string' ? source.notes : '',
    exercises,
    meals,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : base.createdAt,
    updatedAt: new Date().toISOString(),
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [logs, setLogs] = useState<DailyLog[]>(loadLogs)
  const [activeDate, setActiveDate] = useState(toInputDate(new Date()))
  const [draft, setDraft] = useState<DailyLog>(() => createEmptyLog())
  const [coachQuestion, setCoachQuestion] = useState('Why am I tired after gym and what should I change tomorrow?')
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [session, setSession] = useState<Session | null>(null)
  const [syncState, setSyncState] = useState<SyncState>(isSupabaseConfigured ? 'checking' : 'local')
  const [syncError, setSyncError] = useState('')
  const [forceLocalMode, setForceLocalMode] = useState(false)

  const user = session?.user ?? null
  const cloudMode = Boolean(isSupabaseConfigured && user && !forceLocalMode)

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

  function loadTemplate(type: WorkoutType) {
    updateDraft('workoutType', type)
    if (type === 'Upper' || type === 'Lower') {
      updateDraft(
        'exercises',
        workoutTemplates[type].map((exercise) => ({ ...exercise, id: makeId(), completedSets: 0 })),
      )
    }
    if (type === 'Cardio' || type === 'Rest' || type === 'Recovery') {
      updateDraft('exercises', [])
    }
  }

  function updateExercise(id: string, patch: Partial<ExerciseEntry>) {
    updateDraft(
      'exercises',
      draft.exercises.map((exercise) => (exercise.id === id ? { ...exercise, ...patch } : exercise)),
    )
  }

  function updateMeal(id: string, patch: Partial<MealEntry>) {
    updateDraft('meals', draft.meals.map((meal) => (meal.id === id ? { ...meal, ...patch } : meal)))
  }

  function addExercise() {
    updateDraft('exercises', [...draft.exercises, makeExercise('New exercise')])
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

  function removeMeal(id: string) {
    updateDraft(
      'meals',
      draft.meals.filter((meal) => meal.id !== id),
    )
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

        <section className="mobile-tabs" aria-label="Mobile navigation">
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
        </section>

        {activeTab === 'today' && (
          <TodayView draft={draft} logs={logs} stats={stats} updateDraft={updateDraft} setActiveTab={setActiveTab} />
        )}

        {activeTab === 'workout' && (
          <WorkoutView
            draft={draft}
            logs={logs}
            loadTemplate={loadTemplate}
            updateDraft={updateDraft}
            updateExercise={updateExercise}
            addExercise={addExercise}
            removeExercise={removeExercise}
          />
        )}

        {activeTab === 'nutrition' && (
          <NutritionView
            draft={draft}
            updateDraft={updateDraft}
            updateMeal={updateMeal}
            addMeal={addMeal}
            removeMeal={removeMeal}
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
          />
        )}
      </section>
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
  const workoutSummary = draft.exercises.length
    ? `${draft.exercises.length} exercises · ${draft.treadmillDistanceKm || '—'} km treadmill`
    : 'No workout details saved yet'

  return (
    <div className="today-layout">
      <section className="command-card">
        <div className="command-content">
          <p className="eyebrow">Today’s command centre</p>
          <h3>{nextWorkout.headline}</h3>
          <p>{nextWorkout.reason}</p>
          <div className="command-actions">
            <button className="primary-button" type="button" onClick={() => setActiveTab('workout')}>
              {draft.exercises.length ? 'Open workout' : 'Start workout'}
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
          <strong>{draft.workoutType}</strong>
          <span>{workoutSummary}</span>
        </article>
        <article className="metric-card">
          <p>Cardio last 7</p>
          <strong>{stats.cardioMinutesLast7} min</strong>
          <span>{stats.cardioDistanceLast7Label} logged distance</span>
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
  loadTemplate,
  updateDraft,
  updateExercise,
  addExercise,
  removeExercise,
}: {
  draft: DailyLog
  logs: DailyLog[]
  loadTemplate: (type: WorkoutType) => void
  updateDraft: <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => void
  updateExercise: (id: string, patch: Partial<ExerciseEntry>) => void
  addExercise: () => void
  removeExercise: (id: string) => void
}) {
  const [selectedWorkoutType, setSelectedWorkoutType] = useState<WorkoutType>(draft.workoutType)

  useEffect(() => {
    setSelectedWorkoutType(draft.workoutType)
  }, [draft.date, draft.workoutType])

  const isViewingSavedType = selectedWorkoutType === draft.workoutType
  const visibleExercises = isViewingSavedType ? draft.exercises : []
  const exerciseHistory = useMemo(() => buildExerciseHistory(logs, draft.date), [logs, draft.date])
  const frequentExercises = useMemo(() => getFrequentExercises(logs), [logs])
  const previousWorkout = useMemo(() => getLastWorkout(logs, draft.date), [logs, draft.date])

  function addFrequentExercise(name: string) {
    const canonical = canonicalExerciseName(name)
    const history = exerciseHistory.get(canonical)

    const nextExercise = history
      ? makeExercise(name, history.lastPatch.weight, history.lastPatch.unit, history.lastPatch.sets, history.lastPatch.reps)
      : makeExercise(name)

    updateDraft('exercises', [...draft.exercises, nextExercise])
  }

  function copyPreviousWorkout() {
    if (!previousWorkout) return

    const confirmed = window.confirm(
      `Copy ${previousWorkout.workoutType} workout from ${formatDateShort(previousWorkout.date)} into this date? This replaces the current exercises.`,
    )

    if (!confirmed) return

    updateDraft('workoutType', previousWorkout.workoutType)
    setSelectedWorkoutType(previousWorkout.workoutType)
    updateDraft(
      'exercises',
      previousWorkout.exercises.map((exercise) => ({
        ...exercise,
        id: makeId(),
        completedSets: 0,
      })),
    )
    updateDraft('treadmillDistanceKm', previousWorkout.treadmillDistanceKm)
    updateDraft('treadmillMinutes', previousWorkout.treadmillMinutes)
    updateDraft('treadmillIncline', previousWorkout.treadmillIncline)
  }

  function applySelectedTemplate() {
    const confirmed = window.confirm("Replace this day with a " + selectedWorkoutType + " template? This will overwrite the current saved workout fields for this date.")
    if (!confirmed) return
    loadTemplate(selectedWorkoutType)
  }

  return (
    <div className="view-grid">
      <section className="panel span-2">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Training plan</p>
            <h3>Workout builder</h3>
          </div>
          <div className="workout-header-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={copyPreviousWorkout}
              disabled={!previousWorkout || !isViewingSavedType}
            >
              Copy previous
            </button>
            <button className="ghost-button" type="button" onClick={addExercise} disabled={!isViewingSavedType}>
              Add exercise
            </button>
          </div>
        </div>

        <div className="template-row">
          {(['Upper', 'Lower', 'Cardio', 'Recovery', 'Rest', 'Custom'] as WorkoutType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={selectedWorkoutType === type ? 'chip active' : 'chip'}
              onClick={() => setSelectedWorkoutType(type)}
            >
              {type}
            </button>
          ))}
        </div>
        <p className="helper-copy tight">
          These chips are now a view selector first. They will not overwrite a saved day unless you explicitly apply a template.
        </p>
        {isViewingSavedType && frequentExercises.length > 0 && (
          <div className="frequent-exercise-panel">
            <div>
              <p className="eyebrow">Quick add</p>
              <h4>Frequent exercises</h4>
            </div>
            <div className="frequent-exercise-row">
              {frequentExercises.map((exercise) => (
                <button
                  key={canonicalExerciseName(exercise.displayName)}
                  className="frequent-exercise-chip"
                  type="button"
                  onClick={() => addFrequentExercise(exercise.displayName)}
                >
                  <strong>{exercise.displayName}</strong>
                  <span>{exercise.count}× · last {formatDateShort(exercise.latestDate)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel span-2 form-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Strength work</p>
            <h3>{selectedWorkoutType} exercises</h3>
          </div>
          <span className="status-pill">{visibleExercises.length} items</span>
        </div>

        {!isViewingSavedType && (
          <div className="empty-state action-state">
            <strong>No {selectedWorkoutType} data is saved for {new Date(`${draft.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.</strong>
            <span>
              The saved log for this date is marked as {draft.workoutType}. Switching views no longer mutates your real data.
            </span>
            <button className="ghost-button" type="button" onClick={applySelectedTemplate}>
              Replace this day with a {selectedWorkoutType} template
            </button>
          </div>
        )}

        {isViewingSavedType && (
          <div className="exercise-list">
            {visibleExercises.length === 0 && (
              <div className="empty-state">No strength exercises for this day. Add cardio, recovery guidance, or a custom exercise.</div>
            )}

            {visibleExercises.map((exercise) => {
              const history = exerciseHistory.get(canonicalExerciseName(exercise.name))
              return (
              <article className="exercise-card" key={exercise.id}>
                <div className="exercise-main">
                  <input
                    aria-label="Exercise name"
                    className="exercise-name"
                    value={exercise.name}
                    onChange={(event) => updateExercise(exercise.id, { name: event.target.value })}
                  />
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
                      onChange={(event) => updateExercise(exercise.id, { unit: event.target.value as ExerciseEntry['unit'] })}
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

                <div className="set-dots" aria-label="Completed sets">
                  {Array.from({ length: Math.max(Number(exercise.sets) || 0, 1) }).map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={index < exercise.completedSets ? 'done' : ''}
                      onClick={() => updateExercise(exercise.id, { completedSets: index + 1 === exercise.completedSets ? index : index + 1 })}
                      aria-label={`Mark set ${index + 1}`}
                    />
                  ))}
                </div>

                <button className="danger-button" type="button" onClick={() => removeExercise(exercise.id)}>
                  Remove
                </button>
              </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="panel span-2 form-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Always after weights</p>
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
    </div>
  )
}

function NutritionView({
  draft,
  updateDraft,
  updateMeal,
  addMeal,
  removeMeal,
}: {
  draft: DailyLog
  updateDraft: <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => void
  updateMeal: (id: string, patch: Partial<MealEntry>) => void
  addMeal: () => void
  removeMeal: (id: string) => void
}) {
  return (
    <div className="view-grid">
      <section className="panel span-2 form-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fuel</p>
            <h3>Nutrition log</h3>
          </div>
          <button className="ghost-button" type="button" onClick={addMeal}>
            Add meal
          </button>
        </div>

        <label>
          Pre-workout food
          <textarea
            placeholder="2 bananas + latte, or eggs + bread + banana"
            value={draft.preWorkout}
            onChange={(event) => updateDraft('preWorkout', event.target.value)}
          />
        </label>

        <div className="meal-list">
          {draft.meals.map((meal) => (
            <article className="meal-card" key={meal.id}>
              <select
                aria-label="Meal label"
                value={meal.label}
                onChange={(event) => updateMeal(meal.id, { label: event.target.value as MealEntry['label'] })}
              >
                <option>Pre-workout</option>
                <option>Breakfast</option>
                <option>Lunch</option>
                <option>Snack</option>
                <option>Dinner</option>
                <option>Other</option>
              </select>
              <textarea
                aria-label="Meal description"
                placeholder="black chickpeas + chapati + dal + rice + salad"
                value={meal.description}
                onChange={(event) => updateMeal(meal.id, { description: event.target.value })}
              />
              <div className="meal-footer">
                <label>
                  Protein quality
                  <select
                    value={meal.proteinScore}
                    onChange={(event) => updateMeal(meal.id, { proteinScore: Number(event.target.value) as MealEntry['proteinScore'] })}
                  >
                    <option value={0}>0 - weak</option>
                    <option value={1}>1 - light</option>
                    <option value={2}>2 - decent</option>
                    <option value={3}>3 - strong</option>
                  </select>
                </label>
                <button className="danger-button" type="button" onClick={() => removeMeal(meal.id)}>
                  Remove
                </button>
              </div>
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
  const splitCounts = useMemo(() => buildSplitCounts(logs), [logs])
  const cardioStats = useMemo(() => buildCardioDashboard(logs), [logs])
  const coverage = useMemo(() => buildDataCoverage(logs), [logs])
  const heatmap = useMemo(() => buildConsistencyHeatmap(logs), [logs])

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
            <p className="eyebrow">Consistency</p>
            <h3>8-week training heatmap</h3>
          </div>
          <span className="status-pill">{heatmap.filter((day) => day.level > 0).length} active days</span>
        </div>
        <div className="heatmap-grid" aria-label="Workout consistency heatmap">
          {heatmap.map((day) => (
            <span
              className={`heat-cell level-${day.level} ${day.type.toLowerCase()}`}
              key={day.date}
              title={`${formatDateShort(day.date)} · ${day.type}`}
            />
          ))}
        </div>
        <div className="coverage-grid">
          <article>
            <span>Weight coverage</span>
            <strong>{coverage.weightLogged}/{coverage.total}</strong>
          </article>
          <article>
            <span>Waist coverage</span>
            <strong>{coverage.waistLogged}/{coverage.total}</strong>
          </article>
          <article>
            <span>Cardio coverage</span>
            <strong>{coverage.cardioLogged}/{coverage.total}</strong>
          </article>
          <article>
            <span>Food coverage</span>
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
            <p className="eyebrow">Training intelligence</p>
            <h3>Patterns from repeated exercises</h3>
          </div>
        </div>

        <div className="analysis-grid">
          <article className="analysis-card">
            <span>Split balance</span>
            <strong>{splitCounts.summary}</strong>
            <p>Upper {splitCounts.Upper} · Lower {splitCounts.Lower} · Cardio {splitCounts.Cardio} · Rest {splitCounts.Rest}</p>
          </article>
          <article className="analysis-card">
            <span>Cardio best</span>
            <strong>{cardioStats.bestDistanceLabel}</strong>
            <p>Longest duration: {cardioStats.bestDurationLabel}; latest logged: {cardioStats.latestLabel}</p>
          </article>
          <article className="analysis-card">
            <span>Volume leaders</span>
            <strong>{exerciseDashboard.volumeLeaders[0]?.name ?? '—'}</strong>
            <p>{exerciseDashboard.volumeLeaders.slice(0, 4).map((item) => `${item.name} ${item.volumeLabel}`).join(' · ') || 'Need more weighted entries.'}</p>
          </article>
        </div>
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
}: {
  coachInsight: string[]
  coachPrompt: string
  coachQuestion: string
  copyCoachPrompt: () => Promise<void>
  copyState: 'idle' | 'copied'
  setCoachQuestion: (question: string) => void
}) {
  return (
    <div className="view-grid">
      <section className="panel span-2 coach-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AI layer placeholder</p>
            <h3>Coach prompt builder</h3>
          </div>
          <button className="primary-button" type="button" onClick={copyCoachPrompt}>
            {copyState === 'copied' ? 'Copied' : 'Copy prompt'}
          </button>
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
          Prompt that will later go to the backend AI function
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
  return sortLogs(logs).find((log) => log.date !== beforeDate && hasWorkoutData(log)) ?? null
}

function getFrequentExercises(logs: DailyLog[], limit = 12) {
  const counts = new Map<
    string,
    {
      displayName: string
      count: number
      latestDate: string
      latestExercise: ExerciseEntry
    }
  >()

  for (const log of logs) {
    for (const exercise of log.exercises) {
      const canonical = canonicalExerciseName(exercise.name)
      if (!canonical) continue

      const existing = counts.get(canonical)
      if (!existing) {
        counts.set(canonical, {
          displayName: exercise.name,
          count: 1,
          latestDate: log.date,
          latestExercise: exercise,
        })
        continue
      }

      existing.count += 1

      if (log.date > existing.latestDate) {
        existing.latestDate = log.date
        existing.displayName = exercise.name
        existing.latestExercise = exercise
      }
    }
  }

  return [...counts.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.latestDate.localeCompare(a.latestDate)
    })
    .slice(0, limit)
}

function getNextWorkoutRecommendation(logs: DailyLog[], draft: DailyLog) {
  const recent = sortLogs(logs).filter(hasWorkoutData)
  const last = recent.find((log) => log.date !== draft.date)
  const recentTypes = recent.slice(0, 3).map((log) => log.workoutType)

  if (draft.exercises.length) {
    return {
      headline: `${draft.workoutType} is already loaded`,
      reason: 'Open the workout, check previous performance, then save only what actually happened.',
    }
  }

  if (!last) {
    return {
      headline: 'Start with a clean Upper day',
      reason: 'You have no previous workout in this account yet. Log one solid session before chasing advanced analytics.',
    }
  }

  if (recentTypes.filter((type) => type === 'Upper').length >= 2) {
    return {
      headline: 'Bias today towards Lower body',
      reason: 'Your recent logs lean upper-heavy. Balance matters if you want body recomposition, not just arm/chest repetition.',
    }
  }

  if (last.workoutType === 'Lower') {
    return {
      headline: 'Upper day makes sense next',
      reason: `Last saved workout was Lower on ${formatDateShort(last.date)}. Rotate rather than randomly adding more volume.`,
    }
  }

  return {
    headline: 'Lower or recovery should be considered',
    reason: `Last saved workout was ${last.workoutType} on ${formatDateShort(last.date)}. Do not let upper-body habits run the programme.`,
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

function buildDataCoverage(logs: DailyLog[]) {
  const total = logs.length
  return {
    total,
    weightLogged: logs.filter((log) => safeNumber(log.weightKg) !== null).length,
    waistLogged: logs.filter((log) => safeNumber(log.waistSizeCm) !== null).length,
    cardioLogged: logs.filter((log) => safeNumber(log.treadmillDistanceKm) !== null || parseDurationToMinutes(log.treadmillMinutes) !== null).length,
    foodLogged: logs.filter((log) => log.meals.some((meal) => meal.description.trim())).length,
  }
}

function buildExerciseHistory(logs: DailyLog[], currentDate: string) {
  const history = new Map<string, { lastLabel: string; bestLabel: string; lastPatch: Partial<ExerciseEntry> }>()
  const byName = new Map<string, Array<{ date: string; exercise: ExerciseEntry; weight: number | null; volume: number | null }>>()

  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (log.date >= currentDate) continue
    for (const exercise of log.exercises) {
      const name = canonicalExerciseName(exercise.name)
      const weight = firstNumber(exercise.weight)
      const sets = firstNumber(exercise.sets)
      const reps = firstNumber(exercise.reps)
      const volume = weight !== null && sets !== null && reps !== null ? weight * sets * reps : null
      const items = byName.get(name) ?? []
      items.push({ date: log.date, exercise, weight, volume })
      byName.set(name, items)
    }
  }

  for (const [name, entries] of byName) {
    const last = entries[entries.length - 1]
    const best = entries.reduce<typeof entries[number] | null>((winner, item) => {
      if (!winner) return item
      if ((item.volume ?? item.weight ?? 0) > (winner.volume ?? winner.weight ?? 0)) return item
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
    })
  }

  return history
}

function buildConsistencyHeatmap(logs: DailyLog[]) {
  const sorted = sortLogs(logs)
  const latestDate = sorted[0]?.date ?? toInputDate(new Date())
  const latest = new Date(`${latestDate}T00:00:00`)
  const start = new Date(latest)
  start.setDate(latest.getDate() - 55)

  return Array.from({ length: 56 }).map((_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const iso = toInputDate(date)
    const log = logs.find((item) => item.date === iso)
    return {
      date: iso,
      level: log && hasWorkoutData(log) ? Math.min(3, Math.max(1, log.exercises.length > 6 ? 3 : log.exercises.length > 2 ? 2 : 1)) : 0,
      type: log?.workoutType ?? 'Rest',
    }
  })
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function canonicalExerciseName(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/^machine\s+/g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.includes('lat pulldown') || cleaned.includes('lat pull down')) return 'Lat pulldown'
  if (cleaned.includes('chest press')) return 'Chest press'
  if (cleaned.includes('seated row')) return 'Seated row'
  if (cleaned.includes('single arm row')) return 'Single-arm row'
  if (cleaned.includes('bicep')) return 'Bicep curl'
  if (cleaned.includes('hammer')) return 'Hammer curl'
  if (cleaned.includes('lateral raise')) return 'Lateral raise'
  if (cleaned.includes('triceps pushdown')) return 'Triceps pushdown'
  if (cleaned.includes('triceps extension')) return 'Triceps extension'
  if (cleaned.includes('shoulder press')) return 'Shoulder press'
  if (cleaned.includes('shoulder shrug')) return 'Shoulder shrug'
  if (cleaned.includes('leg curl')) return 'Leg curl'
  if (cleaned.includes('leg extension')) return 'Leg extension'
  if (cleaned.includes('romanian deadlift')) return 'Romanian deadlift'
  if (cleaned.includes('reverse lunge')) return 'Reverse lunge'
  if (cleaned.includes('calf')) return 'Calf raise'
  if (cleaned.includes('squat')) return 'Squat'
  if (cleaned.includes('plank')) return 'Plank'

  return titleCase(cleaned || 'Unnamed exercise')
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

function buildExerciseDashboard(logs: DailyLog[]) {
  const byExercise = new Map<string, Array<{ date: string; exercise: ExerciseEntry; weight: number | null; volume: number | null }>>()

  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const exercise of log.exercises) {
      const name = canonicalExerciseName(exercise.name)
      const weight = firstNumber(exercise.weight)
      const sets = firstNumber(exercise.sets)
      const reps = firstNumber(exercise.reps)
      const volume = weight !== null && weight > 0 && sets !== null && reps !== null ? weight * sets * reps : null
      const items = byExercise.get(name) ?? []
      items.push({ date: log.date, exercise, weight, volume })
      byExercise.set(name, items)
    }
  }

  const progression = [...byExercise.entries()]
    .filter(([, entries]) => entries.length >= 2)
    .map(([name, entries]) => {
      const first = entries[0]
      const latest = entries[entries.length - 1]
      const weighted = entries.filter((entry) => entry.weight !== null)
      const best = weighted.reduce<typeof weighted[number] | null>((winner, entry) => {
        if (!winner) return entry
        return (entry.weight ?? 0) > (winner.weight ?? 0) ? entry : winner
      }, null)
      const firstWeight = first.weight
      const latestWeight = latest.weight
      const delta = firstWeight !== null && latestWeight !== null ? latestWeight - firstWeight : null

      return {
        name,
        sessions: entries.length,
        firstLabel: formatExerciseEntry(first.exercise),
        latestLabel: formatExerciseEntry(latest.exercise),
        bestLabel: best ? formatLoad(best.weight, best.exercise.unit) : '—',
        deltaLabel:
          delta === null
            ? 'Track load consistently to see direction.'
            : delta > 0
              ? `Up ${delta.toFixed(delta % 1 === 0 ? 0 : 1)} ${latest.exercise.unit || 'lbs'} since first log.`
              : delta < 0
                ? `Down ${Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)} ${latest.exercise.unit || 'lbs'} since first log.`
                : 'Load is flat; look for rep quality, form, or volume improvements.',
      }
    })
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))

  const volumeLeaders = [...byExercise.entries()]
    .map(([name, entries]) => ({
      name,
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
  const trainingDaysLast7 = last7.filter((log) => log.workoutType !== 'Rest' && (log.exercises.length || log.treadmillMinutes)).length
  const cardioMinutesLast7 = last7.reduce((sum, log) => sum + (parseDurationToMinutes(log.treadmillMinutes) ?? 0), 0)
  const cardioDistanceLast7 = last7.reduce((sum, log) => sum + (safeNumber(log.treadmillDistanceKm) ?? 0), 0)
  const energyValues = last7.map((log) => safeNumber(log.postGymEnergy)).filter((value): value is number => value !== null)
  const averageEnergy = average(energyValues)

  return {
    sevenDayAverage,
    latestWeightLabel: latestWeight === null ? "No weigh-in" : latestWeight.toFixed(1) + " kg",
    fourteenDayAverage,
    trainingDaysLast7,
    cardioMinutesLast7: Math.round(cardioMinutesLast7),
    cardioDistanceLast7Label: cardioDistanceLast7.toFixed(2) + " km",
    averageEnergy,
    weightDeltaText:
      delta === null
        ? 'Need more weigh-ins'
        : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg vs recent log`,
  }
}

function buildCoachInsight(draft: DailyLog, stats: ReturnType<typeof buildStats>) {
  const insights: string[] = []
  const sleep = safeNumber(draft.sleepHours)
  const hasPreWorkoutProtein = /egg|yoghurt|curd|milk|paneer|chicken|protein/i.test(`${draft.preWorkout} ${draft.meals.map((meal) => meal.description).join(' ')}`)

  if (!draft.weightKg) insights.push('You have not logged weight yet. Without the weigh-in, the trend view is blind.')
  if (sleep !== null && sleep < 7) insights.push('Sleep is under 7 hours. Do not pretend food alone will fix poor recovery.')
  if (!hasPreWorkoutProtein) insights.push('Your pre/post workout food looks protein-light. Add eggs, yoghurt/curd, milk, paneer, chicken, or a proper protein source.')
  if (draft.exercises.length > 7) insights.push('This session is getting long. More exercises are not automatically more progress.')
  if (stats.sevenDayAverage === null) insights.push('Save at least 7 weigh-ins before drawing conclusions from the scale.')
  if (!insights.length) insights.push('Today looks structurally fine. The next improvement is consistency and progressive overload, not random changes.')

  return insights
}

function buildCoachPrompt(draft: DailyLog, logs: DailyLog[], question: string) {
  const stats = buildStats(logs)
  const recentLogs = sortLogs(logs).slice(0, 14).map((log) => ({
    date: log.date,
    weightKg: log.weightKg || null,
    waistSizeCm: log.waistSizeCm || null,
    workoutType: log.workoutType,
    treadmillMinutes: log.treadmillMinutes || null,
  }))

  return `You are my direct fitness analyst. Be practical, blunt, and evidence-based.

Goal: body recomposition, fat loss, better gym consistency, maintain or gain strength.

Question: ${question}

Today’s log:
${JSON.stringify(draft, null, 2)}

Recent trend summary:
- 7-day average weight: ${formatKg(stats.sevenDayAverage)}
- 14-day average weight: ${formatKg(stats.fourteenDayAverage)}
- Training days in recent 7 logs: ${stats.trainingDaysLast7}/7
- Cardio minutes in recent 7 logs: ${stats.cardioMinutesLast7}

Recent logs:
${JSON.stringify(recentLogs, null, 2)}

Give me:
1. What went well today
2. What is weak or missing
3. Likely reason for fatigue or scale movement
4. Food correction for tomorrow
5. Next workout recommendation
6. One hard truth I may be avoiding`
}

export default App
