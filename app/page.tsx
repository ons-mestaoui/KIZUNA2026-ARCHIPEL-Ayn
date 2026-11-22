import { LandingPage } from "@/components/landing/LandingPage";

// The public front door. Static: nothing here reads the session or the URL (the hidden doors are client-side).
export default function Home() {
  return <LandingPage />;
}
