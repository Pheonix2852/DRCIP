import { Card, CardContent } from "@/pages/ui/card"
import { AnimatedNumber } from "./homepage/AnimatedNumber"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  value: number | string
  label: string
  className?: string
  'data-testid'?: string
}

export function KpiCard({ value, label, className, 'data-testid': testId }: KpiCardProps) {
  return (
    <Card className={cn("rounded-drcip-md border-border bg-surface-cool px-3 py-2.5", className)}>
      <CardContent className="p-0">
        <p className="font-mono text-lg leading-none text-ink" data-testid={testId}>
          {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        </p>
        <p className="mt-1 text-[11px] text-text-muted">{label}</p>
      </CardContent>
    </Card>
  )
}
