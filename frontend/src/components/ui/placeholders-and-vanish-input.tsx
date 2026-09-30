import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"

interface PlaceholdersAndVanishInputProps {
  placeholders: string[]
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  onClear?: () => void
  name?: string
  'aria-label': string
  className?: string
  'data-testid'?: string
}

/**
 * Search input with a rotating placeholder that "vanishes" once the user
 * types and returns on Escape/clear. Controlled — the parent keeps the value.
 * Used for free-text search on operational surfaces (never passwords, dates,
 * numerics, or textareas).
 */
export function PlaceholdersAndVanishInput({
  placeholders,
  value,
  onChange,
  onClear,
  name,
  'aria-label': ariaLabel,
  className,
  'data-testid': testId,
}: PlaceholdersAndVanishInputProps) {
  const [index, setIndex] = useState(0)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (value !== "" || focused) return
    const id = setInterval(() => setIndex((prev) => (prev + 1) % placeholders.length), 2800)
    return () => clearInterval(id)
  }, [value, focused, placeholders.length])

  const placeholder = placeholders[index % placeholders.length]

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onClear?.()
  }

  return (
    <div
      className={cn("relative text-sm", className)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        data-testid={testId}
        aria-label={ariaLabel}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-ink placeholder:text-transparent ring-offset-background outline-none transition-colors focus:border-cobalt-deep focus:ring-2 focus:ring-ring focus:ring-offset-2"
      />
      {value === "" && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={placeholder}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="whitespace-nowrap text-muted-foreground"
            >
              {placeholder}
            </motion.span>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}