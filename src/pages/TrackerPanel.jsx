import { useAuth } from "../auth/AuthProvider";

export default function TrackerPanel() {
  const { user, role, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="max-w-3xl mx-auto mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-blue-700">Panel del Tracker</h1>
        <div className="text-sm text-gray-600">
          {user?.email} — <b>{role}</b>
        </div>
      </header>

      <main className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6">
        <p className="text-gray-700">
          Aquí verás tus geocercas asignadas, tu estado (dentro/fuera) y podrás
          reportar incidencias.
        </p>
      </main>

      <div className="max-w-3xl mx-auto mt-8">
        <button
          onClick={signOut}
          className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
