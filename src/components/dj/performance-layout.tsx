import { Deck, Mixer } from "./deck"

export default function PerformanceLayout() {
  return (
    <section className="performance-grid" aria-label="DJ decks and mixer">
      <Deck id="A" />
      <Mixer />
      <Deck id="B" />
    </section>
  )
}
