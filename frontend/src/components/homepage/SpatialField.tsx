import { useEffect, useRef } from 'react'
import { Renderer, Camera, Transform, Geometry, Program, Mesh } from 'ogl'
import { prefersReducedMotion } from './homeMotion'
import { readPointer } from './pointerSync'

const VERTEX = `
  attribute vec3 position;
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uMouse;
  varying float vAlpha;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  void main() {
    vec3 p = position;
    // Ambient drift
    p.x += sin(uTime * 0.1 + aPhase) * 0.2;
    p.y += cos(uTime * 0.08 + aPhase * 1.7) * 0.2;
    
    // Mouse proximity: subtle spatial disturbance (points near cursor shift away)
    float dist = distance(p.xy, uMouse);
    float force = exp(-dist * dist * 2.0) * 0.15;
    p.xy += normalize(p.xy - uMouse + 0.001) * force;
    
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vAlpha = clamp(1.0 - (-mv.z) / 5.5, 0.2, 0.8);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (0.6 + vAlpha * 0.4 + force * 2.0);
  }
`

const FRAGMENT = `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float core = smoothstep(0.5, 0.06, d);
    if (core < 0.01) discard;
    gl_FragColor = vec4(uColor, core * vAlpha * uOpacity);
  }
`

const RECOUNT = 240 // Tablet-friendly count

/**
 * Restrained particle field for the hero (OGL WebGL). Slow spatial drift in
 * cobalt, gated by IntersectionObserver so the loop pauses offscreen, hidden
 * entirely on mobile and under reduced motion, blending into the existing
 * photo + scrim layers.
 */
export function SpatialField({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const initialised = useRef(false)

  useEffect(() => {
    if (!active || initialised.current) return
    // Reduced motion and mobile skip WebGL entirely.
    if (prefersReducedMotion()) return
    if (!window.matchMedia('(min-width: 641px)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const canvas = ref.current
    if (!canvas) return

    let renderer: Renderer | null = null
    let program: Program | null = null
    let mesh: Mesh | null = null
    let scene: Transform | null = null
    let camera: Camera | null = null
    let gl: Renderer['gl'] | null = null
    let onResize: (() => void) | null = null
    let io: IntersectionObserver | null = null
    let raf = 0
    let visible = true

    try {
      renderer = new Renderer({
        canvas,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        alpha: true,
      })
      initialised.current = true
      gl = renderer.gl
      camera = new Camera(gl, { fov: 50, near: 0.1, far: 25 })
      camera.position.z = 6

      const count = RECOUNT
      const positions = new Float32Array(count * 3)
      const sizes = new Float32Array(count)
      const phases = new Float32Array(count)
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (Math.random() * 2 - 1) * 5.2
        positions[i * 3 + 1] = (Math.random() * 2 - 1) * 2.7
        positions[i * 3 + 2] = Math.random() * 5 - 2.6
        sizes[i] = 2 + Math.random() * 3
        phases[i] = Math.random() * Math.PI * 2
      }

      const geometry = new Geometry(gl, {
        position: { size: 3, data: positions },
        aSize: { size: 1, data: sizes },
        aPhase: { size: 1, data: phases },
      })

      program = new Program(gl, {
        vertex: VERTEX,
        fragment: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
      // A driver can fail to compile/link the shader (e.g. software WebGL),
      // leaving uniforms empty. Treat that like "no WebGL" and hide the field.
      if (!program.uniforms.uTime || !program.uniforms.uOpacity || !program.uniforms.uMouse) {
        throw new Error('shader uniforms unavailable')
      }
      program.uniforms.uTime.value = 0
      program.uniforms.uMouse.value = [0, 0]
      program.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2)
      program.uniforms.uColor.value = [0.086, 0.286, 0.722]
      program.uniforms.uOpacity.value = 0

      mesh = new Mesh(gl, { geometry, program })
      scene = new Transform()
      mesh.setParent(scene)

      renderer.setSize(window.innerWidth, window.innerHeight)
      const sized = renderer
      onResize = () => sized.setSize(window.innerWidth, window.innerHeight)
      window.addEventListener('resize', onResize)

      io = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting
        },
        { threshold: 0.05 },
      )
      io.observe(canvas)
    } catch {
      canvas.style.display = 'none'
      return
    }

    let elapsed = 0
    const loop = (t: number) => {
      elapsed = t * 0.001
      if (program && program.uniforms.uTime) {
        program.uniforms.uTime.value = elapsed
        program.uniforms.uOpacity.value = Math.min(0.85, program.uniforms.uOpacity.value + 0.01)
        // Read shared pointer state
        const p = readPointer()
        program.uniforms.uMouse.value = [p.x, p.y]
      }
      if (visible && renderer && scene && camera) renderer.render({ scene, camera })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const ioRef = io
    const resizeRef = onResize
    return () => {
      cancelAnimationFrame(raf)
      ioRef?.disconnect()
      if (resizeRef) window.removeEventListener('resize', resizeRef)
      mesh?.setParent(null)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
      if (gl?.canvas) {
        gl.canvas.width = 1
        gl.canvas.height = 1
      }
    }
  }, [active])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="hero-field"
    />
  )
}