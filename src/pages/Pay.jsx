import React, { useEffect } from "react";

// Utilidad para cargar Paddle.js dinámicamente
function loadPaddleJs(onLoad) {
  if (window.Paddle) {
    onLoad();
    return;
  }
  const script = document.createElement("script");
  script.src = "https://cdn.paddle.com/paddle/paddle.js";
  script.async = true;
  script.onload = onLoad;
  document.body.appendChild(script);
}

export default function PayPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("_ptxn");
    if (!transactionId) {
      // Puedes mostrar un error o redirigir
      alert("Missing transaction id (_ptxn) in URL");
      return;
    }

    loadPaddleJs(() => {
      if (!window.Paddle) {
        alert("Paddle.js failed to load");
        return;
      }
      // Inicializa Paddle con tu client-side token
      window.Paddle.Setup({
        // Reemplaza con tu vendor/client token si es necesario
        // vendor: YOUR_VENDOR_ID,
        // token: YOUR_CLIENT_SIDE_TOKEN,
      });
      window.Paddle.Checkout.open({ transactionId });
    });
  }, []);

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h1>Abriendo checkout seguro...</h1>
      <p>Por favor espera, estamos redirigiéndote a Paddle.</p>
    </div>
  );
}
