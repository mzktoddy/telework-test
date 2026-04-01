"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Check, FileText, Calendar, ChartBar, SignOut } from "phosphor-react"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  isActive?: boolean
  color?: string
}

interface SidebarNavProps {
  items?: NavItem[]
  className?: string
}

const defaultItems: NavItem[] = [
  {
    label: "My Requests",
    href: "/dashboard",
    icon: <Check size={18} />,
    color: "text-emerald-400",
  },
  {
    label: "申請履歴",
    href: "/dashboard/history",
    icon: <FileText size={18} />,
    color: "text-sky-400",
  },
  {
    label: "Team Calendar",
    href: "/dashboard/team-calendar",
    icon: <Calendar size={18} />,
    color: "text-violet-400",
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: <ChartBar size={18} />,
    color: "text-amber-400",
  },
]

const bottomItems: NavItem[] = [
 
  {
    label: "ログアウト",
    href: "/api/auth/logout",
    icon: <SignOut size={18} />,
    color: "text-rose-400",
  },
]

export function SidebarNav({ items = defaultItems, className }: SidebarNavProps) {
  const [userRole, setUserRole] = useState<string | null>(null)
  
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const response = await fetch("/api/auth/getSession")
        if (response.ok) {
          const data = await response.json()
          setUserRole(data.role)
        }
      } catch (error) {
        console.error("Failed to fetch user role:", error)
      }
    }
    
    fetchUserRole()
  }, [])

  // Generate dynamic items with role-based label
  const dynamicItems = items.map((item, index) => {
    if (index === 0 && userRole) {
      // Update the first item (My Requests) based on user role
      const label = userRole === "employee" ? "申請一覧" : "申請承認"
      return { ...item, label }
    }
    return item
  })

  return (
    <aside
      className={cn(
        "flex flex-col h-screen w-64 bg-slate-900 text-white overflow-y-auto",
        className
      )}
    >
      {/* Logo/Branding */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-center gap-2">
            <div className="bg-blue-100 rounded-md  text-sm font-bold">
            <img 
              src="/favicon.ico" 
              alt="Logo" 
              className="w-18 brightness-50 h-auto hue-rotate-20"
            />
            </div>
          <div>
            <p className="text-sm font-semibold">マミヤ</p>
            <p className="text-xs font-medium text-slate-400">ITソリューションズ</p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {dynamicItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium",
              item.isActive
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800"
            )}
          >
            <span className={cn(
              "flex items-center justify-center w-5 h-5 transition-colors",
              item.isActive ? "text-white" : item.color
            )}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 space-y-1 border-t border-slate-700">
        {bottomItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            <span className={cn(
              "flex items-center justify-center w-5 h-5 transition-colors",
              item.color
            )}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
        <p>© Mamiya IT Solutions Corporation All Rights Reserved</p>
      </div>
    </aside>
  )
}
