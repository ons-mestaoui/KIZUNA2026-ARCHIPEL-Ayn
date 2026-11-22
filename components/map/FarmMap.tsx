"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Polygon, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { isSimplePolygon } from "@/lib/field/geo";
import type { LonLat } from "@/lib/field/types";

export type LayerId = "streets" | "satellite" | "sentinel";

export const MAP_LAYERS: Record<LayerId, { url: string; attribution: string; maxZoom: number; maxNativeZoom?: number }> = {
  streets: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  },
  // Copernicus Sentinel-2, cloud-free mosaic (10 m pixels) — CC BY-NC-SA 4.0
  sentinel: {
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
    attribution: "Sentinel-2 cloudless 2024 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024)",
    maxZoom: 17,
    maxNativeZoom: 14,
  },
};

// Our own pin: avoids Leaflet's default-icon asset problem with bundlers.
const dropIcon = L.divIcon({
  className: "gd-pin",
  html: '<svg width="34" height="42" viewBox="0 0 18 22" xmlns="http://www.w3.org/2000/svg"><path d="M9 1C9 1 1.5 10 1.5 14.2a7.5 7.5 0 0 0 15 0C16.5 10 9 1 9 1Z" fill="#e3a21a" stroke="#17264a" stroke-width="1.1"/></svg>',
  iconSize: [34, 42],
  iconAnchor: [17, 40],
});

// Corner handles of the outline: a 44 px touch target around a small dot (styled in globals.css). The first corner is filled.
const cornerIcon = L.divIcon({ className: "gd-corner", html: "<span></span>", iconSize: [44, 44], iconAnchor: [22, 22] });
const firstCornerIcon = L.divIcon({ className: "gd-corner", html: '<span class="gd-corner-first"></span>', iconSize: [44, 44], iconAnchor: [22, 22] });

export interface FlyTarget {
  lat: number;
  lon: number;
  zoom: number;
  nonce: number; // new object each request so the same place can be flown to twice
}

/** The farmer's field outline. While `editing`, taps add corners and the corners can be dragged. */
export interface OutlineProps {
  corners: LonLat[];
  editing: boolean;
  onChange?: (corners: LonLat[]) => void;
}

const toLatLng = (c: LonLat): [number, number] => [c[1], c[0]];

function Clicker({ onTap }: { onTap: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onTap(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Fly({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], target.zoom, { duration: 1.2 });
  }, [target, map]);
  return null;
}

function Recenter({ lat, lon, enabled }: { lat: number | null; lon: number | null; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (enabled && lat !== null && lon !== null) {
      map.setView([lat, lon], map.getZoom());
    }
  }, [lat, lon, enabled, map]);
  return null;
}

/** Zoom to the whole outline when it becomes a finished shape on view or when the outline changes. */
function FitOutline({ on, corners }: { on: boolean; corners: LonLat[] }) {
  const map = useMap();
  const cornerKey = corners.map((c) => `${c[0]},${c[1]}`).join(";");
  useEffect(() => {
    if (on && corners.length >= 3) {
      map.fitBounds(L.latLngBounds(corners.map(toLatLng)), { padding: [28, 28], maxZoom: 18, animate: false });
    }
  }, [on, map, cornerKey, corners]);
  return null;
}

export default function FarmMap({
  lat,
  lon,
  layer,
  fly,
  onPick,
  readOnly = false,
  zoom,
  outline,
  fitOutline = true,
}: {
  lat: number | null;
  lon: number | null;
  layer: LayerId;
  fly: FlyTarget | null;
  onPick: (lat: number, lon: number) => void;
  /** Show the farm only: no dragging the pin, no tap-to-move, no accidental wheel zoom. */
  readOnly?: boolean;
  zoom?: number;
  outline?: OutlineProps;
  /** Zoom to a finished outline when it is on view (turn off for coarse layers where closer means nothing). */
  fitOutline?: boolean;
}) {
  const has = lat !== null && lon !== null;
  const l = MAP_LAYERS[layer];
  const corners = outline?.corners ?? [];
  const finished = corners.length >= 3;
  const editing = !!outline?.editing && !readOnly;
  // With a finished outline the field itself is the location; the pin only shows while there is no outline yet
  const showPin = has && !editing && !finished;
  const simple = finished ? isSimplePolygon(corners) : true;
  const colour = simple ? "#e3a21a" : "#b4232c";

  const change = (next: LonLat[]) => outline?.onChange?.(next);
  const onTap = (la: number, lo: number) => {
    if (editing) change([...corners, [Math.round(lo * 1e6) / 1e6, Math.round(la * 1e6) / 1e6]]);
    else if (!readOnly && !finished) onPick(la, lo);
  };

  const centre: [number, number] = has ? [lat, lon] : corners.length ? toLatLng(corners[0]) : [34.0, 9.6];
  return (
    <MapContainer center={centre} zoom={zoom ?? (has || corners.length ? 15 : 6)} scrollWheelZoom={!readOnly} className="h-full w-full">
      <TileLayer key={layer} url={l.url} attribution={l.attribution} maxZoom={l.maxZoom} maxNativeZoom={l.maxNativeZoom} />
      {showPin && (
        <Marker
          position={[lat, lon]}
          icon={dropIcon}
          draggable={!readOnly}
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onPick(p.lat, p.lng);
            },
          }}
        />
      )}
      {finished && <Polygon positions={corners.map(toLatLng)} interactive={false} pathOptions={{ color: colour, weight: 3, fillColor: colour, fillOpacity: editing ? 0.2 : 0.16 }} />}
      {corners.length === 2 && <Polyline positions={corners.map(toLatLng)} interactive={false} pathOptions={{ color: colour, weight: 3, dashArray: "6 6" }} />}
      {editing &&
        corners.map((c, i) => (
          <Marker
            key={i}
            position={toLatLng(c)}
            icon={i === 0 ? firstCornerIcon : cornerIcon}
            keyboard={false}
            draggable
            eventHandlers={{
              drag: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                change(corners.map((q, j) => (j === i ? ([p.lng, p.lat] as LonLat) : q)));
              },
            }}
          />
        ))}
      <Clicker onTap={onTap} />
      <Fly target={fly} />
      <Recenter lat={lat} lon={lon} enabled={readOnly && !finished} />
      <FitOutline on={fitOutline && finished && !editing} corners={corners} />
    </MapContainer>
  );
}
