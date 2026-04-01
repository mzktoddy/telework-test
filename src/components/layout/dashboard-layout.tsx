"use client"

import React from "react"
import { SidebarNav } from "./sidebar-nav"
import { cn } from "@/lib/utils"

interface DashboardLayoutProps {
  children: React.ReactNode
  className?: string
}

export function DashboardLayout({
  children,
  className,
}: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-white">
      <SidebarNav />
      <main className={cn("flex-1 overflow-y-auto bg-slate-50", className)}>
        {children}
      </main>
    </div>
  )
}
