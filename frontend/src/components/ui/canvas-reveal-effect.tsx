import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"

interface CanvasRevealEffectProps {
  paused?: boolean
  animationSpeed?: number
  containerClassName?: string
  colors?: [string, string]
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uPaused;
  uniform float uReveal;

  void main() {
    float cells = 26.0;
    vec2 coord = vUv * cells;
    vec2 local = fract(coord) - 0.5;

    float square = 1.0 - smoothstep(0.30, 0.42, max(abs(local.x), abs(local.y)));

    float d = distance(vUv, uPointer);
    float pulse = smoothstep(0.55, 0.0, d);
    pulse *= 0.5 + 0.5 * sin(uTime * 3.0 - d * 18.0);
    if (uPaused > 0.5) pulse *= 0.35;

    vec3 color = mix(uColorA, uColorB, pulse);
    float alpha = square * (0.16 + 0.55 * uReveal + 0.5 * pulse);
    gl_FragColor = vec4(color, alpha);
  }
`

function GridPlane({
  paused,
  animationSpeed,
  colors,
}: {
  paused?: boolean
  animationSpeed: number
  colors: [string, string]
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uColorA: { value: new THREE.Color(colors[0]) },
      uColorB: { value: new THREE.Color(colors[1]) },
      uPaused: { value: paused ? 1 : 0 },
      uReveal: { value: 0 },
    }),
    // colors/paused are static per mount; recreate only on first mount.
    [],
  )

  useFrame((state, delta) => {
    const mat = materialRef.current
    if (!mat) return
    const u = mat.uniforms
    u.uTime.value += delta * animationSpeed
    u.uPaused.value = paused ? 1 : 0
    u.uReveal.value = Math.min(1, u.uReveal.value + delta * 1.6)
    // state.pointer is NDC [-1,1]; map into the shader's uv space.
    const target = state.pointer
    u.uPointer.value.lerp(new THREE.Vector2((target.x + 1) / 2, 1 - (target.y + 1) / 2), 0.08)
  })

  return (
    <mesh scale={[2, 2, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial ref={materialRef} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} transparent depthWrite={false} />
    </mesh>
  )
}

/**
 * Animated "response grid" rendered over the final homepage reveal. Canvas
 * geometry is trivial (one textured plane) so it stays cheap; WebGL context
 * is created lazily by the consumer (React.lazy) and disposed on unmount.
 */
export function CanvasRevealEffect({
  paused,
  animationSpeed = 0.4,
  containerClassName,
  colors = ["#1649B8", "#2F68F0"],
}: CanvasRevealEffectProps) {
  return (
    <div className={containerClassName}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
        camera={{ position: [0, 0, 1] }}
      >
        <GridPlane paused={paused} animationSpeed={animationSpeed} colors={colors} />
      </Canvas>
    </div>
  )
}