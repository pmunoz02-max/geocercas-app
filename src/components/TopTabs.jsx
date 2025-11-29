// src/components/TopTabs.jsx
import React from "react";
import { NavLink } from "react-router-dom";

export default function TopTabs({ tabs }) {
  return (
    <nav className="w-full flex justify-center mt-3 mb-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              [
                "px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
                isActive
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100",
              ].join(" ")
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
