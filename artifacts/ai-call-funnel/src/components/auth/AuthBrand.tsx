import markLogo from "@assets/d5c4d1b9-c110-4f04-b229-154af4f8e8f4_1789715524787.png";

export function AuthBrand({ className, style }: { className?: string, style?: React.CSSProperties }) {
  return (
    <div
      className={`auth-brand ${className || ""}`}
      style={{
        fontFamily: "var(--font-display, 'Space Grotesk', system-ui, sans-serif)",
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: "-0.05em",
        color: "#0a2540",
        lineHeight: 1,
        ...style
      }}
      data-testid="auth-brand"
    >
      Linkealls
    </div>
  );
}

export function AuthMark({ className, size = 48, style }: { className?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <img
      src={markLogo}
      alt="Linkealls"
      className={`auth-brand-mark shrink-0 object-contain ${className || ""}`}
      style={{
        width: size,
        height: size,
        ...style
      }}
      data-testid="auth-mark"
    />
  );
}