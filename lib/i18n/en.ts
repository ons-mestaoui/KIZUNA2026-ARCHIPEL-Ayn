// English is the source of truth: ar.ts and ja.ts must provide every key (enforced by the Dict type).
export const en = {
  appName: "Goutte d'Or",
  tagline: "Know exactly when to water your farm.",
  common: {
    signIn: "Sign in",
    signUp: "Create account",
    signOut: "Sign out",
    email: "Email",
    password: "Password",
    name: "Your name",
    loading: "Loading…",
    back: "Back",
    next: "Next",
    save: "Save",
    cancel: "Cancel",
    language: "Language",
  },
  landing: {
    title: "Water your farm with the weather and the sun, not guesswork.",
    lead: "Tell us where your farm is. Goutte d'Or reads the weather and the satellites, then tells you when to water, how much, and when to run your solar pump.",
    cta: "Create your farm account",
    haveAccount: "I already have an account",
    features: [
      { title: "Watering plan", text: "A daily and 7-day plan for your own farm." },
      { title: "Leaf check", text: "Take a photo of a leaf. Find out if it is thirst, hunger or a pest." },
      { title: "Ask anything", text: "Chat in Arabic, Tunisian, French, Japanese or English, and hear the answer out loud." },
      { title: "Seen from space", text: "Rain, soil moisture and heat from Japanese and European satellites." },
    ],
    kizuna: "Built for the Kizuna hackathon, Tunisia × Japan.",
  },
  auth: {
    signInTitle: "Welcome back",
    signUpTitle: "Create your account",
    noAccount: "New here?",
    hasAccount: "Already have an account?",
    passwordHint: "At least 8 characters",
    noReset: "This prototype has no password reset. Keep your password safe.",
    errors: {
      generic: "Something went wrong. Try again.",
      invalid: "Wrong email or password.",
      exists: "This email already has an account.",
      short: "The password needs at least 8 characters.",
      offline: "Cannot reach the server. Check your connection.",
    },
  },
  shell: {
    hello: "Hello, {name}",
    tabs: {
      today: "Today",
      week: "Week",
      leaf: "Leaf check",
      ask: "Ask",
      satellite: "Satellite",
      farm: "Farm",
    },
    soon: "This part of your farm app is being built.",
  },
};

export type Dict = typeof en;
