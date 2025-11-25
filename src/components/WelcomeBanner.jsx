import { useUserProfile } from "../hooks/useUserProfile";

export default function WelcomeBanner() {
  const { profile, loading, err, refresh } = useUserProfile();

  if (loading) return <p>Cargando…</p>;
  if (err) return <div>Error: {err} <button onClick={refresh}>Reintentar</button></div>;
  if (!profile) return <p>No autenticado</p>;

  const rol = profile.rol ?? "sin rol";
  return (
    <div>
      <h1>Bienvenido</h1>
      <p>{profile.email} — {rol}</p>
      {rol === "sin rol" && (
        <p>Tu cuenta no tiene un rol asignado todavía. Contacta al administrador.</p>
      )}
      <button onClick={refresh} style={{ marginTop: 8 }}>Refrescar</button>
    </div>
  );
}
