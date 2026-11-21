// Shared scene layout (1 unit ≈ 10 m). +x = east, −z = north, +z = south (camera side).
export const BLOCK = { x0: -8, x1: 8, z0: -6, z1: 6 };
export const LAYERS = { topsoil: 0.8, subsoil: 1.4, aquifer: 0.8 }; // thicknesses, stacked downward from y=0
export const PARCEL = { x0: -7.6, x1: 2.2, z0: -5.6, z1: 5.6 };
export const EQUIP_X = 2.6; // equipment yard starts here (east of the orchard)
// The borehole sits ON the east cut face so the cross-section shows it reaching the aquifer.
export const WELL = { x: 8.0, z: 0.2, r: 0.16 };
export const PUMP_HOUSE = { x: 7.0, z: 0.2 };
export const BASIN = { x: 5.2, z: 3.4, w: 3.2, d: 2.6, h: 0.7 };
export const ARRAY = { x: 5.6, rowsZ: [-5.0, -3.4], width: 4.4, tilt: (30 * Math.PI) / 180 };
export const ROWS = 12; // tree rows (north→south)
export const PER_ROW = 13; // trees per row (west→east)

export const COLORS = {
  soilDry: "#d2ae73",
  soilWet: "#4e3420",
  yard: "#c9b894",
  subsoil: "#8a6a45",
  aquifer: "#5c8796",
  canopy: "#3d7a3a",
  canopyStressed: "#a59a3a",
  trunk: "#5b4030",
  panel: "#1c2f5c",
  sun: "#e3a21a",
  water: "#1aa3b8",
  concrete: "#d9d6cc",
  pipe: "#6d7480",
};
