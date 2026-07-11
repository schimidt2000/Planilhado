import { prisma } from '@/lib/db'
import { currentMonth } from '@/lib/format'
import { defaultPreferences, getUpcomingBillReminders } from '@/lib/finance-settings-utils'
import type {
  BillReminderDTO,
  ExtraIncomeDTO,
  FinanceSettingsSnapshot,
  SalaryEntryDTO,
  UserPreferences,
} from '@/lib/types'

function serializeSalaryEntry(entry: {
  id: string
  effectiveMonth: string
  amountCents: number
  notes: string | null
  createdAt: Date
}): SalaryEntryDTO {
  return {
    id: entry.id,
    effectiveMonth: entry.effectiveMonth,
    amountCents: entry.amountCents,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
  }
}

function serializeBillReminder(reminder: {
  id: string
  label: string
  source: string | null
  dueDay: number
  active: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
}): BillReminderDTO {
  return {
    id: reminder.id,
    label: reminder.label,
    source: reminder.source,
    dueDay: reminder.dueDay,
    active: reminder.active,
    notes: reminder.notes,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  }
}

function serializeExtraIncome(income: {
  id: string
  description: string
  amountCents: number
  expectedDate: Date
  status: string
  receivedAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}): ExtraIncomeDTO {
  return {
    id: income.id,
    description: income.description,
    amountCents: income.amountCents,
    expectedDate: income.expectedDate.toISOString().slice(0, 10),
    status: income.status === 'received' ? 'received' : 'planned',
    receivedAt: income.receivedAt?.toISOString() ?? null,
    notes: income.notes,
    createdAt: income.createdAt.toISOString(),
    updatedAt: income.updatedAt.toISOString(),
  }
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const preferences = await prisma.userPreference.findUnique({
    where: { userId },
    select: { showDashboardTips: true, showReviewTips: true, showUploadTips: true },
  })

  return preferences ?? defaultPreferences
}

export async function upsertUserPreferences(userId: string, patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const allowedPatch = {
    ...(typeof patch.showDashboardTips === 'boolean' && { showDashboardTips: patch.showDashboardTips }),
    ...(typeof patch.showReviewTips === 'boolean' && { showReviewTips: patch.showReviewTips }),
    ...(typeof patch.showUploadTips === 'boolean' && { showUploadTips: patch.showUploadTips }),
  }

  const preferences = await prisma.userPreference.upsert({
    where: { userId },
    update: allowedPatch,
    create: { userId, ...defaultPreferences, ...allowedPatch },
    select: { showDashboardTips: true, showReviewTips: true, showUploadTips: true },
  })

  return preferences
}

export async function getFinanceSettings(userId: string): Promise<FinanceSettingsSnapshot> {
  const [preferences, salaryEntries, billReminders, extraIncomes] = await Promise.all([
    getUserPreferences(userId),
    prisma.salaryEntry.findMany({
      where: { userId },
      orderBy: [{ effectiveMonth: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.billReminder.findMany({
      where: { userId },
      orderBy: [{ active: 'desc' }, { dueDay: 'asc' }, { label: 'asc' }],
    }),
    prisma.extraIncome.findMany({
      where: { userId },
      orderBy: [{ expectedDate: 'asc' }, { createdAt: 'desc' }],
    }),
  ])

  const serializedSalaryEntries = salaryEntries.map(serializeSalaryEntry)
  const month = currentMonth()
  const currentSalary = serializedSalaryEntries.find((entry) => entry.effectiveMonth <= month) ?? serializedSalaryEntries[0] ?? null
  const serializedBillReminders = billReminders.map(serializeBillReminder)

  return {
    preferences,
    salaryEntries: serializedSalaryEntries,
    currentSalary,
    billReminders: serializedBillReminders,
    extraIncomes: extraIncomes.map(serializeExtraIncome),
    upcomingBillReminders: getUpcomingBillReminders(serializedBillReminders),
  }
}
