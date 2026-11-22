"use client";

import { useState } from "react";
import { Nav } from "./Nav";
import { About, DayLoop, FinalCta, Footer, Honest, Languages } from "./Sections";
import { Stage } from "./Stage";
import { TourDialog } from "./TourDialog";

/**
 * The public front door. It never mentions the pitch mode: that stays behind its hidden doors (Shift+D, the logo held
 * for 1.5 s, the ?demo link), all handled by <DemoTrigger> around the logo in <Nav>.
 */
export function LandingPage() {
  const [tour, setTour] = useState(false);
  return (
    <>
      <Nav />
      <main id="main" tabIndex={-1} className="outline-none">
        <Stage onWatch={() => setTour(true)} />
        <DayLoop />
        <Languages />
        <Honest />
        <About />
        <FinalCta />
      </main>
      <Footer />
      <TourDialog open={tour} onClose={() => setTour(false)} />
    </>
  );
}
