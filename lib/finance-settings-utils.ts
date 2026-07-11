import type { BillReminderDTO, UpcomingBillReminder, UserPreferences } from '@/lib/types'

export const defaultPreferences: UserPreferences = {
  showDashboardTips: true,
  showReviewTips: true,
  showUploadTips: true,
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function billDueDateFor(reminder: BillReminderDTO, reference: Date): Date {
  const candidate = new Date(reference.getFullYear(), reference.getMonth(), Math.min(reminder.dueDay, lastDayOfMonth(reference.getFullYear(), reference.getMonth())))
  candidate.setHours(12, 0, 0, 0)
  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)

  if (candidate < today) {
    const nextMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 1)
    candidate.setFullYear(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(reminder.dueDay, lastDayOfMonth(nextMonth.getFullYear(), nextMonth.getMonth())))
  }

  return candidate
}

export function getUpcomingBillReminders(reminders: BillReminderDTO[], reference = new Date()): UpcomingBillReminder[] {
  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)

  return reminders
    .filter((reminder) => reminder.active)
    .map((reminder) => {
      const dueDate = billDueDateFor(reminder, today)
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      return {
        id: reminder.id,
        label: reminder.label,
        source: reminder.source,
        dueDay: reminder.dueDay,
        dueDate: dueDate.toISOString().slice(0, 10),
        daysUntil,
      }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
}
