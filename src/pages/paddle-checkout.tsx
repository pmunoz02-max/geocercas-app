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

        window.Paddle.Environment.set("sandbox");
        console.log(
          "[PADDLE PAGE] using token",
          import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.slice(0, 20)
        );

        window.Paddle.Initialize({
          token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
          eventCallback: (event: any) => {
            console.log("[PADDLE CHECKOUT EVENT]", event);

            const eventName = event?.name || event?.type || "unknown";

            if (
              eventName.includes("checkout.loaded") ||
              eventName.includes("checkout.opened")
            ) {
              console.log("[PADDLE CHECKOUT] loaded", event);
              setMsg("Checkout cargado...");
            }

            if (
              eventName.includes("checkout.closed") ||
              eventName.includes("checkout.completed")
            ) {
              console.log("[PADDLE CHECKOUT] close/success", event);
            }

            if (eventName.includes("error")) {
              console.error("[PADDLE CHECKOUT] error", event);
              setMsg(
                `Error de Paddle: ${JSON.stringify(
                  event?.data || event,
                  null,
                  2
                )}`
              );
            }
          },
        });

        console.log("[PADDLE CHECKOUT] opening", txn);
        setMsg("Abriendo checkout...");

        window.Paddle.Checkout.open({
          transactionId: txn,
        });
      } catch (err) {
        console.error("[PADDLE CHECKOUT] exception", err);
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
      <div className="max-w-2xl text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">
          Checkout seguro
        </h1>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-600">
          {msg}
        </p>
      </div>
    </div>
  );
}