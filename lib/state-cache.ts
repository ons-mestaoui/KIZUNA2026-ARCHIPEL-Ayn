// The farmer app keeps the last good plan on the device so a field with no signal still shows it.
// That copy belongs to whoever was signed in, so it must be dropped whenever the account can change
// (sign-out, sign-in, the demo door): otherwise, on a shared phone or laptop, the next person whose
// first request fails would be shown the previous person's farm.
export const STATE_CACHE_KEY = "gd-state-v1";
/** The last good satellite view of the field (outline, readings, zones): the same privacy rule applies. */
export const FIELD_CACHE_KEY = "gd-field-v1";

export function clearStateCache() {
  for (const key of [STATE_CACHE_KEY, FIELD_CACHE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage blocked: nothing was saved */
    }
  }
}
