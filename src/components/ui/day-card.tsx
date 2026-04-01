"use client"

import React from "react"
import { Card } from "./card"
import { StatusBadge } from "./status-badge"
import { cn } from "@/lib/utils"

interface DayCardProps {
  date: number
  day: string
  dayShort: string
  title: string
  description: string
  status: "none" | "approved" | "pending" | "rejected"
  isSelected?: boolean
  onClick?: () => void
}

export function DayCard({
  date,
  day,
  dayShort,
  title,
  description,
  status,
  isSelected = false,
  onClick,
}: DayCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 cursor-pointer transition-all hover:shadow-md max-h-25",
        isSelected && "border-blue-400 border-2 bg-blue-50"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col items-center justify-center border-slate-300 border-2 p-2 bg-blue-50 rounded-md min-w-16 h-16">
          <span className="text-2xl font-bold text-slate-900">{date}</span>
          <span className="text-xs  font-medium text-amber-900 uppercase mt-1">{dayShort}</span>
        </div>
        <StatusBadge status={status} />
      </div>
      {/* <div className="space-y-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-xs text-slate-600">{description}</p>
      </div> */}
      {/* {isSelected && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <span className="text-xs font-medium text-blue-600">Selected</span>
        </div>
      )} */}
    </Card>
  )
}
