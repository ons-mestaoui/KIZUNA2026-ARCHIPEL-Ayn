import type { ParcelConfig } from "./types";

const RHO = 1000; // kg/m³
const G = 9.81; // m/s²

/** Cell temperature from air temp and plane irradiance (NOCT ≈ 45 °C approximation). */
export function cellTemp(airC: number, gti: number): number {
  return airC + (25 * gti) / 800;
}

/** PV DC power available to the pump controller, W. */
export function pvPowerW(gti: number, airC: number, pv: ParcelConfig["pv"]): number {
  if (gti <= 0) return 0;
  const derate = 1 + pv.tempCoeff * (cellTemp(airC, gti) - 25);
  return Math.max(0, pv.kWp * 1000 * (gti / 1000) * pv.systemEfficiency * derate);
}

/** Pump flow at a given electrical power, m³/h. Q = P·η / (ρ g H). Zero below the start threshold. */
export function pumpFlowM3h(powerW: number, pump: ParcelConfig["pump"]): number {
  if (powerW < pump.minStartW) return 0;
  return ((powerW * pump.efficiency) / (RHO * G * pump.headM)) * 3600;
}
