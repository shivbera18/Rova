import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLon } from "@chalo/protocol";

const DEFAULT_CENTER: LatLon = { lat: 12.9352, lng: 77.6245 };

function driverIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(245,158,11,0.25);animation:radar 2s infinite;"></div>
        <div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;border:3px solid #ffffff;box-shadow:0 2px 10px rgba(0,0,0,0.6);z-index:2;"></div>
        <div style="position:absolute;top:-20px;font-size:11px;font-weight:800;color:#f3ede1;background:#14110b;border:1px solid #f59e0b;padding:1px 6px;border-radius:6px;box-shadow:0 2px 6px #000;white-space:nowrap;z-index:3;">YOU</div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function pinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="font-size:10px;font-weight:800;color:#fff;background:${color};padding:2px 7px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.6);margin-bottom:2px;letter-spacing:0.04em;">${label}</div>
        <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 36],
  });
}

export interface MapStops {
  pickup?: LatLon;
  drop?: LatLon;
}

export function MapView({
  me,
  stops,
  onLocationPick,
}: {
  me: LatLon | null;
  stops: MapStops;
  onLocationPick?: (pos: LatLon) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const clickCallbackRef = useRef(onLocationPick);
  clickCallbackRef.current = onLocationPick;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false }).setView(
      [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      14,
    );
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      clickCallbackRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update driver marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (me) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = L.marker([me.lat, me.lng], {
          icon: driverIcon(),
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        driverMarkerRef.current.setLatLng([me.lat, me.lng]);
      }
    } else {
      driverMarkerRef.current?.remove();
      driverMarkerRef.current = null;
    }
  }, [me?.lat, me?.lng]);

  // Update route stops & line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (stops.pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = L.marker([stops.pickup.lat, stops.pickup.lng], {
          icon: pinIcon("#10b981", "PICKUP"),
        }).addTo(map);
      } else {
        pickupMarkerRef.current.setLatLng([stops.pickup.lat, stops.pickup.lng]);
      }
    } else {
      pickupMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
    }

    if (stops.drop) {
      if (!dropMarkerRef.current) {
        dropMarkerRef.current = L.marker([stops.drop.lat, stops.drop.lng], {
          icon: pinIcon("#f59e0b", "DROP"),
        }).addTo(map);
      } else {
        dropMarkerRef.current.setLatLng([stops.drop.lat, stops.drop.lng]);
      }
    } else {
      dropMarkerRef.current?.remove();
      dropMarkerRef.current = null;
    }

    routeLineRef.current?.remove();
    routeLineRef.current = null;

    if (stops.pickup && stops.drop) {
      routeLineRef.current = L.polyline(
        [
          [stops.pickup.lat, stops.pickup.lng],
          [stops.drop.lat, stops.drop.lng],
        ],
        { color: "#f59e0b", weight: 3.5, opacity: 0.8, dashArray: "6 8" },
      ).addTo(map);

      const bounds = L.latLngBounds([
        [stops.pickup.lat, stops.pickup.lng],
        [stops.drop.lat, stops.drop.lng],
        ...(me ? [[me.lat, me.lng] as [number, number]] : []),
      ]);
      map.fitBounds(bounds.pad(0.3), { animate: true });
    }
  }, [stops.pickup?.lat, stops.pickup?.lng, stops.drop?.lat, stops.drop?.lng, me?.lat, me?.lng]);

  return <div ref={elRef} className="map-container" />;
}
