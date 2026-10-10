// 20 ms peak windows preserve transients when zoomed; long tracks are bounded.
export function measurePeaks(channels: Float32Array[], sampleRate: number) {
  const length = channels[0]?.length ?? 0
  const step = Math.max(
    1,
    Math.ceil(length / 32768),
    Math.round(sampleRate * 0.02)
  )
  const peaks: number[] = []
  for (let i = 0; i < length; i += step) {
    let peak = 0
    for (const channel of channels)
      for (let j = i; j < Math.min(i + step, length); j++)
        peak = Math.max(peak, Math.abs(channel[j]))
    peaks.push(peak)
  }
  return peaks
}

export function waveformPath(
  peaks: number[],
  fullDuration: number,
  start: number,
  end: number,
  height: number
) {
  if (!peaks.length || end <= start) return ""
  const first = Math.max(0, Math.floor((start / fullDuration) * peaks.length))
  const last = Math.min(
    peaks.length,
    Math.ceil((end / fullDuration) * peaks.length)
  )
  const bin = Math.max(1, Math.ceil((last - first) / 640))
  const width = Math.max(
    0.7,
    ((bin * fullDuration) / peaks.length / (end - start)) * 800 - 0.7
  )
  const path: string[] = []
  for (let i = first; i < last; i += bin) {
    let peak = 0
    for (let j = i; j < Math.min(last, i + bin); j++)
      peak = Math.max(peak, peaks[j])
    const x =
      (((i / peaks.length) * fullDuration - start) / (end - start)) * 800
    const h = Math.max(2, peak * (height - 15)),
      y = (height - h) / 2
    path.push(
      `M${x.toFixed(2)},${y.toFixed(2)}h${width.toFixed(2)}v${h.toFixed(2)}h-${width.toFixed(2)}Z`
    )
  }
  return path.join("")
}
