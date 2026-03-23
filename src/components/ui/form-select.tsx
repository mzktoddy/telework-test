"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel as SelectLabelPrimitive,
} from "./select"
import { Label } from "./label"
import { cn } from "@/lib/utils"

export interface FormSelectProps
  extends React.ComponentProps<typeof SelectTrigger> {
  label?: string
  error?: string
  helperText?: string
  options?: Array<{ value: string; label: string; group?: string }>
  containerClassName?: string
  placeholder?: string
  defaultValue?: string
}

const FormSelect = React.forwardRef<HTMLButtonElement, FormSelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      containerClassName,
      placeholder,
      defaultValue,
      disabled,
      ...props
    },
    ref
  ) => {
    const groupedOptions = options?.reduce(
      (acc, option) => {
        const group = option.group || "default"
        if (!acc[group]) {
          acc[group] = []
        }
        acc[group].push(option)
        return acc
      },
      {} as Record<string, typeof options>
    )

    return (
      <div className={cn("w-full space-y-1.5", containerClassName)}>
        {label && (
          <Label>{label}</Label>
        )}
        <Select defaultValue={defaultValue}>
          <SelectTrigger
            ref={ref}
            disabled={disabled}
            aria-invalid={!!error}
            {...props}
          >
            <SelectValue placeholder={placeholder || "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {groupedOptions ? (
              Object.entries(groupedOptions).map(([group, items]) => (
                <SelectGroup key={group}>
                  {group !== "default" && (
                    <SelectLabelPrimitive>{group}</SelectLabelPrimitive>
                  )}
                  {items?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))
            ) : (
              options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {error && (
          <p className="text-xs font-medium text-destructive">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    )
  }
)
FormSelect.displayName = "FormSelect"

export { FormSelect }
