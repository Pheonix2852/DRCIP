import { Card } from "@/pages/ui/card"
import { cn } from "@/lib/utils"

export function DataCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={cn("rounded-drcip-md border-border p-4", className)}>{children}</Card>
}
