import { useSyncExternalStore } from "react"
import { useDJ } from "./context"

function useMidiActivity() {
  const { midiActivity } = useDJ()
  return useSyncExternalStore(
    midiActivity.subscribe,
    midiActivity.getSnapshot,
    midiActivity.getServerSnapshot
  )
}

export function MidiInputText() {
  return useMidiActivity().lastInput
}

export function MidiHistory() {
  const { history } = useMidiActivity()
  return (
    <ol>
      {history.map((entry, i) => (
        <li key={i}>{entry}</li>
      ))}
    </ol>
  )
}
