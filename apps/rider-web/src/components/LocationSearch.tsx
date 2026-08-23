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
        q: trimmed,
        format: "jsonv2",
        addressdetails: "1",
        limit: "6",
        countrycodes: "in",
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

  const isPickup = kind === "pickup";

  return (
    <div
      style={{
        position: "relative",
        background: "#ffffff",
        border: "var(--brut-border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-xs)",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
      className={open ? "open" : ""}
    >
      {/* Visual Indicator Dot */}
      <span
        style={{
          width: 14,
          height: 14,
          flex: "0 0 14px",
          borderRadius: isPickup ? "50%" : "3px",
          background: isPickup ? "var(--green)" : "var(--pink)",
          border: "2px solid var(--ink)",
          display: "inline-block",
        }}
        aria-hidden
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={`${kind}-search`}
          style={{
            display: "block",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ink-muted)",
            marginBottom: 2,
          }}
        >
          {isPickup ? "Pickup Location" : "Drop-off Destination"}
        </label>
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
          style={{
            width: "100%",
            border: 0,
            outline: 0,
            background: "transparent",
            fontFamily: "var(--font-body)",
            fontSize: 14.5,
            fontWeight: 600,
            color: "var(--ink)",
            padding: 0,
          }}
        />
      </div>

      {loading && <span className="search-spinner" aria-label="Searching" />}

      {query && !loading && (
        <button
          type="button"
          aria-label={`Clear ${kind}`}
          onClick={() => {
            abortRef.current?.abort();
            suppressSearchRef.current = true;
            setQuery("");
            setResults([]);
            setOpen(false);
            onClear();
          }}
          style={{
            width: 22,
            height: 22,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            border: "1.5px solid var(--ink)",
            background: "var(--paper-subtle)",
            color: "var(--ink)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 800,
            padding: 0,
          }}
        >
          ×
        </button>
      )}

      {/* Autocomplete Dropdown */}
      {open && (
        <div
          className="search-results"
          style={{
            position: "absolute",
            zIndex: 1200,
            left: -2,
            right: -2,
            top: "calc(100% + 6px)",
            background: "#ffffff",
            border: "var(--brut-border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-md)",
            maxHeight: 260,
            overflowY: "auto",
          }}
          role="listbox"
        >
          {results.length > 0 ? (
            results.map((result) => (
              <button
                key={result.place_id}
                type="button"
                role="option"
                onClick={() => choose(result)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "transparent",
                  border: 0,
                  borderBottom: "1px solid #f1f5f9",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    display: "grid",
                    placeItems: "center",
                    background: "var(--primary-soft)",
                    borderRadius: "var(--radius-xs)",
                    border: "var(--brut-border-thin)",
                    fontSize: 12,
                  }}
                >
                  {result.type === "house" ? "🏠" : "📍"}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 13, color: "var(--ink)" }}>
                    {result.display_name.split(",")[0]}
                  </strong>
                  <small style={{ display: "block", color: "var(--ink-muted)", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {result.display_name.split(",").slice(1, 4).join(",")}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <div style={{ padding: 14, fontSize: 12.5, fontWeight: 600, color: "var(--ink-muted)", textAlign: "center" }}>
              No matching locations found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
