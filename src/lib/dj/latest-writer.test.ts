import { afterEach, describe, expect, it, vi } from "vitest"
import { latestWriter } from "./latest-writer"

afterEach(() => vi.useRealTimers())
describe("library save queue", () => {
  it("coalesces rapid changes while resolving every caller", async () => {
    vi.useFakeTimers()
    const commit = vi.fn(async (_value: number) => {})
    const writer = latestWriter(commit)
    const a = writer.write(1),
      b = writer.write(2),
      c = writer.write(3)
    expect(commit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    await Promise.all([a, b, c])
    expect(commit.mock.calls).toEqual([[3]])
  })
  it("serializes a slow save and flushes the newest pending snapshot", async () => {
    let finish!: () => void
    const commit = vi.fn((value: number) =>
      value === 1
        ? new Promise<void>((resolve) => {
            finish = resolve
          })
        : Promise.resolve()
    )
    const writer = latestWriter(commit)
    const first = writer.write(1)
    const flushing = writer.flush()
    await Promise.resolve()
    const second = writer.write(2),
      third = writer.write(3)
    const nextFlush = writer.flush()
    expect(commit.mock.calls).toEqual([[1]])
    finish()
    await Promise.all([first, second, third, flushing, nextFlush])
    expect(commit.mock.calls).toEqual([[1], [3]])
  })
  it("reports a failed save to all callers and permits a retry", async () => {
    const error = new Error("Storage full")
    const commit = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined)
    const writer = latestWriter<number>(commit)
    const a = writer.write(1),
      b = writer.write(2)
    const result = Promise.allSettled([a, b])
    await writer.flush()
    expect(await result).toEqual([
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ])
    const retry = writer.write(3)
    await writer.flush()
    await expect(retry).resolves.toBeUndefined()
  })
})
