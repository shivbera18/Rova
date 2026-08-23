import { useEffect, useRef, useState } from "react";
import type { LatLon } from "@chalo/protocol";

interface PlaceResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

export interface SelectedPlace {
  label: string;
  position: LatLon;
}

export function LocationSearch({
  kind,
  value,
  placeholder,
  onSelect,
  onClear,
}: {
  kind: "pickup" | "drop";
  value: string;
  placeholder: string;
  onSelect: (place: SelectedPlace) => void;
  onClear: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const suppressSearchRef = useRef(false);

  useEffect(() => {
    suppressSearchRef.current = true;
    setQuery(value);
    setOpen(false);
    setResults([]);
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    if (trimmed.length < 3 || trimmed === value) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const params = new URLSearchParams({
        q: `${trimmed}, Bengaluru, India`,
        format: "jsonv2",
        addressdetails: "1",
        limit: "6",
        countrycodes: "in",
        viewbox: "77.45,13.15,77.85,12.75",
        bounded: "0",
      });
      void fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
        .then((r) => {
          if (!r.ok) throw new Error(`Search failed (${r.status})`);
          return r.json() as Promise<PlaceResult[]>;
        })
        .then((data) => {
          setResults(data);
          setOpen(true);
        })
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            setResults([]);
            setOpen(true);
          }
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, value]);

  function choose(result: PlaceResult): void {
    const parts = result.display_name.split(",").map((s) => s.trim());
    const label = parts.slice(0, 3).join(", ");
    abortRef.current?.abort();
    suppressSearchRef.current = true;
    setQuery(label);
    setOpen(false);
    setResults([]);
    onSelect({
      label,
      position: { lat: Number(result.lat), lng: Number(result.lon) },
    });
  }

  return (
    <div className="location-search">
      <span className={`location-dot ${kind}`} aria-hidden />
      <div className="location-field">
        <label htmlFor={`${kind}-search`}>{kind === "pickup" ? "Pickup" : "Drop-off"}</label>
        <input
          id={`${kind}-search`}
          value={query}
          onFocus={() => results.length > 0 && setOpen(true)}
          onChange={(e) => {
            suppressSearchRef.current = false;
            setQuery(e.target.value);
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
        />
      </div>
      {loading && <span className="search-spinner" aria-label="Searching" />}
      {query && !loading && (
        <button
          type="button"
          className="search-clear"
          aria-label={`Clear ${kind}`}
          onClick={() => {
            abortRef.current?.abort();
            suppressSearchRef.current = true;
            setQuery("");
            setResults([]);
            setOpen(false);
            onClear();
          }}
        >
          ×
        </button>
      )}

      {open && (
        <div className="search-results" role="listbox">
          {results.length > 0 ? (
            results.map((result) => (
              <button key={result.place_id} type="button" role="option" onClick={() => choose(result)}>
                <span className="place-icon">{result.type === "house" ? "⌂" : "⌖"}</span>
                <span>
                  <strong>{result.display_name.split(",")[0]}</strong>
                  <small>{result.display_name.split(",").slice(1, 4).join(",")}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="search-empty">No matching places. Try a landmark or neighbourhood.</div>
          )}
          <div className="search-attribution">Search by OpenStreetMap</div>
        </div>
      )}
    </div>
  );
}
