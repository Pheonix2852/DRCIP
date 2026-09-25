import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { incidents } from '../lib/incidents'
import { assignments, type CreateAssignmentItem, type CreateResourceItem, type CreateShelterItem, type CreateTeamItem } from '../lib/assignments'

const RESOURCE_TYPES = ['AMBULANCE', 'RESCUE_TEAM', 'FOOD', 'MEDICAL_KIT', 'VEHICLE', 'RELIEF_TRUCK', 'SHELTER', 'VOLUNTEER', 'PERSONNEL']
const KINDS = [
  { value: 'resource', label: 'Resource' },
  { value: 'team', label: 'Field Team' },
  { value: 'shelter', label: 'Shelter' },
] as const

type ItemKind = (typeof KINDS)[number]['value']

interface Row {
  kind: ItemKind
  resource_type: string
  ref: string
  quantity: string
}

const emptyRow: Row = { kind: 'resource', resource_type: 'AMBULANCE', ref: '', quantity: '1' }

export function AllocateReviewPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>([{ ...emptyRow }])
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)

  const { data: incident, isLoading, error } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidents.detail(id!),
    enabled: !!id,
  })

  const createMutation = useMutation({
    mutationFn: (items: CreateAssignmentItem[]) => assignments.create(id!, { items, notes: notes || undefined }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      setCreatedId(created.id)
      setFormError('')
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              ...patch,
              ...(patch.kind !== undefined
                ? { ref: '', resource_type: 'AMBULANCE', quantity: patch.kind === 'team' ? '1' : '1' }
                : {}),
            }
          : r,
      ),
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const items: CreateAssignmentItem[] = []
    for (const row of rows) {
      if (!row.ref.trim()) { setFormError('Every item needs a reference id.'); return }
      if (row.kind === 'team') {
        const item: CreateTeamItem = { team_id: row.ref.trim(), quantity: 1 }
        items.push(item)
      } else if (row.kind === 'shelter') {
        const quantity = Number(row.quantity)
        if (!Number.isInteger(quantity) || quantity <= 0) { setFormError('Shelter quantity must be a whole positive number.'); return }
        const item: CreateShelterItem = { shelter_id: row.ref.trim(), quantity }
        items.push(item)
      } else {
        const quantity = Number(row.quantity)
        if (!Number.isFinite(quantity) || quantity <= 0) { setFormError('Every item needs a positive quantity.'); return }
        const item: CreateResourceItem = { resource_type: row.resource_type, resource_id: row.ref.trim(), quantity }
        items.push(item)
      }
    }
    createMutation.mutate(items)
  }

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground" role="status">Loading incident...</div>
  }
  if (error) {
    return <div className="text-center py-16 text-destructive" role="alert">{(error as Error).message || 'Failed to load incident'}</div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Manual Assignment</CardTitle>
          <CardDescription>
            {incident?.id} &middot; {incident?.disaster_type} &middot; {incident?.status}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {createdId ? (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-green-50 text-green-800 text-sm" role="status">
                Assignment {createdId} created.
              </div>
              <div className="flex gap-2">
                <Link to="/assignments"><Button size="sm">View Assignments</Button></Link>
                <Link to={`/incidents/${id}`}><Button size="sm" variant="outline">Back to Incident</Button></Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">{formError}</div>}

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={index} className="border-b pb-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="block text-xs font-medium mb-1">Item type</label>
                        <Select data-testid={`kind-${index}`} value={row.kind} onChange={(e) => updateRow(index, { kind: e.target.value as ItemKind })}>
                          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </Select>
                      </div>

                      {row.kind === 'resource' && (
                        <div>
                          <label className="block text-xs font-medium mb-1">Resource type</label>
                          <Select value={row.resource_type} onChange={(e) => updateRow(index, { resource_type: e.target.value })}>
                            {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Select>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          {row.kind === 'resource' ? 'Resource id' : row.kind === 'team' ? 'Team id' : 'Shelter id'}
                        </label>
                        <Input
                          placeholder={row.kind === 'resource' ? 'RES-...' : row.kind === 'team' ? 'TEAM-...' : 'SHL-...'}
                          data-testid={`ref-${index}`}
                          value={row.ref}
                          onChange={(e) => updateRow(index, { ref: e.target.value })}
                        />
                      </div>

                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="block text-xs font-medium mb-1">Qty</label>
                          {row.kind === 'team' ? (
                            <div className="h-9 px-3 flex items-center rounded-md border bg-muted text-sm" data-testid="team-qty-fixed">
                              1
                            </div>
                          ) : (
                            <Input type="number" min="1" step={row.kind === 'shelter' ? '1' : 'any'} data-testid={`qty-${index}`} value={row.quantity} onChange={(e) => updateRow(index, { quantity: e.target.value })} />
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={rows.length === 1}
                          onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { ...emptyRow }])}>
                Add Item
              </Button>

              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Decision reason..." />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Assignment'}
                </Button>
                <Link to={`/incidents/${id}`}><Button type="button" variant="outline">Cancel</Button></Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AllocateReviewPage