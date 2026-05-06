import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";

function safeDeleteCookie(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  const expires = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
  const paths = ["path=/", ""];
  const domains = [
    "",
    "domain=app.tugeocercas.com",
    "domain=.tugeocercas.com",
    "domain=tugeocercas.com",
  ];

  for (const path of paths) {
    for (const domain of domains) {
      document.cookie = `${cleanName}=;${expires};${path};${domain};SameSite=Lax`;
      document.cookie = `${cleanName}=;${expires};${path};${domain}`;
    }
  }
}

function deleteIndexedDb(name) {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function clearIndexedDb() {
  try {
    if (!window.indexedDB) return;

    if (typeof indexedDB.databases === "function") {
      const databases = await indexedDB.databases();
      const names = databases
        .map((db) => db?.name)
        .filter(Boolean);

      await Promise.allSettled(names.map((name) => deleteIndexedDb(name)));
    }
  } catch {
    // Best-effort cleanup only.
  }
}

async function unregisterServiceWorkers() {
  try {
    if (!navigator.serviceWorker?.getRegistrations) return;

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      registrations.map((registration) => registration.unregister()),
    );
  } catch {
    // Best-effort cleanup only.
  }
}

async function clearCaches() {
  try {
    if (!window.caches?.keys) return;

    const cacheNames = await caches.keys();
    await Promise.allSettled(cacheNames.map((name) => caches.delete(name)));
  } catch {
    // Best-effort cleanup only.
  }
}

async function clearCookies() {
  try {
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0];
      safeDeleteCookie(name);
    });
  } catch {
    // Best-effort cleanup only.
  }
}

export default function Logout() {
  useEffect(() => {
    let cancelled = false;

    async function doUltraLogout() {
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        try {
          await supabase.auth.signOut();
        } catch {
          // Continue cleanup even if Supabase signOut fails.
        }
      }

      try {
        localStorage.clear();
      } catch {
        // Best-effort cleanup only.
      }

      try {
        sessionStorage.clear();
      } catch {
        // Best-effort cleanup only.
      }

      await clearCookies();
      await clearCaches();
      await unregisterServiceWorkers();
      await clearIndexedDb();

      if (cancelled) return;

      const target = `/login?mode=magic&logout=1&switchAccount=1&t=${Date.now()}&lang=es`;
      window.location.replace(target);
    }

    doUltraLogout();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h1>Cerrando sesión…</h1>
      <p>Por favor espera…</p>
    </div>
  );
}