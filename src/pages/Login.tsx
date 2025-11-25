// src/pages/Login.tsx
import React, { useEffect, useState } from 'react';
import {
  supabase,
  tryExchangeCodeForSessionIfPresent,
  signInWithPassword,
  signInWithEmailOtp,
  getSessionSafe,
} from '@/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 1) Si venimos de un proveedor/otp con ?code=..., intercambia por sesión
  useEffect(() => {
    (async () => {
      await tryExchangeCodeForSessionIfPresent();
      const session = await getSessionSafe();
      if (session) navigate('/', { replace: true });
    })();
  }, [navigate]);

  // 2) Si detectSessionInUrl ya creó sesión (hash access_token), redirige
  useEffect(() => {
    // onAuthStateChange en supabase-js v2 devuelve:
    // { data: { subscription }, error }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (session) navigate('/', { replace: true });
    });

    // cleanup seguro
    return () => {
      try {
        subscription?.unsubscribe();
      } catch {
        // en caso de que por alguna razón subscription no exista,
        // evitamos romper la app
      }
    };
  }, [navigate]);

  async function onLoginPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await signInWithPassword({ email, password: pwd });
      // onAuthStateChange nos redirige
    } catch (err: any) {
      setMsg(err?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await signInWithEmailOtp(email);
      setMsg('Revisa tu correo: te enviamos un enlace mágico.');
    } catch (err: any) {
      setMsg(err?.message || 'No se pudo enviar el enlace mágico');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm mt-16 p-6 rounded-2xl shadow bg-white">
      <h1 className="text-xl font-semibold mb-4">Iniciar sesión</h1>

      <form className="space-y-3" onSubmit={onLoginPassword}>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Contraseña</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {loading ? 'Ingresando…' : 'Entrar'}
        </button>
      </form>

      <div className="my-4 text-center text-sm text-gray-500">— o —</div>

      <form className="space-y-3" onSubmit={onMagicLink}>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="tu@correo.com"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
        >
          {loading ? 'Enviando…' : 'Entrar con Magic Link'}
        </button>
      </form>

      {msg && <p className="mt-4 text-sm text-blue-700">{msg}</p>}
    </div>
  );
}
