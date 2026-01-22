import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function InvitarTracker() {
  const { currentOrg } = useAuth();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function handleInvite(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError("Debe ingresar un email");
      return;
    }
    if (!currentOrg?.id) {
      setError("Organización no válida");
      return;
    }

    try {
      setSending(true);

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          org_id: currentOrg.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.upstream?.error ||
          data?.error ||
          "Error al enviar invitación"
        );
      }

      setSuccess("Invitación enviada correctamente");
      setEmail("");
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">
        Invitar Tracker
      </h1>

      <form onSubmit={handleInvite} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Email del tracker
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="tracker@email.com"
            required
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="text-green-600 text-sm">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Enviar invitación"}
        </button>
      </form>
    </div>
  );
}
