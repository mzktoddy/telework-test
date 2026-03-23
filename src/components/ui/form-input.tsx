"use client"

import * as React from "react"
import { Input } from "./input"
import { Label } from "./label"
import { cn } from "@/lib/utils"

export interface FormInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
  rightElement?: React.ReactNode
  containerClassName?: string
}

const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({
    className,
    label,
    error,
    helperText,
    icon,
    rightElement,
    disabled,
    containerClassName,
    ...props
  }, ref) => {
    return (
      <div className={cn("w-full space-y-1.5", containerClassName)}>
        {label && (
          <Label htmlFor={props.id}>
            {label}
            {props.required && <span className="text-destructive">*</span>}
          </Label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-muted-foreground z-10">
              {icon}
            </div>
          )}
          <Input
            ref={ref}
            className={cn(
              error && "aria-invalid:border-destructive aria-invalid:ring-destructive",
              icon && "pl-10",
              rightElement && "pr-10",
              className
            )}
            aria-invalid={!!error}
            disabled={disabled}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 flex items-center pointer-events-auto z-10">
              {rightElement}
            </div>
          )}
        </div>
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
FormInput.displayName = "FormInput"

export { FormInput }
