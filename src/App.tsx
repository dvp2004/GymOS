import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Tab = 'today' | 'workout' | 'nutrition' | 'trends' | 'coach'
type WorkoutType = 'Upper' | 'Lower' | 'Cardio' | 'Recovery' | 'Rest' | 'Custom'

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

type Metric = {
  label: string
  value: string
  detail: string
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

function safeNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function loadLogs(): DailyLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DailyLog[]
    return Array.isArray(parsed) ? parsed : []
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

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [logs, setLogs] = useState<DailyLog[]>(loadLogs)
  const [activeDate, setActiveDate] = useState(toInputDate(new Date()))
  const [draft, setDraft] = useState<DailyLog>(() => createEmptyLog())
  const [coachQuestion, setCoachQuestion] = useState('Why am I tired after gym and what should I change tomorrow?')
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

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

  function saveDraft() {
    const savedDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      createdAt: draft.createdAt || new Date().toISOString(),
    }

    setLogs((current) => sortLogs([savedDraft, ...current.filter((log) => log.date !== savedDraft.date)]))
    setSaveState('saved')
    window.setTimeout(() => setSaveState('idle'), 1600)
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

        <div className="sync-card">
          <p className="eyebrow">Storage mode</p>
          <strong>Local-first prototype</strong>
          <span>Saved in this browser. Supabase sync is the next build step.</span>
        </div>
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
            <button className="primary-button" type="button" onClick={saveDraft}>
              {saveState === 'saved' ? 'Saved' : 'Save log'}
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
          <TodayView draft={draft} stats={stats} updateDraft={updateDraft} setActiveTab={setActiveTab} />
        )}

        {activeTab === 'workout' && (
          <WorkoutView
            draft={draft}
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

        {activeTab === 'trends' && <TrendsView logs={logs} stats={stats} />}

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

function TodayView({
  draft,
  stats,
  updateDraft,
  setActiveTab,
}: {
  draft: DailyLog
  stats: ReturnType<typeof buildStats>
  updateDraft: <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => void
  setActiveTab: (tab: Tab) => void
}) {
  const metrics: Metric[] = [
    { label: 'Today', value: draft.weightKg ? `${draft.weightKg} kg` : 'No weigh-in', detail: 'Log first, judge trend later' },
    { label: '7-day avg', value: formatKg(stats.sevenDayAverage), detail: stats.weightDeltaText },
    { label: 'Gym streak', value: `${stats.trainingDaysLast7}/7`, detail: 'Days with training logged' },
    { label: 'Post-gym energy', value: draft.postGymEnergy ? `${draft.postGymEnergy}/10` : '—', detail: 'Fatigue signal, not decoration' },
  ]

  return (
    <div className="view-grid">
      <section className="hero-card panel span-2">
        <div>
          <p className="eyebrow">Today’s command centre</p>
          <h3>Track the day before you ask the scale for meaning.</h3>
          <p>
            Your job is simple: enter the facts cleanly. The app will handle trends, progression, and the coach prompt.
          </p>
        </div>
        <div className="orbital-stat">
          <strong>{draft.workoutType}</strong>
          <span>{draft.exercises.length} exercises planned</span>
        </div>
      </section>

      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <p>{metric.label}</p>
          <strong>{metric.value}</strong>
          <span>{metric.detail}</span>
        </article>
      ))}

      <section className="panel span-2 form-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Daily log</p>
            <h3>Core inputs</h3>
          </div>
          <button className="ghost-button" type="button" onClick={() => setActiveTab('coach')}>
            Ask coach
          </button>
        </div>

        <div className="form-grid">
          <label>
            Weight check-in
            <input
              inputMode="decimal"
              placeholder="92.0"
              value={draft.weightKg}
              onChange={(event) => updateDraft('weightKg', event.target.value)}
            />
          </label>
          <label>
            Sleep hours
            <input
              inputMode="decimal"
              placeholder="7.0"
              value={draft.sleepHours}
              onChange={(event) => updateDraft('sleepHours', event.target.value)}
            />
          </label>
          <label>
            Gym time
            <input
              placeholder="10:15-11:45"
              value={draft.gymTime}
              onChange={(event) => updateDraft('gymTime', event.target.value)}
            />
          </label>
          <label>
            Post-gym energy /10
            <input
              inputMode="numeric"
              placeholder="3"
              value={draft.postGymEnergy}
              onChange={(event) => updateDraft('postGymEnergy', event.target.value)}
            />
          </label>
        </div>

        <label>
          Notes / doubts for today
          <textarea
            placeholder="Why is weight up? Felt lazy after gym. Need better pre-workout food."
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
  loadTemplate,
  updateDraft,
  updateExercise,
  addExercise,
  removeExercise,
}: {
  draft: DailyLog
  loadTemplate: (type: WorkoutType) => void
  updateDraft: <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => void
  updateExercise: (id: string, patch: Partial<ExerciseEntry>) => void
  addExercise: () => void
  removeExercise: (id: string) => void
}) {
  return (
    <div className="view-grid">
      <section className="panel span-2">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Training plan</p>
            <h3>Workout builder</h3>
          </div>
          <button className="ghost-button" type="button" onClick={addExercise}>
            Add exercise
          </button>
        </div>

        <div className="template-row">
          {(['Upper', 'Lower', 'Cardio', 'Recovery', 'Rest', 'Custom'] as WorkoutType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={draft.workoutType === type ? 'chip active' : 'chip'}
              onClick={() => loadTemplate(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      <section className="panel span-2 form-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Strength work</p>
            <h3>Exercises</h3>
          </div>
          <span className="status-pill">{draft.exercises.length} items</span>
        </div>

        <div className="exercise-list">
          {draft.exercises.length === 0 && (
            <div className="empty-state">No strength exercises for this day. Add cardio, recovery guidance, or a custom exercise.</div>
          )}

          {draft.exercises.map((exercise) => (
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
          ))}
        </div>
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

function TrendsView({ logs, stats }: { logs: DailyLog[]; stats: ReturnType<typeof buildStats> }) {
  const sorted = sortLogs(logs)

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
            <span>Cardio last 7</span>
            <strong>{stats.cardioMinutesLast7} min</strong>
          </div>
          <div>
            <span>Avg energy</span>
            <strong>{stats.averageEnergy === null ? '—' : `${stats.averageEnergy.toFixed(1)}/10`}</strong>
          </div>
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
          {sorted.slice(0, 14).map((log) => (
            <article className="history-row" key={log.id}>
              <div>
                <strong>{new Date(`${log.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</strong>
                <span>{log.workoutType} · {log.exercises.length} exercises</span>
              </div>
              <div>
                <strong>{log.weightKg ? `${log.weightKg} kg` : '—'}</strong>
                <span>Energy {log.postGymEnergy || '—'}/10</span>
              </div>
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
  const cardioMinutesLast7 = last7.reduce((sum, log) => sum + (safeNumber(log.treadmillMinutes.replace(':', '.')) ?? 0), 0)
  const energyValues = last7.map((log) => safeNumber(log.postGymEnergy)).filter((value): value is number => value !== null)
  const averageEnergy = average(energyValues)

  return {
    sevenDayAverage,
    fourteenDayAverage,
    trainingDaysLast7,
    cardioMinutesLast7: Math.round(cardioMinutesLast7),
    averageEnergy,
    weightDeltaText:
      delta === null
        ? 'Need more weigh-ins'
        : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg vs recent log`,
  }
}

function buildCoachInsight(draft: DailyLog, stats: ReturnType<typeof buildStats>) {
  const insights: string[] = []
  const energy = safeNumber(draft.postGymEnergy)
  const sleep = safeNumber(draft.sleepHours)
  const hasPreWorkoutProtein = /egg|yoghurt|curd|milk|paneer|chicken|protein/i.test(`${draft.preWorkout} ${draft.meals.map((meal) => meal.description).join(' ')}`)

  if (!draft.weightKg) insights.push('You have not logged weight yet. Without the weigh-in, the trend view is blind.')
  if (energy !== null && energy <= 4) insights.push('Post-gym energy is low. Treat this as a recovery/fuelling problem, not a motivation problem.')
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
    workoutType: log.workoutType,
    treadmillMinutes: log.treadmillMinutes || null,
    postGymEnergy: log.postGymEnergy || null,
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
- Average post-gym energy: ${stats.averageEnergy === null ? 'unknown' : `${stats.averageEnergy.toFixed(1)}/10`}

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
