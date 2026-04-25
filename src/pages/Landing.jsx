// src/pages/Landing.jsx
import React from "react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";

const plans = [
  {
    name: "Básico",
    description: "Para pruebas y equipos pequeños.",
    price: "Gratis",
    detail: "Hasta 3 trackers.",
  },
  {
    name: "Pro",
    description: "Para organizaciones en operación.",
    price: "USD 29/mes",
    detail: "Hasta 50 trackers por organización.",
    featured: true,
  },
  {
    name: "Empresas",
    description: "Para operaciones grandes.",
    price: "USD 99/mes",
    detail: "Más de 50 trackers y soporte comercial.",
  },
];

const features = [
  {
    title: "Geocercas operativas",
    body: "Define zonas de trabajo y valida entradas, salidas y permanencia del personal en campo.",
  },
  {
    title: "Tracking GPS",
    body: "Consulta posiciones recientes de trackers autorizados para mejorar la supervisión diaria.",
  },
  {
    title: "Reportes de operación",
    body: "Convierte movimientos GPS en información útil para control, auditoría y gestión.",
  },
  {
    title: "Acceso empresarial",
    body: "Gestiona usuarios, trackers y organizaciones desde una plataforma web segura.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-lg font-bold tracking-tight text-white">
            App Geocercas
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            <a href="#precios" className="hidden text-slate-300 hover:text-white sm:inline">
              Precios
            </a>
            <Link to="/privacy" className="hidden text-slate-300 hover:text-white sm:inline">
              Privacidad
            </Link>
            <Link to="/terms" className="hidden text-slate-300 hover:text-white sm:inline">
              Términos
            </Link>
            <div className="relative z-50">
              <LanguageSwitcher />
            </div>
            <Link
              to="/auth"
              className="rounded-2xl bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-200"
            >
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-sky-300">
              Plataforma SaaS para control GPS y geocercas
            </p>

            <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Convierte posiciones GPS en control operativo
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              App Geocercas ayuda a empresas a supervisar trackers, validar presencia en zonas definidas y consultar reportes operativos desde una plataforma web segura.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-400"
              >
                Empezar ahora
              </Link>
              <a
                href="#precios"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
              >
                Ver precios
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 shadow-2xl">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <p className="text-sm font-semibold text-sky-300">Panel operativo</p>
              <div className="mt-5 space-y-3">
                <div className="h-3 w-4/5 rounded-full bg-slate-800" />
                <div className="h-3 w-3/5 rounded-full bg-slate-800" />
                <div className="h-28 rounded-2xl border border-slate-800 bg-slate-900" />
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-16 rounded-2xl bg-slate-900" />
                  <div className="h-16 rounded-2xl bg-slate-900" />
                  <div className="h-16 rounded-2xl bg-slate-900" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="mb-3 h-2.5 w-2.5 rounded-full bg-sky-400" />
                <h3 className="text-base font-semibold text-slate-100">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="precios" className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-white">Precios</h2>
            <p className="mt-4 text-base text-slate-300">
              Planes simples para empezar y escalar según el tamaño de tu operación.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={
                  plan.featured
                    ? "rounded-3xl border border-sky-500 bg-sky-950/40 p-7 shadow-2xl"
                    : "rounded-3xl border border-slate-800 bg-slate-900/60 p-7"
                }
              >
                <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                <p className="mt-4 text-sm text-slate-300">{plan.description}</p>
                <p className="mt-7 text-3xl font-bold text-white">{plan.price}</p>
                <p className="mt-4 text-sm text-slate-400">{plan.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-800 bg-slate-900/40 px-6 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Convierte posiciones GPS en control operativo
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300">
            Para soporte, ventas o revisión de cuenta, contáctanos por correo.
          </p>
          <a
            href="mailto:soporte@tugeocercas.com"
            className="mt-8 inline-flex rounded-2xl bg-white px-8 py-4 font-semibold text-slate-950 hover:bg-slate-200"
          >
            soporte@tugeocercas.com
          </a>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} App Geocercas. Todos los derechos reservados.</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/privacy" className="hover:text-sky-300">
            Política de privacidad
          </Link>
          <Link to="/terms" className="hover:text-sky-300">
            Términos y condiciones
          </Link>
        </div>
      </footer>
    </div>
  );
}
