import { useEffect } from "react";

export default function Pay() {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get("_ptxn");

    console.log("[PAY] transactionId:", transactionId);

    if (!transactionId) {
      console.error("[PAY] Missing _ptxn");
      return;
    }

    const loadPaddle = async () => {
      if (!window.Paddle) {
        console.log("[PAY] Loading Paddle script...");
        const script = document.createElement("script");
        script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
        script.async = true;

        script.onload = () => {
          console.log("[PAY] Paddle script loaded");
          initPaddle();
        };

        script.onerror = () => {
          console.error("[PAY] Failed to load Paddle script");
        };

        document.body.appendChild(script);
      } else {
        initPaddle();
      }
    };

    const initPaddle = () => {
      try {
        console.log("[PAY] Initializing Paddle...");

        window.Paddle.Initialize({
          environment: "sandbox", // ⚠️ cambiar a production luego
          token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN, // 👈 CLAVE REAL
        });

        console.log("[PAY] Opening checkout...");

        window.Paddle.Checkout.open({
          transactionId: transactionId,
        });
      } catch (err) {
        console.error("[PAY] Paddle error:", err);
      }
    };

    loadPaddle();
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>Abriendo checkout seguro...</h2>
      <p>Por favor espera, estamos redirigiéndote a Paddle.</p>
    </div>
  );
}
