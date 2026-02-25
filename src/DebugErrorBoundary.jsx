// src/DebugErrorBoundary.jsx
import React from "react";

export default class DebugErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log fuerte para ver stack completo
    console.error("[ERROR_BOUNDARY]", error);
    console.error("[ERROR_BOUNDARY_INFO]", info);
    this.setState({ error, info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const msg = String(error?.message || error);
    const stack = String(error?.stack || "");
    const compStack = String(info?.componentStack || "");

    return (
      <div style={{ padding: 16, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
        <h2 style={{ color: "#b00020", marginBottom: 12 }}>App crashed (ErrorBoundary)</h2>
        <div style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>
          <strong>Message:</strong> {msg}
        </div>
        {stack && (
          <details open style={{ marginBottom: 12 }}>
            <summary><strong>Stack</strong></summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{stack}</pre>
          </details>
        )}
        {compStack && (
          <details open>
            <summary><strong>Component Stack</strong></summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{compStack}</pre>
          </details>
        )}
      </div>
    );
  }
}