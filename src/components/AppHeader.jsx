import { useAuth } from "../context/AuthContext";

export default function AppHeader() {
  const { user, profile, signOut } = useAuth();
  return (
    <header className="w-full flex items-center justify-between px-4 py-2 bg-white shadow">
      <h1 className="font-semibold">App Geocercas</h1>
      {user ? (
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">
            {profile?.full_name ?? user.email} · {profile?.role ?? "user"}
          </div>
          <button onClick={signOut} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">
            Salir
          </button>
        </div>
      ) : null}
    </header>
  );
}
