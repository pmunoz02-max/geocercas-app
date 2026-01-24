import { Outlet } from "react-router-dom";
import Header from "../components/Header";

export default function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header / Tabs */}
      <header className="relative z-50">
        <Header />
      </header>

      {/* Contenido */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
