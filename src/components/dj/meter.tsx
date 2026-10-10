import type { CSSProperties } from "react"

export function Meter({
  value,
  horizontal = false,
}: {
  value: number
  horizontal?: boolean
}) {
  return (
    <div
      className={`level-meter ${horizontal ? "meter-horizontal" : ""}`}
      aria-label={`Audio level ${Math.round(value * 100)} percent`}
    >
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className={i / 14 < value ? "meter-lit" : ""}
          style={
            {
              "--meter-color":
                i > 11 ? "#ff795f" : i > 9 ? "#d7e684" : "#a9cc6e",
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
