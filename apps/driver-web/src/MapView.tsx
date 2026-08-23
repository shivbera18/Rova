import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLon } from "@chalo/protocol";

const DEFAULT_CENTER: LatLon = { lat: 12.9352, lng: 77.6245 };

function pin(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html:
      `<div style="display:flex;align-items:center;gap:6px;">` +
      `<div style="width:14px;height:14px;border-radius:50%;background:${color};` +
      `box-shadow:0 0 0 4px ${color}33,0 2px 8px rgba(0,0,0,.5);"></div>` +
      `<div style="font-size:11px;font-weight:700;color:#f3ede1;text-shadow:0 1px 3px #000;">${label}</div>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [7, 7],
  });
}

export interface MapStops {
  pickup?: LatLon;
  drop?: LatLon;
}

export function MapView({ me, stops }: { me: LatLon | null; stops: MapStops }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const followedRef = useRef(false);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false }).setView(
      [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      14,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const points: Array<[LatLon, string, string]> = [];
  if (me) points.push([me, "#ffb020", "YOU"]);
  if (stops.pickup) points.push([stops.pickup, "#4ade80", "PICKUP"]);
  if (stops.drop) points.push([stops.drop, "#ffb020", "DROP"]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    for (const [p, color, label] of points) {
      L.marker([p.lat, p.lng], { icon: pin(color, label) }).addTo(group);
    }
    if (stops.pickup && stops.drop) {
      L.polyline(
        [
          [stops.pickup.lat, stops.pickup.lng],
          [stops.drop.lat, stops.drop.lng],
        ],
        { color: "#ffb020", weight: 3, opacity: 0.55, dashArray: "6 8" },
      ).addTo(group);
    }
    // follow the driver until the user pans manually or a trip route appears
    if (me && !followedRef.current && !stops.pickup) {
      map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15));
    }
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onDrag = (): void => {
      followedRef.current = true;
    };
    map.on("dragstart", onDrag);
    return () => {
      map.off("dragstart", onDrag);
    };
  }, []);

  return <div ref={elRef} style={{ height: "100%", width: "100%" }} />;
}
