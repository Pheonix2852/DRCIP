import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'

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

export function severityColor(severity?: string): string {
  switch (severity) {
    case 'CRITICAL': return '#dc2626'
    case 'HIGH': return '#ea580c'
    case 'MEDIUM': return '#ca8a04'
    case 'LOW': return '#2563eb'
    default: return '#6b7280'
  }
}

function statusIcon(status?: string): string {
  switch (status) {
    case 'REPORTED': return '\u26A0'
    case 'TRIAGE_PENDING': return '\u23F3'
    case 'IN_RESPONSE': return '\u2692'
    case 'RESOLVED': return '\u2714'
    default: return '\u2022'
  }
}

function makeDivIcon(severity?: string, status?: string, isDraggable?: boolean): L.DivIcon {
  const color = severityColor(severity)
  const icon = statusIcon(status)
  const size = isDraggable ? 'w-8 h-8 text-base' : 'w-6 h-6 text-xs'
  return L.divIcon({
    className: '',
    iconSize: [isDraggable ? 32 : 24, isDraggable ? 32 : 24],
    iconAnchor: [isDraggable ? 16 : 12, isDraggable ? 32 : 24],
    html: `<div class="${size} flex items-center justify-center rounded-full border-2 border-white text-white font-bold shadow-lg" style="background:${color}">${icon}</div>`,
  })
}

function makeDraggableIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    html: '<div class="w-8 h-8 flex items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white font-bold text-sm shadow-lg cursor-grab" title="Drag to adjust location">\u{1F4CD}</div>',
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
    <div className={`${height} relative z-0 rounded-lg overflow-hidden border`}>
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
            icon={makeDivIcon(m.severity, m.status, false)}
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
