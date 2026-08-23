import { useEffect, useRef } from "react";
import L from "leaflet";
import type { LatLon } from "@chalo/protocol";

const CENTER: LatLon = { lat: 12.9352, lng: 77.6245 };

function pinIcon(label: string, cls: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="map-pin ${cls}"><span>${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export default function MapView({
  pickup,
  drop,
  driver,
  onMapClick,
}: {
  pickup?: LatLon | null;
  drop?: LatLon | null;
  driver?: LatLon | null;
  onMapClick?: (ll: LatLon) => void;
}): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const pickRef = useRef<L.Marker | null>(null);
  const dropRef = useRef<L.Marker | null>(null);
  const driverRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, { zoomControl: true }).setView(CENTER, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => clickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pickup) {
      if (!pickRef.current) pickRef.current = L.marker(pickup, { icon: pinIcon("P", "pin-pickup") }).addTo(map);
      else pickRef.current.setLatLng(pickup);
    } else {
      pickRef.current?.remove();
      pickRef.current = null;
    }
    if (drop) {
      if (!dropRef.current) dropRef.current = L.marker(drop, { icon: pinIcon("D", "pin-drop") }).addTo(map);
      else dropRef.current.setLatLng(drop);
    } else {
      dropRef.current?.remove();
      dropRef.current = null;
    }
    lineRef.current?.remove();
    lineRef.current =
      pickup && drop
        ? L.polyline([pickup, drop], { color: "#4f7cff", dashArray: "6 8", weight: 3 }).addTo(map)
        : null;

    const pts: LatLon[] = [pickup, drop].filter((p): p is LatLon => !!p);
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts).pad(0.35), { animate: false });
  }, [pickup?.lat, pickup?.lng, drop?.lat, drop?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (driver) {
      if (!driverRef.current) driverRef.current = L.marker(driver, { icon: pinIcon("", "pin-driver"), zIndexOffset: 500 }).addTo(map);
      else driverRef.current.setLatLng(driver);
    } else {
      driverRef.current?.remove();
      driverRef.current = null;
    }
  }, [driver?.lat, driver?.lng]);

  return <div ref={hostRef} className="map-root" />;
}
