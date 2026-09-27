import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Select } from './ui/select'
import { notifications, type NotificationSummary } from '../lib/notifications'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { toast } from 'sonner'

const TYPE_LABEL: Record<string, string> = {
  INCIDENT_ESCALATION: 'Incident Escalation',
  INCIDENT_STATUS_UPDATE: 'Incident Status Update',
  ASSIGNMENT_CREATED: 'New Assignment',
  ASSIGNMENT_STATUS_UPDATE: 'Assignment Status Update',
  SYSTEM: 'System Notice',
  EMERGENCY_BROADCAST: 'Emergency Broadcast',
}

function priorityChip(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return 'bg-red-100 text-red-800'
    case 'HIGH': return 'bg-orange-100 text-orange-800'
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-800'
    case 'LOW': return 'bg-blue-100 text-blue-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

function notificationTarget(n: NotificationSummary, role: string): string | null {
  if (n.incident_public_id) return `/incidents/${n.incident_public_id}`
  if (n.assignment_public_id) return role === 'FIELD_OFFICER' ? '/field/assignments' : '/assignments'
  return null
}

// The backend emits one row per channel for a single logical event. Group rows
// that share a logical_key so an IN_APP + EMAIL pair renders as one inbox item.
interface NotificationGroup {
  logicalKey: string
  notificationType: string
  priority: string
  severity: string | null
  message: string
  createdAt: string
  channels: NotificationSummary['channel'][]
  failedChannels: NotificationSummary['channel'][]
  inApp: NotificationSummary | null
  fallback: NotificationSummary | null
}

function groupNotifications(items: NotificationSummary[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>()
  for (const n of items) {
    let g = groups.get(n.logical_key)
    if (!g) {
      g = {
        logicalKey: n.logical_key,
        notificationType: n.notification_type,
        priority: n.priority,
        severity: typeof n.payload?.severity === 'string' ? n.payload.severity : null,
        message: n.message,
        createdAt: n.created_at,
        channels: [],
        failedChannels: [],
        inApp: null,
        fallback: null,
      }
      groups.set(n.logical_key, g)
    }
    if (n.created_at > g.createdAt) g.createdAt = n.created_at
    if (n.channel === 'IN_APP') g.inApp = n
    else g.fallback = g.fallback ?? n
    if (!g.channels.includes(n.channel)) g.channels.push(n.channel)
    if (n.delivery_status === 'FAILED' && !g.failedChannels.includes(n.channel)) g.failedChannels.push(n.channel)
  }
  return Array.from(groups.values())
}

export function NotificationsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [notificationType, setNotificationType] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', page, unreadOnly, notificationType],
    queryFn: () =>
      notifications.list({
        page,
        limit: 10,
        ...(unreadOnly && { unread_only: 'true' }),
        ...(notificationType && { notification_type: notificationType }),
      }),
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notifications.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(err.response?.data?.error?.message || 'Failed to mark notification as read')
    },
  })

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Updates about your incidents, assignments, and broadcasts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Select
                name="unread_filter"
                value={unreadOnly ? 'unread' : 'all'}
                onChange={(e) => {
                  setUnreadOnly(e.target.value === 'unread')
                  setPage(1)
                }}
                aria-label="Filter by read state"
              >
                <option value="all">All notifications</option>
                <option value="unread">Unread only</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Select
                name="type_filter"
                value={notificationType}
                onChange={(e) => {
                  setNotificationType(e.target.value)
                  setPage(1)
                }}
                aria-label="Filter by type"
              >
                <option value="">All types</option>
                <option value="INCIDENT_ESCALATION">Incident Escalation</option>
                <option value="INCIDENT_STATUS_UPDATE">Incident Status Update</option>
                <option value="ASSIGNMENT_CREATED">New Assignment</option>
                <option value="ASSIGNMENT_STATUS_UPDATE">Assignment Status Update</option>
                <option value="SYSTEM">System Notice</option>
                <option value="EMERGENCY_BROADCAST">Emergency Broadcast</option>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground" role="status">Loading notifications...</div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              {(error as Error).message || 'Failed to load notifications'}
            </div>
          ) : data?.items?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No notifications found.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {groupNotifications(data?.items ?? []).map((g) => {
                  const primary = g.inApp ?? g.fallback
                  const target = user && primary ? notificationTarget(primary, user.role) : null
                  const isUnread = !!g.inApp && !g.inApp.read_at
                  return (
                    <Card key={g.logicalKey} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex flex-wrap justify-between items-start gap-3">
                          <div className="flex items-center gap-2">
                            {isUnread && (
                              <span className="flex items-center gap-1.5 text-xs font-semibold" aria-hidden="true">
                                <span className="h-2 w-2 rounded-full bg-drcip-primary" />
                                <span className="sr-only">Unread - </span>
                              </span>
                            )}
                            <span className="font-semibold">{TYPE_LABEL[g.notificationType] ?? g.notificationType}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityChip(g.priority)}`}>
                              Priority: {g.priority}
                            </span>
                            {g.severity && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityChip(g.severity)}`}>
                                Severity: {g.severity}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{g.channels.join(' + ')}</span>
                            {g.failedChannels.length > 0 && (
                              <span className="text-destructive font-medium">
                                Delivery failed ({g.failedChannels.join(', ')})
                              </span>
                            )}
                            <span>{new Date(g.createdAt).toLocaleString()}</span>
                          </div>
                        </div>

                        <p className="mt-2 text-sm">{g.message}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {g.inApp?.read_at ? (
                            <span className="text-xs text-muted-foreground">Read</span>
                          ) : g.inApp ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markReadMutation.mutate(g.inApp!.public_id)}
                              disabled={markReadMutation.isPending}
                            >
                              Mark as read
                            </Button>
                          ) : null}
                          {target && (
                            <Link to={target}>
                              <Button variant="ghost" size="sm">View details</Button>
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {data && data.pagination && data.pagination.total_pages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.total_pages} ({data.pagination.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= (data.pagination.total_pages || 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}