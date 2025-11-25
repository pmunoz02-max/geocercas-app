import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MainNav() {
  const [userEmail, setUserEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const linkBase =
    "px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100";
  const linkActive = "bg-gray-200 text-gray-900";
  const linkInactive = "text-gray-700";

  return (
    <nav className="w-full border-b bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <NavLink to="/" className="font-semibold">
            App Geocercas
          </NavLink>

          <div className="hidden md:flex items-center gap-1">
            <NavLink
              to="/geocercas"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              Geocercas
            </NavLink>

            <NavLink
              to="/asignaciones"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              Asignaciones
            </NavLink>

            {/* NUEVO: PERSONAL */}
            <NavLink
              to="/personal"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              Personal
            </NavLink>

            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              Admin
            </NavLink>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-sm text-gray-600">{userEmail}</span>
          )}
          <button
            onClick={handleSignOut}
            className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}


