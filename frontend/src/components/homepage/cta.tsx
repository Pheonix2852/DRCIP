import type { ComponentProps } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

/**
 * Capsule CTA treatments for the public homepage (Slice 3B v2).
 * Glass/capsule language per home HOME design; base geometry lives in
 * `capsule-primary` / `capsule-secondary` so hero sizing stays in the
 * design-unit system while these keep a safe shared baseline.
 */
export const primaryCtaClass =
  'capsule-primary inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric'

export const secondaryCtaClass =
  'capsule-secondary inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric'

export function PrimaryCtaLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link className={cn(primaryCtaClass, className)} {...props}>
      {children}
    </Link>
  )
}

export function SecondaryCtaLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link className={cn(secondaryCtaClass, className)} {...props}>
      {children}
    </Link>
  )
}