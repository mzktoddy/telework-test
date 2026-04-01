"use client"

import React, { useState, useMemo } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { DayCard, StatusBadge, Button, Card, FormSelect } from "@/components/ui"
import { formatDateRange, generateWeekOptions } from "@/lib/date-utils"

// // Utility function to get ISO week number
// function getISOWeekNumber(date: Date): number {
//   const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
//   const dayNum = d.getUTCDay() || 7
//   d.setUTCDate(d.getUTCDate() + 4 - dayNum)
//   const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
//   return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
// }

// // Utility function to get Sunday of a given week
// function getSundayOfWeek(weekOffset: number): Date {
//   const today = new Date()
//   const currentWeek = getISOWeekNumber(today)
//   const currentDayOfWeek = today.getDay()
  
//   // Calculate Sunday of the current week
//   const daysToSunday = currentDayOfWeek === 0 ? 0 : currentDayOfWeek
//   const sundayOfCurrentWeek = new Date(today)
//   sundayOfCurrentWeek.setDate(today.getDate() - daysToSunday)
  
//   // Add weeks based on offset
//   const targetSunday = new Date(sundayOfCurrentWeek)
//   targetSunday.setDate(sundayOfCurrentWeek.getDate() + weekOffset * 7)
  
//   return targetSunday
// }

// // Utility function to format date range for a week
// function formatDateRange(weekOffset: number): { startDate: Date; endDate: Date; formattedRange: string } {
//   const sunday = getSundayOfWeek(weekOffset)
//   const saturday = new Date(sunday)
//   saturday.setDate(sunday.getDate() + 6)
  
//   const formatDate = (d: Date) => {
//     const year = d.getFullYear()
//     const month = String(d.getMonth() + 1).padStart(2, "0")
//     const date = String(d.getDate()).padStart(2, "0")
//     const dayNames = ["日", "月", "火", "水", "木", "金", "土"]
//     const dayName = dayNames[d.getDay()]
//     return `${year}/${month}/${date}（${dayName}）`
//   }
  
//   return {
//     startDate: sunday,
//     endDate: saturday,
//     formattedRange: `${formatDate(sunday)}～${formatDate(saturday)}`,
//   }
// }

// // Generate dynamic week options
// function generateWeekOptions() {
//   const today = new Date()
//   const currentWeek = getISOWeekNumber(today)
  
//   return Array.from({ length: 4 }, (_, index) => {
//     const weekNumber = currentWeek + index
//     const { formattedRange } = formatDateRange(index)
//     return {
//       value: `week${index}`,
//       label: `第${weekNumber}週　${formattedRange}`,
//       weekNumber,
//     }
//   })
// }

interface DayData {
  id: string
  date: number
  fullDate: string
  day: string
  dayShort: string
  title: string
  description: string
  status: "none" | "approved" | "pending" | "rejected"
}

interface RequestDetails {
  day: string
  date: number
  tasks: string[]
  notes: string
}

export default function MyRequestsPage() {
  const weekOptions = useMemo(() => generateWeekOptions(), [])
  const [selectedDay, setSelectedDay] = useState<string>("wed")
  const [selectedWeek, setSelectedWeek] = useState<string>("week0")
  const [additionalNotes, setAdditionalNotes] = useState("")

  const selectedWeekIndex = parseInt(selectedWeek.replace("week", ""))
  const { formattedRange: weekDateRange, startDate, endDate } = formatDateRange(selectedWeekIndex)
  const weekNumberDisplay = weekOptions[selectedWeekIndex]?.weekNumber || 0

  const weekData: DayData[] = useMemo(() => {
    const days = ["mon", "tue", "wed", "thu", "fri"]
    const dayNames = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"]
    const dayShorts = ["(月)", "(火)", "(水)", "(木)", "(金)"]
    return days.map((id, i) => {
      const date = new Date(startDate)
     
      date.setDate(startDate.getDate() + i + 1) // Monday is startDate + 1
      const fullDate = date.toLocaleDateString('ja-JP');
      return {
        id,
        date: date.getDate(),
        fullDate: fullDate,
        day: dayNames[i],
        dayShort: dayShorts[i],
        title: "オフィス勤務日",
        description: "オフィス出勤必須",
        status: "none",
      }
    })
  }, [selectedWeek, startDate])

  const selectedDayData = weekData.find((d) => d.id === selectedDay)

  return (
    <DashboardLayout>
      <div className="flex flex-1">
        {/* Main Content */}
        <div className="flex-1 p-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                在宅勤務許可申請書
              </h1>
              <p className="text-slate-600">
                今後の在宅勤務日を計画してください。
              </p>
            </div>
            <div className="flex items-center gap-6 ">
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="h-9 px-4 bg-grey-200 w-96 hover:bg-grey-300 text-slate-900 font-medium text-sm border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-sm"
              >
                {weekOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-50 hover:bg-slate-900 text-slate-900">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Upcoming Week */}
          <div className="mb-8">
            {/* Week and Date Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  第{weekNumberDisplay}週
                </h2>
              </div>
              <span className="text-sm text-slate-600">
                {weekDateRange}
              </span>
            </div>

            {/* Year and Month Description */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-slate-700">
                {startDate.getFullYear()}年{String(startDate.getMonth() + 1).padStart(2, "0")}月
              </h3>
            </div>

            {/* Day Cards Grid */}
            <div className="space-y-3">
              {weekData.map((day) => (
                <DayCard
                  key={day.id}
                  date={day.date}
                  day={day.day}
                  dayShort={day.dayShort}
                  title={day.title}
                  description={day.description}
                  status={day.status}
                  isSelected={selectedDay === day.id}
                  onClick={() => setSelectedDay(day.id)}
                />
              ))}
            </div>

            {/* Submit Full Week Request */}
            {/* <div className="mt-6 flex justify-start">
              <Button className="h-10 px-6 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-lg border border-slate-300 text-sm gap-2">
                <span>+</span> Submit Full Week Request
              </Button>
            </div> */}
          </div>

          {/* New Request Button */}
          <div className="sticky bottom-8 left-8">
            <Button className="w-full h-11 px-6 bg-slate-900 hover:bg-slate-800 text-white text-lg font-medium rounded-full gap-2">
              申請
            </Button>
          </div>
        </div>

        {/* Right Sidebar - Request Details */}
        <div className="w-5/12 p-8 bg-white border-l border-slate-200 overflow-y-auto">
          {selectedDayData && (
            <>
              {/* Day Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                   {selectedDayData.fullDate} {selectedDayData.dayShort} の申請書作成
                  </h3>
                  <StatusBadge status={selectedDayData.status} />
                </div>
                <p className="text-sm text-slate-600">
                  タスクと目標を指定してください。
                </p>
              </div>

              {/* Sync Tasks Card */}
              <Card className="p-6 mb-6 border-dashed border-2 border-slate-300 bg-blue-50">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="size-8 text-blue-500 opacity-50 flex items-center justify-center text-2xl">
                      📄
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-1">
                      Redmineから計画されたタスクを同期
                    </h4>
                    <p className="text-xs text-slate-600">
                      この日の編集スケジュールとアクティブなチケットを自動的にインポートします。
                    </p>
                  </div>
                </div>
              </Card>

              {/* Info Box */}
              {/* <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
                <div className="flex-shrink-0 mt-0.5 text-lg">
                  ℹ️
                </div>
                <p className="text-xs text-slate-700">
                  <span className="font-semibold">Importing tasks</span> helps
                  your managers understand your workflow and ensures better
                  coordination during peak editorial cycles.
                </p>
              </div> */}

              {/* Additional Notes */}
              <div className="mb-6">
                <label className="text-sm font-medium text-slate-900 block mb-2">
                  作業内容や目標などの追加ノート
                </label>
                <textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={5}
                  placeholder="例: 高優先度の編集レビューに集中、午後2時から4時までZoom対応可能..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button className="flex-1 h-11 bg-slate-900 hover:bg-slate-800 text-white font-medium text-lg rounded-full">
                  保存
                </Button>
                <Button className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium text-lg rounded-full border border-slate-300">
                 キャンセル
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
