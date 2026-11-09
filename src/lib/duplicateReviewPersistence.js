// Supabase persistence for review decisions only.
// This does not write canonical_sessions or affect load calculations.
export const REVIEW_KEY_PREFIX = "lift_duplicate_review_v2:"

const validDecisions = new Set(["same", "distinct", "uncertain"])
const hash = (s, seed) => {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36).padStart(7, "0")
}
const recordIdentity = record => {
  const id = typeof record?.session_id === "string" ? record.session_id.trim() : ""
  const start = String(record?.start_date ?? "")
  const end = String(record?.end_date ?? "")
  const category = String(record?.canonical_type || record?.type || "").trim().toLowerCase()
  if (!id || !start || !end || !category) return null
  return JSON.stringify([id, start, end, category])
}
export function reviewPairIdentity(first, second) {
  const a = recordIdentity(first), b = recordIdentity(second)
  if (!a || !b || a === b) return null
  return JSON.stringify([a, b].sort())
}
export function reviewStorageKey(pairIdentity) {
  if (typeof pairIdentity !== "string" || !pairIdentity) return null
  return REVIEW_KEY_PREFIX + hash(pairIdentity, 2166136261) + hash(pairIdentity, 2246822519)
}
function checkedUser(sb, userId) {
  if (!sb || typeof userId !== "string" || !userId.trim()) throw new Error("Authenticated Supabase user required")
}
export function normalizeReviewDecision(value, identity) {
  if (!value || value.pair_identity !== identity || !validDecisions.has(value.decision)) return null
  return {decision: value.decision, updated_at: value.updated_at || null}
}
export async function savePairReview(sb, userId, pairIdentity, decision, timestamp = new Date().toISOString()) {
  checkedUser(sb, userId)
  if (!validDecisions.has(decision) || !pairIdentity) throw new Error("Invalid review decision or pair identity")
  const key = reviewStorageKey(pairIdentity)
  const value = {schema: 2, pair_identity: pairIdentity, decision, updated_at: timestamp}
  const {error} = await sb.from("user_kv").upsert({
    user_id: userId, key, value, updated_at: timestamp
  }, {onConflict: "user_id,key"})
  if (error) throw new Error("Review decision could not be saved: " + error.message)
  return {key, value}
}
export async function loadPairReviews(sb, userId) {
  checkedUser(sb, userId)
  const result = {}
  for (let offset = 0; offset < 100000; offset += 500) {
    const {data, error} = await sb.from("user_kv")
      .select("key,value").eq("user_id", userId)
      .like("key", REVIEW_KEY_PREFIX + "%")
      .order("key", {ascending:true}).range(offset, offset+499)
    if (error) throw new Error("Review decisions could not be loaded: " + error.message)
    const batch = Array.isArray(data) ? data : []
    for (const row of batch) {
      const id = row?.value?.pair_identity
      if (typeof id !== "string" || reviewStorageKey(id) !== row.key) continue
      const normalized = normalizeReviewDecision(row.value, id)
      if (normalized) result[id] = normalized
    }
    if (batch.length < 500) return result
  }
  throw new Error("Review decision pagination safety limit exceeded")
}
