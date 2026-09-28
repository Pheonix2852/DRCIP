import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive'
  size?: 'default' | 'sm' | 'icon'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center gap-2 rounded-drcip-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
    const variantStyles = {
      default: "bg-drcip-primary text-white hover:bg-drcip-primary/90",
      secondary: "border border-border bg-surface text-ink hover:bg-surface-cool",
      ghost: "text-ink hover:bg-surface-cool",
      outline: "border border-input bg-surface hover:bg-surface-cool",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    }
    const sizeStyles = {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3 text-sm",
      icon: "h-10 w-10",
    }
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"