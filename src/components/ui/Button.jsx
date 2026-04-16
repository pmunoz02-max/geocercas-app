export default function Button({
  children,
  variant = "primary",
  disabled = false,
  loading = false,
  onClick,
  style = {},
}) {
  const baseStyle = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    border: "none",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "all 0.2s ease",
    opacity: disabled ? 0.6 : 1,
  };

  const variants = {
    primary: {
      background: "#2563eb",
      color: "#ffffff",
    },
    secondary: {
      background: "#f3f4f6",
      color: "#111827",
    },
    success: {
      background: "#16a34a",
      color: "#ffffff",
    },
    danger: {
      background: "#dc2626",
      color: "#ffffff",
    },
  };

  return (
    <button
      onClick={disabled || loading ? undefined : onClick}
      style={{
        ...baseStyle,
        ...variants[variant],
        ...style,
      }}
    >
      {loading ? "Cargando..." : children}
    </button>
  );
}