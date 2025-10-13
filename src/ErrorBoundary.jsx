import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary atrapó:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
          <h2>⚠️ Se produjo un error en la interfaz</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button onClick={() => location.reload()}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
