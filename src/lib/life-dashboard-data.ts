// Dane i typy dla Life Dashboard

export interface PillarData {
  id: string
  name: string
  score: number // 0-100
  trend: 'rising' | 'steady' | 'declining'
  color: string
  bgColor: string
  borderColor: string
  icon: string
  wig: string // Wildly Important Goal
}

export interface WorkProject {
  id: string
  name: string
  emoji: string
  score: number
  tasks: TaskItem[]
}

export interface TaskItem {
  id: string
  title: string
  pillar: string
  project?: string
  priority: 'frog' | 'important' | 'nice'
  day: string
  points: number
  done: boolean
  delegatedTo?: string
}

export interface HealthGoals {
  cyclingKm: { target: number; current: number }
  cyclingHours: { target: number; current: number }
  runningKm: { target: number; current: number }
  activeCalories: { target: number; current: number }
  gymSessions: { targetPerWeek: number; targetPerMonth: number; current: number }
  competition: { name: string; date: string } | null
}

export interface SportWeek {
  day: string
  short: string
  gym: boolean
  runningKm: number
  cyclingKm: number
  cyclingHours: number
  activeCalories: number
  calorieBalance: number // negative = deficit (good), positive = surplus
}

// Domyślne dane filarów
export const defaultPillars: PillarData[] = [
  {
    id: 'health',
    name: 'Zdrowie i Fitness',
    score: 65,
    trend: 'rising',
    color: '#22c55e',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    icon: '💪',
    wig: 'Przejechać 800 km na rowerze w marcu',
  },
  {
    id: 'development',
    name: 'Rozwój Osobisty',
    score: 45,
    trend: 'steady',
    color: '#8b5cf6',
    bgColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    icon: '📚',
    wig: 'Przeczytać 4 książki biznesowe w Q1',
  },
  {
    id: 'relationships',
    name: 'Partnerstwo i Relacje',
    score: 70,
    trend: 'rising',
    color: '#ec4899',
    bgColor: '#fdf2f8',
    borderColor: '#fbcfe8',
    icon: '❤️',
    wig: 'Regularne randki — minimum 2 razy w miesiącu',
  },
  {
    id: 'work',
    name: 'Praca',
    score: 55,
    trend: 'steady',
    color: '#f59e0b',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    icon: '🏢',
    wig: 'Zwiększyć marżę o 15% do końca Q2',
  },
]

export const defaultWorkProjects: WorkProject[] = [
  {
    id: 'owoc-malinowi',
    name: 'Owoc Malinowi',
    emoji: '🍓',
    score: 50,
    tasks: [],
  },
  {
    id: 'gr-lipczynski',
    name: 'GR Lipczyński',
    emoji: '🌾',
    score: 60,
    tasks: [],
  },
  {
    id: 'inne',
    name: 'Inne',
    emoji: '📋',
    score: 40,
    tasks: [],
  },
]

export const defaultHealthGoals: HealthGoals = {
  cyclingKm: { target: 800, current: 120 },
  cyclingHours: { target: 80, current: 12 },
  runningKm: { target: 100, current: 25 },
  activeCalories: { target: 30000, current: 6800 },
  gymSessions: { targetPerWeek: 3, targetPerMonth: 12, current: 4 },
  competition: { name: 'Półmaraton Poznań', date: '2026-05-10' },
}

// Przykładowe dane tygodnia
export const defaultSportWeek: SportWeek[] = [
  { day: 'Poniedziałek', short: 'Pon', gym: true, runningKm: 5, cyclingKm: 0, cyclingHours: 0, activeCalories: 650, calorieBalance: -400 },
  { day: 'Wtorek', short: 'Wt', gym: false, runningKm: 0, cyclingKm: 35, cyclingHours: 1.5, activeCalories: 580, calorieBalance: -250 },
  { day: 'Środa', short: 'Śr', gym: true, runningKm: 0, cyclingKm: 0, cyclingHours: 0, activeCalories: 520, calorieBalance: -300 },
  { day: 'Czwartek', short: 'Czw', gym: false, runningKm: 8, cyclingKm: 0, cyclingHours: 0, activeCalories: 700, calorieBalance: -450 },
  { day: 'Piątek', short: 'Pt', gym: true, runningKm: 0, cyclingKm: 42, cyclingHours: 2, activeCalories: 750, calorieBalance: -200 },
  { day: 'Sobota', short: 'Sob', gym: false, runningKm: 12, cyclingKm: 60, cyclingHours: 2.5, activeCalories: 1100, calorieBalance: -600 },
  { day: 'Niedziela', short: 'Nd', gym: false, runningKm: 0, cyclingKm: 0, cyclingHours: 0, activeCalories: 200, calorieBalance: 300 },
]

// Zadania z voice notes — framework "Zjedz tę żabę"
export const defaultTasks: TaskItem[] = [
  // Praca
  {
    id: 't1',
    title: 'Przedstawić pierwszą koncepcję celów dla firmy',
    pillar: 'work',
    project: 'owoc-malinowi',
    priority: 'frog',
    day: 'Poniedziałek',
    points: 15,
    done: false,
  },
  {
    id: 't2',
    title: 'Przygotować prezentację: dlaczego takie cele',
    pillar: 'work',
    project: 'owoc-malinowi',
    priority: 'frog',
    day: 'Poniedziałek',
    points: 12,
    done: false,
  },
  {
    id: 't3',
    title: 'Dokończyć procedurę gospodarki magazynowej',
    pillar: 'work',
    project: 'owoc-malinowi',
    priority: 'frog',
    day: 'Wtorek',
    points: 15,
    done: false,
  },
  {
    id: 't4',
    title: 'Przeprowadzić dyskusję z zespołem o celach',
    pillar: 'work',
    project: 'owoc-malinowi',
    priority: 'important',
    day: 'Poniedziałek',
    points: 8,
    done: false,
  },
  {
    id: 't5',
    title: 'Rozliczyć ludzi z celów na farmie',
    pillar: 'work',
    project: 'gr-lipczynski',
    priority: 'important',
    day: 'Środa',
    points: 10,
    done: false,
    delegatedTo: 'Olgierd',
  },
  // Zdrowie
  {
    id: 't6',
    title: 'Trening siłowy — siłownia',
    pillar: 'health',
    priority: 'important',
    day: 'Poniedziałek',
    points: 5,
    done: false,
  },
  {
    id: 't7',
    title: 'Bieganie 8 km',
    pillar: 'health',
    priority: 'important',
    day: 'Czwartek',
    points: 5,
    done: false,
  },
  {
    id: 't8',
    title: 'Rower — 60 km weekend',
    pillar: 'health',
    priority: 'nice',
    day: 'Sobota',
    points: 8,
    done: false,
  },
  // Rozwój
  {
    id: 't9',
    title: 'Czytanie — 30 min rano',
    pillar: 'development',
    priority: 'important',
    day: 'Poniedziałek',
    points: 3,
    done: false,
  },
  // Relacje
  {
    id: 't10',
    title: 'Zaplanować randkę na weekend',
    pillar: 'relationships',
    priority: 'nice',
    day: 'Środa',
    points: 5,
    done: false,
  },
]

export const DAYS_OF_WEEK = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
] as const

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]
