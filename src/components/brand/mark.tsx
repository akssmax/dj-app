// Cue mark: Deck A and Deck B rings; their overlap is the mix.
// Colors follow the active theme (--primary for Deck A, --orange for Deck B).
export function CueMark({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="16"
        r="8"
        stroke="var(--mark-a, var(--primary, #5cc8f5))"
        strokeWidth="3"
      />
      <circle
        cx="20"
        cy="16"
        r="8"
        stroke="var(--mark-b, var(--orange, #f4e04d))"
        strokeWidth="3"
      />
      <path
        d="M16 9.07A8 8 0 0 1 16 22.93A8 8 0 0 1 16 9.07Z"
        fill="var(--mark-mix, var(--foreground, #f2f2f3))"
      />
    </svg>
  )
}

export function CueWordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="cue-wordmark" style={{ fontSize: size * 0.78 }}>
      <CueMark size={size} />
      <span>cue</span>
    </span>
  )
}
