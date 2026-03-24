import { useEffect, useState } from "react";

declare global {
  interface Window {
    Paddle?: any;
  }
}

export default function PaddleCheckoutPage() {
  const [msg, setMsg] = useState("Inicializando checkout...");

  useEffect(() => {
    const txn = new URLSearchParams(window.location.search).get("_ptxn");
    console.log("[PADDLE PAGE] txn", txn);

    if (!txn) {
      setMsg("Error: no se encontró _ptxn en la URL");
      return;
    }

    const initCheckout = () => {
      try {
        if (!window.Paddle) {
          setMsg("Error: Paddle.js no está disponible");
          return;
        }

        console.log("[PADDLE PAGE] Paddle loaded");


        // Inicializar Paddle en SANDBOX con token
        window.Paddle.Environment.set("sandbox");
        console.log("[PADDLE PAGE] using token", import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.slice(0, 20));
        window.Paddle.Initialize({
          token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
        });

        console.log("[PADDLE PAGE] opening checkout", txn);
        setMsg("Abriendo checkout...");

        window.Paddle.Checkout.open({
          transactionId: txn,
        });
      } catch (err) {
        console.error("[PADDLE PAGE] error", err);
        setMsg(`Error iniciando checkout: ${String(err)}`);
      }
    };

    if (window.Paddle) {
      initCheckout();
      return;
    }

    const existing = document.querySelector(
      'script[src="https://cdn.paddle.com/paddle/v2/paddle.js"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", initCheckout, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = initCheckout;
    script.onerror = () => {
      console.error("[PADDLE PAGE] error", "No se pudo cargar Paddle.js");
      setMsg("Error cargando Paddle.js");
    };

    document.body.appendChild(script);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">
          Checkout seguro
        </h1>
        <p className="text-sm text-slate-600">{msg}</p>
      </div>
    </div>
  );
}