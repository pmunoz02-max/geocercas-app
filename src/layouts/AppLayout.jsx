import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";

export default function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-4">
        <Outlet />
      </main>
      <footer className="p-4 text-center text-sm text-gray-500">
        App Geocercas · v1
      </footer>
    </div>
  );
}
