// Coalesce rapid control changes and serialize commits so older saves cannot
// finish after newer ones. Every caller still receives success/failure.
export function latestWriter<T>(
  commit: (value: T) => Promise<void>,
  delay = 150
) {
  type Waiter = { resolve: () => void; reject: (error: unknown) => void }
  let pending: { value: T; waiters: Waiter[] } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  const schedule = () => {
    if (!timer && !running && pending)
      timer = setTimeout(() => void flush(), delay)
  }
  const flush = async (): Promise<void> => {
    clearTimeout(timer)
    timer = undefined
    if (running) {
      await running
      if (pending) await flush()
      return
    }
    if (!pending) return
    const batch = pending
    pending = undefined
    running = Promise.resolve()
      .then(() => commit(batch.value))
      .then(
        () => batch.waiters.forEach((waiter) => waiter.resolve()),
        (error: unknown) =>
          batch.waiters.forEach((waiter) => waiter.reject(error))
      )
    await running
    running = undefined
    await flush()
  }
  return {
    write(value: T) {
      const promise = new Promise<void>((resolve, reject) => {
        const waiters = pending?.waiters ?? []
        waiters.push({ resolve, reject })
        pending = { value, waiters }
      })
      schedule()
      return promise
    },
    flush,
  }
}
