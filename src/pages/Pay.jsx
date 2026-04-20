import { useEffect } from "react";

export default function Pay() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("_ptxn");
    console.log("[PAY] transactionId:", transactionId);

    if (!transactionId) {
      console.error("[PAY] Missing _ptxn");
      return;
    }

    const initPaddle = () => {
      try {
        console.log("[PAY] Setting Paddle environment...");
        if ((import.meta.env.VITE_PADDLE_ENV || "sandbox") === "sandbox") {
          window.Paddle.Environment.set("sandbox");
        }

        console.log("[PAY] Initializing Paddle...");
        console.log(
          "[PAY] token present:",
          Boolean(import.meta.env.VITE_PADDLE_CLIENT_TOKEN)
        );

        window.Paddle.Initialize({
          token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
        });

        console.log("[PAY] Opening checkout...");
        window.Paddle.Checkout.open({
          transactionId,
        });
      } catch (err) {
        console.error("[PAY] Paddle error:", err);
      }
    };

    if (window.Paddle) {
      console.log("[PAY] Paddle already loaded");
      initPaddle();
      return;
    }

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
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>Abriendo checkout seguro...</h2>
      <p>Por favor espera, estamos redirigiéndote a Paddle.</p>
    </div>
  );
}
