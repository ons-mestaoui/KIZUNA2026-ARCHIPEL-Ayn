"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

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

export interface FlyTarget {
  lat: number;
  lon: number;
  zoom: number;
  nonce: number; // new object each request so the same place can be flown to twice
}

function Clicker({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Fly({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], target.zoom, { duration: 1.2 });
  }, [target, map]);
  return null;
}

export default function FarmMap({
  lat,
  lon,
  layer,
  fly,
  onPick,
}: {
  lat: number | null;
  lon: number | null;
  layer: LayerId;
  fly: FlyTarget | null;
  onPick: (lat: number, lon: number) => void;
}) {
  const has = lat !== null && lon !== null;
  const l = MAP_LAYERS[layer];
  return (
    <MapContainer center={has ? [lat, lon] : [34.0, 9.6]} zoom={has ? 15 : 6} scrollWheelZoom className="h-full w-full">
      <TileLayer key={layer} url={l.url} attribution={l.attribution} maxZoom={l.maxZoom} maxNativeZoom={l.maxNativeZoom} />
      {has && (
        <Marker
          position={[lat, lon]}
          icon={dropIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onPick(p.lat, p.lng);
            },
          }}
        />
      )}
      <Clicker onPick={onPick} />
      <Fly target={fly} />
    </MapContainer>
  );
}
