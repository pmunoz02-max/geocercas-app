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

    const hostname = window.location.hostname;
    const isPreview = hostname === "preview.tugeocercas.com";
    const paddleEnv = isPreview ? "sandbox" : "live";

    const sandboxToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN_SANDBOX;
    const liveToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN_LIVE;
    const token = isPreview ? sandboxToken : liveToken;

    console.log("[PAY] sandbox token raw:", sandboxToken);
    console.log("[PAY] live token raw:", liveToken);

    const initPaddle = () => {
      try {
        console.log("[PAY] hostname:", hostname);
        console.log("[PAY] paddleEnv:", paddleEnv);
        console.log("[PAY] token present:", Boolean(token));

        if (!token) {
          console.error("[PAY] Missing Paddle client token");
          return;
        }

        if (!window.Paddle) {
          console.error("[PAY] Paddle global not available");
          return;
        }

        if (paddleEnv === "sandbox") {
          console.log("[PAY] Setting Paddle sandbox environment");
          window.Paddle.Environment.set("sandbox");
        }

        console.log("[PAY] Initializing Paddle...");
        window.Paddle.Initialize({ token });

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

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>Abriendo checkout seguro...</h2>
      <p>Por favor espera, estamos redirigiéndote a Paddle.</p>
    </div>
  );
}