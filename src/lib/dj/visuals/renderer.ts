import { SPECTRUM_BINS } from "./features"
import { scenes } from "./scenes"
import type { VisualFrame } from "./features"

const uniformNames = [
  "uRes",
  "uTime",
  "uPulse",
  "uBass",
  "uMid",
  "uHigh",
  "uBar",
  "uTravel",
  "uFlash",
  "uEnergy",
  "uPal",
  "uSpec",
] as const
type Program = {
  program: WebGLProgram
  uniforms: Record<(typeof uniformNames)[number], WebGLUniformLocation | null>
}

/**
 * Draws one full-screen shader per frame. Resolution adapts: when frames
 * arrive late for the display's refresh rate the render scale drops (down
 * to half), and creeps back up once there is headroom again.
 */
export class VisualRenderer {
  private gl: WebGLRenderingContext
  private programs = new Map<number, Program>()
  private texture: WebGLTexture | null = null
  private scene = 0
  private scale = 1
  private refresh = 1000 / 60
  private average = 1000 / 60
  private slow = 0
  private steady = 0
  private lost = false

  constructor(private canvas: HTMLCanvasElement) {
    const options = { antialias: false, alpha: false, depth: false }
    const gl =
      canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options)
    if (!gl) throw new Error("WebGL is not available in this browser.")
    this.gl = gl
    canvas.addEventListener("webglcontextlost", this.onLost)
    canvas.addEventListener("webglcontextrestored", this.onRestored)
    this.setup()
  }

  get renderScale() {
    return this.scale
  }

  setScene(index: number) {
    this.scene = ((index % scenes.length) + scenes.length) % scenes.length
  }

  /** `interval` is the time since the previous frame in ms. */
  render(frame: VisualFrame, time: number, interval: number) {
    if (this.lost) return
    this.adapt(interval)
    const gl = this.gl,
      ratio = Math.min(window.devicePixelRatio || 1, 2) * this.scale,
      width = Math.max(1, Math.round(this.canvas.clientWidth * ratio)),
      height = Math.max(1, Math.round(this.canvas.clientHeight * ratio))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    gl.viewport(0, 0, width, height)
    const { program, uniforms: u } = this.program(this.scene)
    gl.useProgram(program)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      SPECTRUM_BINS,
      1,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      frame.spectrum
    )
    gl.uniform2f(u.uRes, width, height)
    gl.uniform1f(u.uTime, time)
    gl.uniform1f(u.uPulse, frame.pulse)
    gl.uniform1f(u.uBass, frame.bass)
    gl.uniform1f(u.uMid, frame.mid)
    gl.uniform1f(u.uHigh, frame.high)
    gl.uniform1f(u.uBar, frame.bar)
    gl.uniform1f(u.uTravel, frame.travel)
    gl.uniform1f(u.uFlash, frame.flash)
    gl.uniform1f(u.uEnergy, frame.energy)
    gl.uniform3fv(u.uPal, frame.palette)
    gl.uniform1i(u.uSpec, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost)
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored)
    for (const { program } of this.programs.values())
      this.gl.deleteProgram(program)
    this.programs.clear()
    this.gl.getExtension("WEBGL_lose_context")?.loseContext()
  }

  private adapt(interval: number) {
    if (interval <= 0 || interval > 250) return
    this.average += (interval - this.average) * 0.1
    // The fastest steady interval seen is the display's refresh period.
    this.refresh = Math.min(
      Math.max(this.refresh + 0.002, 1000 / 240),
      this.average
    )
    if (this.average > this.refresh * 1.2) {
      this.steady = 0
      if (++this.slow > 20 && this.scale > 0.5) {
        this.scale = Math.max(0.5, this.scale - 0.1)
        this.slow = 0
      }
    } else {
      this.slow = 0
      if (++this.steady > 240 && this.scale < 1) {
        this.scale = Math.min(1, this.scale + 0.05)
        this.steady = 0
      }
    }
  }

  private setup() {
    const gl = this.gl
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // One oversized triangle covers the screen without a seam.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      SPECTRUM_BINS,
      1,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      new Uint8Array(SPECTRUM_BINS)
    )
    // Compile every scene up front so switching on a drop never stalls a frame.
    scenes.forEach((_, index) => this.program(index))
  }

  private program(index: number) {
    const cached = this.programs.get(index)
    if (cached) return cached
    const gl = this.gl,
      program = gl.createProgram()
    gl.attachShader(
      program,
      this.shader(
        gl.VERTEX_SHADER,
        "attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }"
      )
    )
    gl.attachShader(
      program,
      this.shader(gl.FRAGMENT_SHADER, scenes[index].source)
    )
    gl.bindAttribLocation(program, 0, "p")
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed")
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const entry = {
      program,
      uniforms: Object.fromEntries(
        uniformNames.map((name) => [
          name,
          gl.getUniformLocation(program, name === "uPal" ? "uPal[0]" : name),
        ])
      ) as Program["uniforms"],
    }
    this.programs.set(index, entry)
    return entry
  }

  private shader(type: number, source: string) {
    const gl = this.gl,
      shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed")
    return shader
  }

  private onLost = (event: Event) => {
    event.preventDefault()
    this.lost = true
  }
  private onRestored = () => {
    this.programs.clear()
    this.setup()
    this.lost = false
  }
}
