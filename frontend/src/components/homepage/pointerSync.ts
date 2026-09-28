import gsap from 'gsap'

/**
 * One normalised pointer system for the public homepage.
 * A single GSAP-ticker callback lerps the target → current; consumers read
 * current without per-frame React state.  Touch / coarse pointers no-op.
 */
export interface PointerSample {
  /** Normalised -1…1, 0 = centre. */
  x: number
  y: number
  active: boolean
}

const target: PointerSample = { x: 0, y: 0, active: false }
const current: PointerSample = { x: 0, y: 0, active: false }

const listeners = new Set<(s: PointerSample) => void>()
let tickerAttached = false

function tick() {
  const dx = target.x - current.x
  const dy = target.y - current.y
  current.x += dx * 0.12
  current.y += dy * 0.12
  if (Math.abs(dx) < 0.0005) current.x = target.x
  if (Math.abs(dy) < 0.0005) current.y = target.y
  current.active = target.active
  const sample: PointerSample = { x: current.x, y: current.y, active: current.active }
  listeners.forEach((cb) => cb(sample))
}

function attachTicker() {
  if (tickerAttached) return
  tickerAttached = true
  gsap.ticker.add(tick)
}

function detachTicker() {
  if (listeners.size > 0 || tickerAttached === false) return
  tickerAttached = false
  gsap.ticker.remove(tick)
}

/**
 * Bind move / leave to `host`.  The callback fires every GSAP-tick while
 * at least one listener is registered — never React state.  Returns unbind.
 */
export function bindPointer(host: HTMLElement, onSample: (s: PointerSample) => void) {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) {
    return () => undefined
  }
  listeners.add(onSample)
  attachTicker()

  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect()
    target.x = ((e.clientX - r.left) / r.width) * 2 - 1
    target.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
    target.active = true
  }
  const onLeave = () => {
    target.x = 0
    target.y = 0
    target.active = false
  }
  host.addEventListener('pointermove', onMove)
  host.addEventListener('pointerleave', onLeave)
  host.addEventListener('pointercancel', onLeave)

  return () => {
    host.removeEventListener('pointermove', onMove)
    host.removeEventListener('pointerleave', onLeave)
    host.removeEventListener('pointercancel', onLeave)
    listeners.delete(onSample)
    detachTicker()
    // reset if last listener
    if (listeners.size === 0) {
      target.x = 0
      target.y = 0
      target.active = false
    }
  }
}

/** Current smoothed sample — frame-cheap. */
export function readPointer(): PointerSample {
  return current
}
