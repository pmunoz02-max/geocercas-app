import { useEffect } from "react";

export default function PayPage() {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get("_ptxn");

    if (!transactionId) {
      console.error("No _ptxn found");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;

    script.onload = () => {
      if (!window.Paddle) {
        console.error("Paddle not loaded");
        return;
      }

      window.Paddle.Initialize({
        environment: "sandbox", // Cambia a 'production' en prod
        token: "YOUR_CLIENT_TOKEN" // 👈 Reemplaza por tu token real
      });

      window.Paddle.Checkout.open({
        transactionId: transactionId
      });
    };

    document.body.appendChild(script);
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>Abriendo checkout seguro...</h2>
      <p>Por favor espera, estamos redirigiéndote a Paddle.</p>
    </div>
  );
}
