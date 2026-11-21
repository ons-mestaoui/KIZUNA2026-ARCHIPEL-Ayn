// The farmer app keeps the last good plan on the device so a field with no signal still shows it.
// That copy belongs to whoever was signed in, so it must be dropped whenever the account can change
// (sign-out, sign-in, the demo door): otherwise, on a shared phone or laptop, the next person whose
// first request fails would be shown the previous person's farm.
export const STATE_CACHE_KEY = "gd-state-v1";

export function clearStateCache() {
  try {
    localStorage.removeItem(STATE_CACHE_KEY);
  } catch {
    /* storage blocked: nothing was saved */
  }
}
