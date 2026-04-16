export default function Button({
  children,
  variant = "primary",
  disabled = false,
  loading = false,
  onClick,
  style = {},
  fullWidth = true,
}) {
  const baseStyle = {
    width: fullWidth ? "100%" : "auto",
    padding: "12px 16px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    border: "1px solid transparent",
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
      borderColor: "#2563eb",
    },
    secondary: {
      background: "#f3f4f6",
      color: "#111827",
      borderColor: "#e5e7eb",
    },
    success: {
      background: "#16a34a",
      color: "#ffffff",
      borderColor: "#16a34a",
    },
    danger: {
      background: "#dc2626",
      color: "#ffffff",
      borderColor: "#dc2626",
    },
  };

  const hoverStyles = {
    primary: "#1d4ed8",
    secondary: "#e5e7eb",
    success: "#15803d",
    danger: "#b91c1c",
  };

  return (
    <button
      onClick={disabled || loading ? undefined : onClick}
      style={{
        ...baseStyle,
        ...variants[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = hoverStyles[variant];
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = variants[variant].background;
        }
      }}
    >
      {loading ? "Cargando..." : children}
    </button>
  );
}