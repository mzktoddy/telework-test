// Date utility functions for telework system

/**
 * Get ISO week number for a given date
 * @param date - The date to get the week number for
 * @returns The ISO week number (1-53)
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/**
 * Get the Sunday of a given week offset from current week
 * @param weekOffset - Number of weeks to offset (0 = current week, 1 = next week, etc.)
 * @returns Date object for the Sunday of the target week
 */
export function getSundayOfWeek(weekOffset: number): Date {
  const today = new Date()
  const currentWeek = getISOWeekNumber(today)
  const currentDayOfWeek = today.getDay()

  // Calculate Sunday of the current week
  const daysToSunday = currentDayOfWeek === 0 ? 0 : currentDayOfWeek
  const sundayOfCurrentWeek = new Date(today)
  sundayOfCurrentWeek.setDate(today.getDate() - daysToSunday)

  // Add weeks based on offset
  const targetSunday = new Date(sundayOfCurrentWeek)
  targetSunday.setDate(sundayOfCurrentWeek.getDate() + weekOffset * 7)

  return targetSunday
}

/**
 * Format date range for a week in Japanese format
 * @param weekOffset - Number of weeks to offset from current week
 * @returns Object containing startDate, endDate, and formatted range string
 */
export function formatDateRange(weekOffset: number): { startDate: Date; endDate: Date; formattedRange: string } {
  const sunday = getSundayOfWeek(weekOffset)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)

  const formatDate = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"]
    const dayName = dayNames[d.getDay()]
    return `${year}/${month}/${date}（${dayName}）`
  }

  return {
    startDate: sunday,
    endDate: saturday,
    formattedRange: `${formatDate(sunday)}～${formatDate(saturday)}`,
  }
}

/**
 * Generate dynamic week options for the next 4 weeks
 * @returns Array of week options with value, label, and weekNumber
 */
export function generateWeekOptions() {
  const today = new Date()
  const currentWeek = getISOWeekNumber(today)

  return Array.from({ length: 4 }, (_, index) => {
    const weekNumber = currentWeek + index
    const { formattedRange } = formatDateRange(index)
    return {
      value: `week${index}`,
      label: `第${weekNumber}週　${formattedRange}`,
      weekNumber,
    }
  })
}