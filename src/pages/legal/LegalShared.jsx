import React from "react";

export const contactEmail = "soporte@tugeocercas.com";
export const lastUpdated = "June 15, 2026";

export function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-300 leading-relaxed">{children}</div>
    </section>
  );
}

export function LegalLinks() {
  return (
    <nav className="mt-10 border-t border-slate-800 pt-6 text-sm text-slate-400" aria-label="Legal pages">
      <a className="mr-4 text-sky-300 hover:text-sky-200" href="/privacy">
        Privacy Policy
      </a>
      <a className="mr-4 text-sky-300 hover:text-sky-200" href="/terms">
        Terms
      </a>
      <a className="mr-4 text-sky-300 hover:text-sky-200" href="/refund-policy">
        Refund Policy
      </a>
      <a className="mr-4 text-sky-300 hover:text-sky-200" href="/authorized-location-use">
        Authorized Location Use
      </a>
    </nav>
  );
}

export function LegalShell({ eyebrow = "Geocercas GPS", title, children }) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-sky-300">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {lastUpdated}</p>
        {children}
        <LegalLinks />
      </div>
    </main>
  );
}
