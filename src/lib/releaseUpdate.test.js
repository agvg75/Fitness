import assert from "node:assert/strict"
import test from "node:test"
import { createReleaseUpdateMonitor, reloadWithDurableState } from "./releaseUpdate.js"

class MockEventTarget {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type })
  }
}

const flushPromises = () => new Promise(resolve => setImmediate(resolve))

test("same release on startup does not surface an update", async () => {
  const windowObject = new MockEventTarget()
  const documentObject = new MockEventTarget()
  documentObject.visibilityState = "visible"
  let updates = 0

  const monitor = createReleaseUpdateMonitor({
    windowObject,
    documentObject,
    runningReleaseId: "release-a",
    fetchImpl: async () => ({ ok: true, json: async () => ({ releaseId: "release-a" }) }),
    onUpdateAvailable: () => { updates += 1 },
  })
  await flushPromises()

  assert.equal(updates, 0)
  monitor.stop()
})

test("new release remains available across foreground and resume checks", async () => {
  const windowObject = new MockEventTarget()
  const documentObject = new MockEventTarget()
  documentObject.visibilityState = "visible"
  let updateAvailable = false

  const monitor = createReleaseUpdateMonitor({
    windowObject,
    documentObject,
    runningReleaseId: "release-a",
    fetchImpl: async () => ({ ok: true, json: async () => ({ releaseId: "release-b" }) }),
    onUpdateAvailable: () => { updateAvailable = true },
  })
  await flushPromises()
  assert.equal(updateAvailable, true)

  windowObject.dispatch("pageshow")
  documentObject.dispatch("visibilitychange")
  windowObject.dispatch("focus")
  windowObject.dispatch("online")
  await flushPromises()
  assert.equal(updateAvailable, true)
  monitor.stop()
})

test("offline release checks fail silently", async () => {
  const windowObject = new MockEventTarget()
  const documentObject = new MockEventTarget()
  documentObject.visibilityState = "visible"
  let updates = 0

  const monitor = createReleaseUpdateMonitor({
    windowObject,
    documentObject,
    fetchImpl: async () => { throw new TypeError("offline") },
    onUpdateAvailable: () => { updates += 1 },
  })
  await flushPromises()

  assert.equal(updates, 0)
  monitor.stop()
})

test("reload persists locally first and does not reload during a commit", async () => {
  const calls = []
  const result = await reloadWithDurableState({
    isCommitting: false,
    persistBeforeReload: async () => { calls.push("persist"); return true },
    reload: () => calls.push("reload"),
  })
  assert.deepEqual(calls, ["persist", "reload"])
  assert.equal(result.reloaded, true)

  let reloadedDuringCommit = false
  const blocked = await reloadWithDurableState({
    isCommitting: true,
    persistBeforeReload: async () => true,
    reload: () => { reloadedDuringCommit = true },
  })
  assert.equal(reloadedDuringCommit, false)
  assert.equal(blocked.reason, "commit-in-progress")
})

test("failed local persistence prevents document reload", async () => {
  let reloaded = false
  const result = await reloadWithDurableState({
    isCommitting: false,
    persistBeforeReload: async () => false,
    reload: () => { reloaded = true },
  })
  assert.equal(reloaded, false)
  assert.equal(result.reason, "local-persist-failed")
})
