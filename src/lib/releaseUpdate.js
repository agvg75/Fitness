export const RUNNING_RELEASE_ID = typeof __RELEASE_ID__ !== "undefined" ? __RELEASE_ID__ : "dev"

export async function readRemoteReleaseId(fetchImpl = window.fetch.bind(window)) {
  const response = await fetchImpl("/version.json", { cache: "no-store" })
  if (!response.ok) return null

  const payload = await response.json()
  return typeof payload?.releaseId === "string" && payload.releaseId ? payload.releaseId : null
}

export function createReleaseUpdateMonitor({
  windowObject = window,
  documentObject = document,
  fetchImpl = windowObject.fetch.bind(windowObject),
  runningReleaseId = RUNNING_RELEASE_ID,
  onUpdateAvailable,
}) {
  let stopped = false
  let checkInFlight = null

  const check = () => {
    if (stopped) return Promise.resolve(null)
    if (checkInFlight) return checkInFlight

    checkInFlight = readRemoteReleaseId(fetchImpl)
      .then(remoteReleaseId => {
        if (!stopped && remoteReleaseId && remoteReleaseId !== runningReleaseId) {
          onUpdateAvailable(remoteReleaseId)
        }
        return remoteReleaseId
      })
      .catch(() => null)
      .finally(() => { checkInFlight = null })

    return checkInFlight
  }

  const handleVisibilityChange = () => {
    if (documentObject.visibilityState === "visible") check()
  }

  windowObject.addEventListener("pageshow", check)
  documentObject.addEventListener("visibilitychange", handleVisibilityChange)
  windowObject.addEventListener("focus", check)
  windowObject.addEventListener("online", check)
  check()

  return {
    check,
    stop() {
      stopped = true
      windowObject.removeEventListener("pageshow", check)
      documentObject.removeEventListener("visibilitychange", handleVisibilityChange)
      windowObject.removeEventListener("focus", check)
      windowObject.removeEventListener("online", check)
    },
  }
}

export async function reloadWithDurableState({ isCommitting, persistBeforeReload, reload }) {
  if (isCommitting) return { reloaded: false, reason: "commit-in-progress" }

  const persisted = await persistBeforeReload()
  if (persisted === false) return { reloaded: false, reason: "local-persist-failed" }

  reload()
  return { reloaded: true }
}
