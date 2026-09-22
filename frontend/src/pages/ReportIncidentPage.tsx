import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select } from './ui/select'
import { incidents, type CreateIncidentRequest } from '../lib/incidents'
import { MapPanel } from '../components/MapPanel'

const ACCEPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
const MAX_FILES = 5
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 25 * 1024 * 1024
const MAX_VIDEO_SECONDS = 30

type MediaStatus = 'ready' | 'uploading' | 'done' | 'error'

interface MediaItem {
  key: string
  file: File
  previewUrl: string
  kind: 'image' | 'video'
  duration?: number
  status: MediaStatus
  error?: string
}

const DEFAULT_CENTER: [number, number] = [22.57, 88.36]

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration) }
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video metadata')) }
    video.src = url
  })
}

export function ReportIncidentPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [items, setItems] = useState<MediaItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [createdIncidentId, setCreatedIncidentId] = useState<string | null>(null)

  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const itemsRef = useRef<MediaItem[]>(items)
  itemsRef.current = items

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), [])

  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setAccuracy(pos.coords.accuracy)
        setGeoLoading(false)
      },
      (err) => {
        setGeoError(
          err.code === 1
            ? 'Location permission denied. You can still set the location by dragging the map pin.'
            : err.code === 2
              ? 'Location unavailable. You can still set the location by dragging the map pin.'
              : 'Location request timed out. You can still set the location by dragging the map pin.'
        )
        if (lat === null) { setLat(DEFAULT_CENTER[0]); setLng(DEFAULT_CENTER[1]) }
        setGeoLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [lat])

  const handleMapDragEnd = useCallback((newLat: number, newLng: number) => {
    setLat(newLat)
    setLng(newLng)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setValidationErrors([])

    if (lat === null || lng === null) {
      setError('Location is required. Use "Get My Location" or drag the map pin to set the incident location.')
      return
    }

    const form = e.target as HTMLFormElement
    const data = new FormData(form)
    const payload = {
      disaster_type: data.get('disaster_type') as string,
      description: data.get('description') as string,
      latitude: lat,
      longitude: lng,
      people_affected: parseInt(data.get('people_affected') as string),
      emergency_contact_number: data.get('emergency_contact_number') as string,
    }
    if (!payload.disaster_type || !payload.description || isNaN(payload.people_affected)) {
      setError('Please fill in all required fields with valid values.')
      return
    }

    setSubmitting(true)
    try {
      const res = await incidents.create(payload as CreateIncidentRequest)
      const incidentId = res.incident_id
      setCreatedIncidentId(incidentId)
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      await uploadMedia(incidentId)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: { message?: string } } } }
      setError(axiosError.response?.data?.error?.message || (err as Error).message || 'Failed to submit incident')
    } finally {
      setSubmitting(false)
    }
  }

  const uploadMedia = async (incidentId: string): Promise<void> => {
    const pending = itemsRef.current.filter((i) => i.status === 'ready' || i.status === 'error')
    if (pending.length === 0) {
      setSuccess(`Incident ${incidentId} reported successfully.`)
      setTimeout(() => navigate('/incidents'), 2000)
      return
    }
    setItems((prev) => prev.map((i) => (pending.some((p) => p.key === i.key) ? { ...i, status: 'uploading', error: undefined } : i)))
    let uploaded = 0
    const failures: string[] = []
    for (const item of pending) {
      try {
        const formData = new FormData()
        formData.append('media', item.file)
        await incidents.uploadMedia(incidentId, formData)
        uploaded += 1
        setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'done' } : i)))
      } catch (err: unknown) {
        const axiosError = err as { response?: { data?: { error?: { message?: string } } } }
        const message = axiosError.response?.data?.error?.message || (err as Error).message || 'Upload failed'
        failures.push(item.file.name)
        setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'error', error: message } : i)))
      }
    }
    if (failures.length === 0) {
      setSuccess(`Incident ${incidentId} reported successfully. ${uploaded} media file${uploaded === 1 ? '' : 's'} uploaded.`)
      itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl))
      setItems([])
      setTimeout(() => navigate('/incidents'), 2000)
    } else {
      setError(`Incident ${incidentId} was reported, but ${failures.length} media upload${failures.length === 1 ? '' : 's'} failed.`)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    e.target.value = ''
    if (selected.length === 0) return
    const errors: string[] = []
    const accepted: MediaItem[] = []
    for (const file of selected) {
      const key = `${file.name}-${file.size}-${file.lastModified}`
      if (items.some((i) => i.key === key)) { errors.push(`${file.name} is already selected.`); continue }
      if (!ACCEPT_MIME_TYPES.includes(file.type)) { errors.push(`${file.name}: unsupported type.`); continue }
      const kind = file.type.startsWith('image/') ? 'image' : 'video'
      if (kind === 'image' && file.size > MAX_PHOTO_BYTES) { errors.push(`${file.name}: photo exceeds the 10 MB limit.`); continue }
      if (kind === 'video' && file.size > MAX_VIDEO_BYTES) { errors.push(`${file.name}: video exceeds the 25 MB limit.`); continue }
      if (kind === 'video') {
        try {
          const duration = await readVideoDuration(file)
          if (!isFinite(duration) || duration <= 0) { errors.push(`${file.name}: could not read video duration.`); continue }
          if (duration > MAX_VIDEO_SECONDS) { errors.push(`${file.name}: video is ${Math.round(duration)}s long. Maximum allowed is ${MAX_VIDEO_SECONDS} seconds.`); continue }
          accepted.push({ key, file, previewUrl: URL.createObjectURL(file), kind, duration, status: 'ready' })
        } catch { errors.push(`${file.name}: could not read video duration.`) }
      } else {
        accepted.push({ key, file, previewUrl: URL.createObjectURL(file), kind, status: 'ready' })
      }
    }
    if (items.length + accepted.length > MAX_FILES) {
      accepted.slice(MAX_FILES - items.length).forEach((i) => URL.revokeObjectURL(i.previewUrl))
      errors.push(`Maximum ${MAX_FILES} files per incident.`)
      setItems((prev) => [...prev, ...accepted.slice(0, Math.max(0, MAX_FILES - items.length))])
      setValidationErrors(errors)
      return
    }
    setItems((prev) => [...prev, ...accepted])
    setValidationErrors(errors)
  }

  const removeItem = (key: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.key === key)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((i) => i.key !== key)
    })
  }

  const retryFailedUploads = async () => {
    if (!createdIncidentId) return
    setError(null)
    setSubmitting(true)
    try { await uploadMedia(createdIncidentId) } finally { setSubmitting(false) }
  }

  const hasFailedMedia = items.some((i) => i.status === 'error')
  const mapCenter: [number, number] = lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER
  const hasLocation = lat !== null && lng !== null

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Report Incident</CardTitle>
          <CardDescription>Submit a disaster report. Required fields are marked with *.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}
          {success && <div className="mb-4 p-3 rounded-md bg-green-100 text-green-800 text-sm">{success}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="disaster_type">Disaster Type *</Label>
              <Select name="disaster_type" id="disaster_type" required>
                <option value="">Select disaster type</option>
                <option value="FLOOD">Flood</option>
                <option value="CYCLONE">Cyclone</option>
                <option value="FIRE">Fire</option>
                <option value="EARTHQUAKE">Earthquake</option>
                <option value="BUILDING_COLLAPSE">Building Collapse</option>
                <option value="MEDICAL_EMERGENCY">Medical Emergency</option>
                <option value="ROAD_BLOCKAGE">Road Blockage</option>
                <option value="LANDSLIDE">Landslide</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea id="description" name="description" placeholder="Describe what happened..." rows={4} required />
            </div>

            <div className="space-y-2">
              <Label>Incident Location *</Label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={handleGetLocation} disabled={geoLoading} data-testid="get-location-btn">
                  {geoLoading ? 'Getting location...' : 'Get My Location'}
                </Button>
                {hasLocation && (
                  <span className="text-sm text-muted-foreground">
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                    {accuracy !== null && ` (accuracy: ~${Math.round(accuracy)}m)`}
                  </span>
                )}
              </div>
              {geoError && <p className="text-sm text-amber-600 mt-1">{geoError}</p>}

              <MapPanel
                center={mapCenter}
                zoom={hasLocation ? 14 : 10}
                draggable
                onDragEnd={handleMapDragEnd}
                height="h-48"
              />
              <p className="text-xs text-muted-foreground">Drag the pin to set the exact incident location.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="people_affected">People Affected *</Label>
                <Input id="people_affected" name="people_affected" type="number" min="0" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_number">Emergency Contact *</Label>
                <Input id="emergency_contact_number" name="emergency_contact_number" type="tel" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="media">Attach Media (optional, max {MAX_FILES} files, photo 10 MB, video 25 MB / {MAX_VIDEO_SECONDS}s)</Label>
              <Input id="media" name="media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple onChange={handleFileChange} disabled={submitting || !!createdIncidentId} />
              {validationErrors.length > 0 && (
                <div className="mt-2 space-y-1" role="alert">
                  {validationErrors.map((msg) => <div key={msg} className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">{msg}</div>)}
                </div>
              )}
              {items.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="media-preview-list">
                  {items.map((item) => (
                    <div key={item.key} className="relative border rounded-md overflow-hidden">
                      {item.kind === 'image' ? (
                        <img src={item.previewUrl} alt={`Preview of ${item.file.name}`} className="w-full h-28 object-cover" />
                      ) : (
                        <video src={item.previewUrl} className="w-full h-28 bg-black" preload="metadata" controls />
                      )}
                      <div className="p-1.5 text-xs space-y-0.5">
                        <p className="truncate font-medium" title={item.file.name}>{item.file.name}</p>
                        <p className="text-muted-foreground">{(item.file.size / 1024 / 1024).toFixed(1)} MB{item.duration ? ` \u00B7 ${Math.round(item.duration)}s` : ''}</p>
                        {item.status === 'uploading' && <p className="text-muted-foreground">Uploading...</p>}
                        {item.status === 'done' && <p className="text-green-700">Uploaded</p>}
                        {item.status === 'error' && <p className="text-destructive">Failed: {item.error}</p>}
                      </div>
                      {item.status !== 'uploading' && item.status !== 'done' && (
                        <button type="button" onClick={() => removeItem(item.key)} aria-label={`Remove ${item.file.name}`} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white text-sm leading-none">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {items.length > 0 && <p className="text-xs text-muted-foreground mt-1">{items.length} file(s) selected, media uploads after incident is created</p>}
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={submitting || !!createdIncidentId}>{submitting ? 'Submitting...' : 'Submit Report'}</Button>
              {createdIncidentId && hasFailedMedia && <Button type="button" variant="outline" onClick={retryFailedUploads} disabled={submitting}>{submitting ? 'Retrying...' : 'Retry Failed Uploads'}</Button>}
              <Link to="/"><Button type="button" variant="outline">Cancel</Button></Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
