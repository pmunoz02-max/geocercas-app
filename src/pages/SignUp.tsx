// src/pages/SignUp.tsx
import { FormEvent, useState } from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [accept, setAccept] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const redirectTo = `${window.location.origin}/auth/callback`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const target = email.trim();

    if (!target) {
      setMsg("Ingresa un email válido.");
      return;
    }
    if (!accept) {
      setMsg("Debes aceptar los Términos y la Política de Privacidad.");
      return;
    }

    setSending(true);
    setMsg(null);
    try {
      // Usamos Magic Link. Si el usuario no existe, se crea cuando confirma el link.
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: {
          emailRedirectTo: redirectTo,
          // Guardamos el nombre en user_metadata para que esté disponible tras confirmar
          data: fullName ? { full_name: fullName } : undefined,
        },
      });

      if (error) {
        setMsg(`No se pudo enviar el Magic Link: ${error.message}`);
      } else {
        setMsg(
          "Te enviamos un Magic Link. Revisa tu correo y abre el enlace para confirmar tu cuenta."
        );
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Error desconocido");
    } finally {
      setSending(false);
    }
  };

  const signUpWithGoogle = async () => {
    setSending(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // Si quieres forzar consentimiento cada vez:
          // queryParams: { prompt: "consent" }
        },
      });
      if (error) {
        setMsg(`No se pudo iniciar con Google: ${error.message}`);
      } else if (!data?.url) {
        setMsg("No se obtuvo URL de redirección de Google.");
      } else {
        // Redirige al flujo de Google
        window.location.href = data.url;
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Error desconocido con Google OAuth");
    } finally {
      setSending(false);
    }
  };

  const canSubmit = email.trim().length > 3 && accept && !sending;

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Crear cuenta</h1>
      <p className="text-sm text-gray-600 mb-6">
        Crea tu cuenta con Magic Link o usa Google.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre completo (opcional)</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2"
            placeholder="Tu nombre"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2"
            placeholder="tucorreo@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
          />
          <span>
            Acepto los{" "}
            <a href="/terms" className="underline" onClick={(e) => e.stopPropagation()}>
              Términos
            </a>{" "}
            y la{" "}
            <a href="/privacy" className="underline" onClick={(e) => e.stopPropagation()}>
              Política de Privacidad
            </a>
            .
          </span>
        </label>

        <button
          type="submit"
          className="w-full px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={!canSubmit}
        >
          {sending ? "Enviando..." : "Crear cuenta con Magic Link"}
        </button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">o</span>
          </div>
        </div>

        <button
          type="button"
          onClick={signUpWithGoogle}
          className="w-full px-4 py-2 rounded border disabled:opacity-50"
          disabled={sending}
          title="Registrarse con Google"
        >
          Continuar con Google
        </button>

        {msg && <p className="text-sm text-gray-700">{msg}</p>}

        <p className="text-sm text-gray-600">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
