import React, { useState } from "react";

/* =========================================================================
   Neobrutalism UI Component Kit (Inspired by neobrutalism.dev / Retro UI)
   Accessible, type-safe, crisp 2px borders with configurable depth & color
   ========================================================================= */

// --- 1. NeoButton ---
export interface NeoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "white" | "dark" | "green" | "red" | "accent";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export const NeoButton = React.forwardRef<HTMLButtonElement, NeoButtonProps>(
  ({ children, variant = "primary", size = "md", fullWidth = false, className = "", style = {}, ...props }, ref) => {
    const variantClass = `brut-btn-${variant}`;
    const sizeClass = size === "sm" ? "brut-btn-sm" : size === "lg" ? "brut-btn-lg" : "";
    const widthClass = fullWidth ? "brut-btn-full" : "";

    return (
      <button
        ref={ref}
        className={`brut-btn ${variantClass} ${sizeClass} ${widthClass} ${className}`.trim()}
        style={style}
        {...props}
      >
        {children}
      </button>
    );
  }
);
NeoButton.displayName = "NeoButton";

// --- 2. NeoCard ---
export interface NeoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "primary" | "dark" | "subtle";
  elevation?: "sm" | "md" | "lg" | "none";
}

export const NeoCard = React.forwardRef<HTMLDivElement, NeoCardProps>(
  ({ children, variant = "default", elevation = "sm", className = "", style = {}, ...props }, ref) => {
    const variantClass =
      variant === "primary" ? "brut-card-primary" : variant === "dark" ? "brut-card-dark" : "";
    const elevStyle =
      elevation === "none"
        ? { boxShadow: "none" }
        : elevation === "md"
        ? { boxShadow: "var(--shadow-md)" }
        : elevation === "lg"
        ? { boxShadow: "var(--shadow-lg)" }
        : { boxShadow: "var(--shadow-sm)" };

    return (
      <div
        ref={ref}
        className={`brut-card ${variantClass} ${className}`.trim()}
        style={{ ...elevStyle, ...style }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
NeoCard.displayName = "NeoCard";

// --- 3. NeoBadge ---
export interface NeoBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "green" | "red" | "dark";
}

export const NeoBadge = React.forwardRef<HTMLSpanElement, NeoBadgeProps>(
  ({ children, variant = "default", className = "", style = {}, ...props }, ref) => {
    const variantClass =
      variant === "primary"
        ? "brut-badge-primary"
        : variant === "green"
        ? "brut-badge-green"
        : variant === "red"
        ? "brut-badge-red"
        : variant === "dark"
        ? "brut-badge-dark"
        : "";

    return (
      <span ref={ref} className={`brut-badge ${variantClass} ${className}`.trim()} style={style} {...props}>
        {children}
      </span>
    );
  }
);
NeoBadge.displayName = "NeoBadge";

// --- 4. NeoInput ---
export interface NeoInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const NeoInput = React.forwardRef<HTMLInputElement, NeoInputProps>(
  ({ label, error, className = "", style = {}, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div style={{ width: "100%", marginBottom: 14 }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 700,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--ink)",
            }}
          >
            {label}
          </label>
        )}
        <input ref={ref} id={inputId} className={`brut-input ${className}`.trim()} style={style} {...props} />
        {error && (
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", marginTop: 4 }}>
            ⚠️ {error}
          </div>
        )}
      </div>
    );
  }
);
NeoInput.displayName = "NeoInput";

// --- 5. NeoAccordion ---
export interface NeoAccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

export function NeoAccordion({
  items,
  defaultExpandedId,
}: {
  items: NeoAccordionItem[];
  defaultExpandedId?: string;
}): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(defaultExpandedId || null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div
            key={item.id}
            className="brut-card"
            style={{
              padding: "16px 20px",
              cursor: "pointer",
              background: isExpanded ? "var(--primary-soft)" : "#ffffff",
              transition: "background 0.12s ease",
            }}
            onClick={() => setExpandedId(isExpanded ? null : item.id)}
          >
            <div className="spread">
              <span style={{ fontWeight: 800, fontSize: 14.5, color: "var(--ink)" }}>{item.title}</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--primary)" }}>
                {isExpanded ? "−" : "+"}
              </span>
            </div>
            {isExpanded && (
              <div style={{ marginTop: 12, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- 6. NeoMarquee ---
export function NeoMarquee({ items, speed = 20 }: { items: string[]; speed?: number }): React.ReactElement {
  return (
    <div
      style={{
        overflow: "hidden",
        background: "var(--ink)",
        color: "#ffffff",
        minHeight: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        borderBottom: "var(--brut-border)",
        position: "relative",
        zIndex: 10,
        whiteSpace: "nowrap",
      }}
    >
      <div
        className="brut-marquee-track"
        style={{
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: 13,
          letterSpacing: "0.08em",
          display: "inline-flex",
          alignItems: "center",
          animationDuration: `${speed}s`,
        }}
      >
        {[0, 1, 2].map((copy) => (
          <span key={copy} style={{ display: "inline-flex", alignItems: "center", gap: 32, paddingRight: 32 }}>
            {items.map((item, idx) => (
              <React.Fragment key={idx}>
                <span style={{ color: "#ffffff" }}>{item}</span>
                <span style={{ color: "var(--secondary)" }}>★</span>
              </React.Fragment>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
