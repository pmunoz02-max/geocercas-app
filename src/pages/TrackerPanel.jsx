import { useAuth } from "@/context/auth.js";
import Button from "../components/ui/Button";

export default function TrackerPanel() {
  const { user, role, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <header className="app-card p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold">Panel del Tracker</h2>
          <div className="text-sm text-gray-600">
            {user?.email} - <b>{role ? "Activo" : "Sin actividad"}</b>
          </div>
        </header>

        <main className="app-card p-4 flex flex-col gap-2">
          <p className="text-gray-700">Activo</p>
          <p className="text-gray-700">Sin actividad</p>
          <p className="text-gray-700">Ultima actualizacion reciente</p>
        </main>

        <div className="app-card p-4 flex flex-col gap-2">
          <Button onClick={signOut} variant="danger">
            Cerrar sesion
          </Button>
        </div>
      </div>
    </div>
  );
}

