import { describe, expect, it } from 'vitest'
import {
  canonicalExerciseName,
  displayExerciseName,
  parseRawWorkoutText,
} from './App'

describe('GymOS workout parser', () => {
  it('parses an upper day with machine exercises', () => {
    const parsed = parseRawWorkoutText(`Weight: - kgs
Treadmill:
B. -km, -:00, incline=6.0
Machine Front lat-pulldown (Tricep, Bicep, Lats): 85lbs, 3, 12
Machine Chest Press (Deltoids, Traps & Triceps): 45lbs, 3, 12
Machine Shoulder Press (Deltoids, Traps & Triceps): 30lbs, 3, 12
Machine Triceps Pushdown (Triceps): 20lbs, 3, 12
Machine Seated Row (teres major): 65lbs, 3, 12
Machine Bicep-curl: 20lbs, 3, 12`)

    expect(parsed.workoutType).toBe('Upper')
    expect(parsed.weightKg).toBe('')
    expect(parsed.treadmillIncline).toBe('6.0')
    expect(parsed.exercises).toHaveLength(6)

    expect(parsed.exercises[0]).toMatchObject({
      name: 'Front lat-pulldown',
      weight: '85',
      unit: 'lbs',
      sets: '3',
      reps: '12',
    })

    expect(parsed.exercises[1].name).toBe('Machine chest press')
    expect(parsed.exercises[2].name).toBe('Machine shoulder press')
    expect(parsed.exercises[3].name).toBe('Machine triceps pushdown')
    expect(parsed.exercises[4].name).toBe('Seated row')
    expect(parsed.exercises[5].name).toBe('Bicep curl')
  })

  it('parses a lower day with treadmill and plank seconds', () => {
    const parsed = parseRawWorkoutText(`Weight: - kgs
Treadmill:
B. 0.75km, 10:00, incline=6.0
Squats: 0lbs, 3, 12
Reverse Lunge: 0lbs, 3, 12
Leg curl (Glutes & Hamstrings): 20lbs, 3, 12
Leg extension (Quadriceps): 30lbs, 3, 12
Standing calf Raise: 0lbs, 3, 12
Plank: , 3, 30 seconds`)

    expect(parsed.workoutType).toBe('Lower')
    expect(parsed.treadmillDistanceKm).toBe('0.75')
    expect(parsed.treadmillMinutes).toBe('10:00')
    expect(parsed.treadmillIncline).toBe('6.0')
    expect(parsed.exercises).toHaveLength(6)

    expect(parsed.exercises[0].name).toBe('Squat')
    expect(parsed.exercises[1].name).toBe('Reverse lunge')
    expect(parsed.exercises[2].name).toBe('Leg curl')
    expect(parsed.exercises[3].name).toBe('Leg extension')
    expect(parsed.exercises[4].name).toBe('Standing calf raise')
    expect(parsed.exercises[5]).toMatchObject({
      name: 'Plank',
      weight: '',
      unit: 'bodyweight',
      sets: '3',
      reps: '30 seconds',
    })
  })

  it('classifies pure cardio as Cardio', () => {
    const parsed = parseRawWorkoutText(`Weight: 91.5 kgs
Treadmill:
B. 1.25km, 15:00, incline=6.0`)

    expect(parsed.workoutType).toBe('Cardio')
    expect(parsed.weightKg).toBe('91.5')
    expect(parsed.treadmillDistanceKm).toBe('1.25')
    expect(parsed.treadmillMinutes).toBe('15:00')
    expect(parsed.exercises).toHaveLength(0)
  })

  it('classifies upper and lower strength together as Mix', () => {
    const parsed = parseRawWorkoutText(`Weight: - kgs
Machine Chest Press: 45lbs, 3, 12
Leg extension: 30lbs, 3, 12`)

    expect(parsed.workoutType).toBe('Mix')
    expect(parsed.exercises).toHaveLength(2)
  })

  it('does not let cardio override strength classification', () => {
    const parsed = parseRawWorkoutText(`Weight: - kgs
Treadmill:
B. 0.75km, 10:00, incline=6.0
Machine Chest Press: 45lbs, 3, 12
Machine Seated Row: 65lbs, 3, 12`)

    expect(parsed.workoutType).toBe('Upper')
  })

  it('flags suspicious reps typo', () => {
    const parsed = parseRawWorkoutText(`Leg curl: 20lbs, 3, 1w`)

    expect(parsed.exercises).toHaveLength(1)
    expect(parsed.warnings.some((warning) => warning.message.includes('Reps look suspicious'))).toBe(true)
  })

  it('normalises exercise aliases consistently', () => {
    expect(canonicalExerciseName('Machine Chest Press (Deltoids, Traps & Triceps)')).toBe('machine-chest-press')
    expect(canonicalExerciseName('Machine Bicep-curl')).toBe('bicep-curl')
    expect(canonicalExerciseName('Standing calf Raise')).toBe('standing-calf-raise')
    expect(displayExerciseName('machine-chest-press')).toBe('Machine chest press')
  })

  it('parses inline treadmill format', () => {
    const parsed = parseRawWorkoutText(`Weight: 92 kgs
  Treadmill: 0.42km, 05:00, incline=6.0
  Squats: 0lbs, 3, 12`)

    expect(parsed.workoutType).toBe('Lower')
    expect(parsed.weightKg).toBe('92')
    expect(parsed.treadmillDistanceKm).toBe('0.42')
    expect(parsed.treadmillMinutes).toBe('05:00')
    expect(parsed.treadmillIncline).toBe('6.0')
    expect(parsed.exercises).toHaveLength(1)
  })

  it('parses Stairmaster as cardio', () => {
    const parsed = parseRawWorkoutText(`Weight: 92 kgs
  Stairmaster: 10:00, level=5`)

    expect(parsed.workoutType).toBe('Cardio')
    expect(parsed.treadmillDistanceKm).toBe('')
    expect(parsed.treadmillMinutes).toBe('10:00')
    expect(parsed.treadmillIncline).toBe('level 5')
  })

  it('parses cycling as cardio', () => {
    const parsed = parseRawWorkoutText(`Weight: 92 kgs
  Cycling: 2.5km, 12:00, resistance=4`)

    expect(parsed.workoutType).toBe('Cardio')
    expect(parsed.treadmillDistanceKm).toBe('2.5')
    expect(parsed.treadmillMinutes).toBe('12:00')
    expect(parsed.treadmillIncline).toBe('level 4')
  })

  it('parses calories burned section', () => {
    const parsed = parseRawWorkoutText(`Weight: - kgs
  Treadmill:
  B. 0.75km, 10:00, incline=6.0
  Squats: 0lbs, 3, 12
  Calories Burnt:
  Traditional Strength Training: 112 kcal
  Running: 109 kcal
  Basketball: 1329 kcal`)

    expect(parsed.strengthCalories).toBe('112')
    expect(parsed.cardioCalories).toBe('109')
    expect(parsed.basketballCalories).toBe('1329')
    expect(parsed.cyclingCalories).toBe('')
  })

  it('parses cycling calories separately from cardio calories', () => {
    const parsed = parseRawWorkoutText(`Weight: - kgs
  Calories Burnt:
  Traditional Strength Training: 112 kcal
  Running: 109 kcal
  Basketball: 1329 kcal
  Cycling: 240 kcal`)

    expect(parsed.strengthCalories).toBe('112')
    expect(parsed.cardioCalories).toBe('109')
    expect(parsed.basketballCalories).toBe('1329')
    expect(parsed.cyclingCalories).toBe('240')
  })
})

