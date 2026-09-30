import * as React from "react"
import { cn } from "../../lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
Select.displayName = "Select"

export const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>
SelectContent.displayName = "SelectContent"

export const SelectItem = React.forwardRef<
  HTMLOptionElement,
  React.OptionHTMLAttributes<HTMLOptionElement>
>(({ className, ...props }, ref) => (
  <option ref={ref} className={cn("bg-popover text-popover-foreground", className)} {...props} />
))
SelectItem.displayName = "SelectItem"

export const SelectTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm", className)} {...props} />
))
SelectTrigger.displayName = "SelectTrigger"

export const SelectValue = ({ children }: { children: React.ReactNode }) => <>{children}</>
SelectValue.displayName = "SelectValue"

export const SelectGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>
SelectGroup.displayName = "SelectGroup"

export const SelectLabel = ({ children }: { children: React.ReactNode }) => <>{children}</>
SelectLabel.displayName = "SelectLabel"

export const SelectSeparator = ({ className }: { className?: string }) => <hr className={cn("my-1 h-px bg-muted", className)} />
SelectSeparator.displayName = "SelectSeparator"