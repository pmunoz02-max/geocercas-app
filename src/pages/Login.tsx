// LOGIN-V24 – Diagnóstico definitivo de eventos (window + DOM onclick) + login token en memoria
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import supabase, { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  status?: number;
  message?: string;
};

type EventDiag = {
  winPointerDown: number;
  winClick: number;
  winKeyDown: number;
  btnPointerDown: number;
  btnClick: number;
  btnDomOnclick: number;
  last: string;
  lastTarget: string;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms en ${label}`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function describeTarget(t: any) {
  try {
    if (!t) return "-";
    const el = t as HTMLElement;
    const tag = (el.tagName || "-").toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className
        ? "." + el.className.split(" ").slice(0, 4).join(".")
        : "";
    return `${tag}${id}${cls}`.slice(0, 120);
  } catch {
    return "-";
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [email, setEmail] = useState("pruebatugeo@gmail.com");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [ev, setEv] = useState<EventDiag>({
    winPointerDown: 0,
    winClick: 0,
    winKeyDown: 0,
    btnPointerDown: 0,
    btnClick: 0,
    btnDomOnclick: 0,
    last: "-",
    lastTarget: "-",
  });

  async function doLogin(origin: string) {
    if (busy) return;

    setDiag({ step: `login_start(${origin})` });
    setBusy(true);
    setErr("");
    setMsg("");

    const emailClean = email.trim().toLowerCase();
    if (!emailClean || !password) {
      setDiag({ step: `validation_error(${origin})`, message: "Falta correo o contraseña" });
      setErr("Escribe tu correo y contraseña.");
      setBusy(false);
      return;
    }

    try {
      setDiag({ step: `fetching(${origin})` });

      const res = await withTimeout(
        fetch("/api/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ email: emailClean, password }),
        }),
        15000,
        "fetch(/api/auth/password)"
      );

      const text = await withTimeout(res.text(), 8000, "read response text");
      const data = JSON.parse(text);

      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      setDiag({ step: `token_received(${origin})`, status: res.status });

      // ✅ token en memoria (NO setSession)
      setMemoryAccessToken(data.access_token);

      // ✅ probe: usa una tabla real (organizations normalmente existe)
      setDiag({ step: `probe_supabase(${origin})` });
      const probe = await withTimeout(
        supabase.from("organizations").select("id").limit(1),
        8000,
        "probe organizations"
      );

      if (probe.error) throw new Error(`Probe error: ${probe.error.message}`);

      setDiag({ step: `navigate(${origin})` });
      setMsg("✅ Sesión activa. Entrando…");
      navigate(next, { replace: true });
    } catch (e: any) {
      setDiag({ step: `error(${origin})`, message: String(e?.message || e) });
      setErr(String(e?.message || "No se pudo iniciar sesión."));
    } finally {
      setBusy(false);
    }
  }

  // ✅ Instrumentación global y del botón (nativa, bypass React)
  useEffect(() => {
    const onWinPointerDown = (e: PointerEvent) => {
      setEv((s) => ({
        ...s,
        winPointerDown: s.winPointerDown + 1,
        last: "window:pointerdown",
        lastTarget: describeTarget(e.target),
      }));
    };
    const onWinClick = (e: MouseEvent) => {
      setEv((s) => ({
        ...s,
        winClick: s.winClick + 1,
        last: "window:click",
        lastTarget: describeTarget(e.target),
      }));
    };
    const onWinKeyDown = (e: KeyboardEvent) => {
      setEv((s) => ({
        ...s,
        winKeyDown: s.winKeyDown + 1,
        last: `window:keydown(${e.key})`,
        lastTarget: describeTarget(e.target),
      }));
      // Plan B: Enter dispara login
      if (e.key === "Enter") {
        doLogin("enter_key");
      }
    };

    window.addEventListener("pointerdown", onWinPointerDown, true);
    window.addEventListener("click", onWinClick, true);
    window.addEventListener("keydown", onWinKeyDown, true);

    const btn = btnRef.current;

    const onBtnPointerDown = (e: PointerEvent) => {
      setEv((s) => ({
        ...s,
        btnPointerDown: s.btnPointerDown + 1,
        last: "button:pointerdown",
        lastTarget: describeTarget(e.target),
      }));
    };
    const onBtnClick = (e: MouseEvent) => {
      setEv((s) => ({
        ...s,
        btnClick: s.btnClick + 1,
        last: "button:click",
        lastTarget: describeTarget(e.target),
      }));
    };

    if (btn) {
      btn.addEventListener("pointerdown", onBtnPointerDown, true);
      btn.addEventListener("click", onBtnClick, true);

      // 🔥 Bypass absoluto: handler DOM directo
      btn.onclick = () => {
        setEv((s) => ({
          ...s,
          btnDomOnclick: s.btnDomOnclick + 1,
          last: "button:DOM_onclick",
          lastTarget: "button",
        }));
        doLogin("dom_onclick");
      };
    }

    return () => {
      window.removeEventListener("pointerdown", onWinPointerDown, true);
      window.removeEventListener("click", onWinClick, true);
      window.removeEventListener("keydown", onWinKeyDown, true);
      if (btn) {
        btn.removeEventListener("pointerdown", onBtnPointerDown, true);
        btn.removeEventListener("click", onBtnClick, true);
        // eslint-disable-next-line no-param-reassign
        btn.onclick = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, email, password, next]);

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 caret-white " +
    "outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl relative z-[999999] pointer-events-auto">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl relative z-[999999] pointer-events-auto">
          <h1 className="text-3xl font-semibold mb-8">
            Entrar <span className="text-xs opacity-60">(LOGIN-V24)</span>
          </h1>

          <label className="block mb-2 text-sm text-slate-300">Correo</label>
          <input
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            disabled={busy}
          />

          <div className="h-6" />

          <label className="block mb-2 text-sm text-slate-300">Contraseña</label>
          <input
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            disabled={busy}
          />

          <button
            ref={btnRef}
            type="button"
            disabled={busy}
            style={{ position: "relative", zIndex: 2147483647, pointerEvents: "auto" }}
            className="w-full mt-8 py-4 rounded-2xl bg-white text-slate-900 font-semibold disabled:opacity-60"
          >
            {busy ? "Procesando…" : "Entrar"}
          </button>

          <div className="mt-4 text-xs p-4 rounded-2xl border border-sky-400/30 bg-sky-500/10 text-sky-100">
            <div className="font-semibold mb-1">Eventos (bypass React)</div>
            <div>win:pointerdown = {ev.winPointerDown}</div>
            <div>win:click = {ev.winClick}</div>
            <div>win:keydown = {ev.winKeyDown}</div>
            <div>btn:pointerdown = {ev.btnPointerDown}</div>
            <div>btn:click = {ev.btnClick}</div>
            <div>btn:DOM_onclick = {ev.btnDomOnclick}</div>
            <div className="mt-1">last = {ev.last}</div>
            <div>lastTarget = {ev.lastTarget}</div>
            <div className="mt-2 opacity-90">
              Plan B: presiona <b>Enter</b> en el campo contraseña.
            </div>
          </div>

          {(err || msg) && (
            <div className="mt-4 text-sm">
              {err && <div className="text-red-400">{err}</div>}
              {msg && <div className="text-emerald-400">{msg}</div>}
            </div>
          )}

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 text-white/70 space-y-1">
            <div className="font-semibold text-white/80">Diagnóstico</div>
            <div>busy: {String(busy)}</div>
            <div>step: {diag.step}</div>
            <div>status: {String(diag.status ?? "-")}</div>
            <div>message: {diag.message || "-"}</div>
          </div>

          <Link to="/" className="block mt-6 text-sm underline opacity-80 hover:opacity-100">
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
