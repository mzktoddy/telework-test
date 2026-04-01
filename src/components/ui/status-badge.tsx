"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      status: {
        none: "bg-blue-100 text-blue-700",
        approved: "bg-green-100 text-green-700",
        pending: "bg-orange-100 text-orange-700",
        rejected: "bg-red-100 text-red-700",
      },
    },
    defaultVariants: {
      status: "none",
    },
  }
)

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const labels: Record<string, string> = {
    none: "NONE",
    approved: "APPROVED",
    pending: "PENDING",
    rejected: "REJECTED",
  }

  return (
    <div className={cn(statusBadgeVariants({ status }), className)}>
      {labels[status || "none"]}
    </div>
  )
}
