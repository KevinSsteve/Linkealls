/**
 * WaSkeletonList — animated placeholder rows shown while a list loads.
 * Mirrors the WA conversation-list skeleton style.
 */
interface WaSkeletonListProps {
  /** Number of skeleton rows to render (default 5) */
  count?: number;
  /** Show a circular avatar on the left (default true) */
  showAvatar?: boolean;
}

function pulse(delay: number) {
  return {
    animationDelay: `${delay * 80}ms`,
  };
}

export function WaSkeletonList({ count = 5, showAvatar = true }: WaSkeletonListProps) {
  return (
    <div className="flex-1 overflow-hidden" aria-busy="true" aria-label="A carregar…">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid #F0F2F5" }}
        >
          {showAvatar && (
            <div
              className="w-12 h-12 rounded-full shrink-0 animate-pulse"
              style={{ background: "#E9EDEF", ...pulse(i) }}
            />
          )}
          <div className="flex-1 space-y-2">
            <div
              className="h-4 rounded-full animate-pulse"
              style={{ background: "#E9EDEF", width: `${45 + (i % 3) * 15}%`, ...pulse(i) }}
            />
            <div
              className="h-3 rounded-full animate-pulse"
              style={{ background: "#F0F2F5", width: `${60 + (i % 4) * 8}%`, ...pulse(i) }}
            />
          </div>
          <div
            className="h-3 w-10 rounded-full animate-pulse shrink-0"
            style={{ background: "#F0F2F5", ...pulse(i) }}
          />
        </div>
      ))}
    </div>
  );
}

/** Single skeleton card — use inside a card grid */
export function WaSkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl p-4 space-y-3 ${className}`}
      style={{ background: "#FFFFFF", border: "1px solid #E9EDEF" }}
    >
      <div className="h-4 rounded-full animate-pulse w-1/2" style={{ background: "#E9EDEF" }} />
      <div className="h-3 rounded-full animate-pulse w-3/4" style={{ background: "#F0F2F5" }} />
      <div className="h-3 rounded-full animate-pulse w-2/3" style={{ background: "#F0F2F5" }} />
    </div>
  );
}
