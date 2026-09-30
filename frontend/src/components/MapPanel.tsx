import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { severityColor } from '../lib/severityColor'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  label: string
  severity?: string
  status?: string
  onClick?: () => void
}

interface MapPanelProps {
  center: [number, number]
  zoom?: number
  markers?: MapMarker[]
  draggable?: boolean
  onDragEnd?: (lat: number, lng: number) => void
  height?: string
}

function statusGlyph(status?: string): { label: string; svg: string } {
  switch (status) {
    case 'REPORTED':
      return {
        label: 'Reported',
        svg: '<path d="M12 4 22 20H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/>',
      }
    case 'TRIAGE_PENDING':
      return {
        label: 'Triage pending',
        svg: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      }
    case 'IN_RESPONSE':
      return {
        label: 'In response',
        svg: '<path d="M13.2 2 4 14h6l-1.2 8L18 10h-6z" fill="currentColor"/>',
      }
    case 'RESOLVED':
      return {
        label: 'Resolved',
        svg: '<path d="M5 12.5 10 17.5 19 6.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
      }
    default:
      return { label: 'Location', svg: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/>' }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function makeDivIcon(severity?: string, status?: string, label?: string, isDraggable?: boolean): L.DivIcon {
  const color = severityColor(severity)
  const { label: glyphLabel, svg } = statusGlyph(status)
  const a11yLabel = label
    ? `${label}${severity ? `, severity ${severity}` : ''}, ${glyphLabel}`
    : `${glyphLabel}${severity ? `, severity ${severity}` : ''}`
  const glyph = `<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" aria-hidden="true" focusable="false">${svg}</svg>`
  const size = isDraggable ? 'w-8 h-8' : 'w-6 h-6'
  return L.divIcon({
    className: '',
    iconSize: [isDraggable ? 32 : 24, isDraggable ? 32 : 24],
    iconAnchor: [isDraggable ? 16 : 12, isDraggable ? 32 : 24],
    html: `<div role="img" aria-label="${escapeHtml(a11yLabel)}" class="${size} flex items-center justify-center rounded-full border-2 border-white text-white font-bold shadow-lg" style="background:${color}">${glyph}</div>`,
  })
}

function makeDraggableIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    html: '<div role="img" aria-label="Your location, drag to adjust" title="Drag to adjust location" class="w-8 h-8 flex items-center justify-center rounded-full border-2 border-white bg-cobalt-deep text-white shadow-lg cursor-grab">' +
      '<svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true" focusable="false">' +
      '<path d="M12 2c3.4 0 6 2.6 6 6 0 4.4-6 12-6 12S6 12.4 6 8c0-3.4 2.6-6 6-6z" fill="currentColor"/>' +
      '<circle cx="12" cy="8" r="2.2" fill="var(--brand-cobalt-deep)"/></svg>' +
      '</div>',
  })
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center[0], center[1], zoom, map])
  return null
}

export function MapPanel({
  center,
  zoom = 12,
  markers = [],
  draggable = false,
  onDragEnd,
  height = 'h-64',
}: MapPanelProps) {
  const handleDragEnd = (e: L.DragEndEvent) => {
    const { lat, lng } = e.target.getLatLng()
    onDragEnd?.(lat, lng)
  }

  return (
    <div className={`${height} relative z-0 rounded-lg overflow-hidden border`} role="region" aria-label="Incident Map">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
        <Recenter center={center} zoom={zoom} />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={makeDivIcon(m.severity, m.status, m.label, false)}
            eventHandlers={m.onClick ? { click: m.onClick } : undefined}
          />
        ))}
        {draggable && (
          <Marker
            position={center}
            icon={makeDraggableIcon()}
            draggable
            eventHandlers={{ dragend: handleDragEnd }}
          />
        )}
      </MapContainer>
    </div>
  )
}
