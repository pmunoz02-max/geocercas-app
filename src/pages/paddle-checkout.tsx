import { useEffect, useState } from "react";

declare global {
  interface Window {
    Paddle?: any;
  }
}

export default function PaddleCheckoutPage() {
  const [msg, setMsg] = useState("Inicializando checkout...");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const txn = urlParams.get("_ptxn");

    console.log("[PADDLE PAGE] params", Object.fromEntries(urlParams.entries()));

    if (!txn) {
      setMsg("Error: no se encontró _ptxn en la URL");
      return;
    }

    const loadPaddle = async () => {
      try {
        // Cargar Paddle.js dinámicamente
        const script = document.createElement("script");
        script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
        script.async = true;

        script.onload = () => {
          console.log("[PADDLE PAGE] Paddle loaded");

          if (!window.Paddle) {
            setMsg("Error: Paddle no cargó correctamente");
            return;
          }

          // Inicializar Paddle en SANDBOX
          window.Paddle.Environment.set("sandbox");

          // IMPORTANTE:
          // No necesitas vendor ID en v2 si usas API backend
          window.Paddle.Setup({
            // opcional: debug
          });

          console.log("[PADDLE PAGE] Opening checkout for txn:", txn);

          setMsg("Abriendo checkout...");

          // Abrir checkout con transaction id
          window.Paddle.Checkout.open({
            transactionId: txn,
          });
        };

        script.onerror = () => {
          setMsg("Error cargando Paddle.js");
        };

        document.body.appendChild(script);
      } catch (e) {
        console.error("[PADDLE PAGE] exception", e);
        setMsg("Error iniciando checkout");
      }
    };

    loadPaddle();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          Checkout seguro
        </h1>
        <p className="text-sm text-slate-600">{msg}</p>
      </div>
    </div>
  );
}