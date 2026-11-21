"use client";

import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { useApp, usePlan, useScenario } from "@/lib/store";
import { Diorama } from "./Diorama";
import { LabelOverlay, LabelProjector } from "./labels";
import { Orchard } from "./Orchard";
import { SunAndSky } from "./SunAndSky";
import { WaterSystem } from "./WaterSystem";

const FIT_RADIUS = 9.6; // ≈ the diorama seen from the 3/4 view
const FOV = 32;

/** Fit the diorama in view for any aspect ratio (portrait phone → wide projector). */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / size.height;
    const vHalf = THREE.MathUtils.degToRad(FOV / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const dist = FIT_RADIUS / Math.sin(Math.min(vHalf, hHalf));
    const dir = new THREE.Vector3(0.55, 0.55, 0.68).normalize();
    camera.position.copy(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, -0.8, 0));
    camera.lookAt(0, -0.8, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

export default function Twin() {
  const plan = usePlan();
  const scenario = useScenario();
  const [dpr, setDpr] = useState(1.5);
  const [shadows, setShadows] = useState(false);

  // real-time shadows only on fine-pointer (desktop) devices
  useEffect(() => {
    setShadows(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // play: advance the clock ~1 h per second
  const playing = useApp((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const st = useApp.getState();
      st.setHour(st.hour + ((now - last) / 1000) * 1.0);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div className="relative h-full w-full">
    <Canvas
      dpr={[1, dpr]}
      shadows={shadows}
      camera={{ fov: FOV, near: 0.5, far: 5000, position: [14, 14, 17] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ touchAction: "none" }}
      aria-label="3D digital twin of the farm: orchard, solar panels, pump, well and water basin"
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <CameraRig />
      <LabelProjector />
      <Suspense fallback={null}>
        <SunAndSky
          date={plan.date}
          lat={scenario.location.lat}
          lon={scenario.location.lon}
          shadows={shadows}
        />
        <Diorama />
        <Orchard plan={plan} shadows={shadows} />
        <WaterSystem plan={plan} shadows={shadows} />
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableDamping
        minDistance={14}
        maxDistance={70}
        minPolarAngle={0.35}
        maxPolarAngle={1.25}
        target={[0, -0.8, 0]}
      />
    </Canvas>
    <LabelOverlay />
    </div>
  );
}
