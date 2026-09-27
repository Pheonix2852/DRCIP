export function severityColor(severity?: string): string {
  switch (severity) {
    case 'CRITICAL': return '#dc2626'
    case 'HIGH': return '#ea580c'
    case 'MEDIUM': return '#ca8a04'
    case 'LOW': return '#2563eb'
    default: return '#6b7280'
  }
}
