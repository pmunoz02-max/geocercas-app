import { useTranslation } from "react-i18next";

export default function Button({
  children,
  variant = "primary",
  disabled = false,
  loading = false,
  onClick,
  style = {},
  fullWidth = true,
}) {
  const { t } = useTranslation();
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
      background: "var(--primary)",
      color: "var(--primary-fg)",
      borderColor: "var(--primary)",
    },
    secondary: {
      background: "#f3f4f6",
      color: "#111827",
      borderColor: "#e5e7eb",
    },
    success: {
      background: "var(--success)",
      color: "#ffffff",
      borderColor: "var(--success)",
    },
    danger: {
      background: "var(--danger)",
      color: "#ffffff",
      borderColor: "var(--danger)",
    },
  };

  const hoverStyles = {
    primary: "var(--primary-hover)",
    secondary: "#e5e7eb",
    success: "#059669",
    danger: "#dc2626",
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
      {loading ? t("common.actions.loading") : children}
    </button>
  );
}