import React from "react";

const contactEmail = "soporte@tugeocercas.com";
const lastUpdated = "June 15, 2026";

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-300 leading-relaxed">{children}</div>
    </section>
  );
}

function LegalLinks() {
  return (
    <nav className="mt-10 border-t border-slate-800 pt-6 text-sm text-slate-400" aria-label="Legal pages">
      <a className="mr-4 text-sky-300 hover:text-sky-200" href="/privacy">
        Privacy Policy
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

export default function Terms() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-sky-300">Geocercas GPS</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Terms of Service</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {lastUpdated}</p>

        <Section title="1. Service description">
          <p>
            Geocercas GPS is a business SaaS platform for geofence management, authorized workforce operations,
            field activity verification, attendance support, and operational reporting.
          </p>
        </Section>

        <Section title="2. Authorized business use">
          <p>
            Customers may use the service only for lawful business purposes and only with authorized users. The
            platform is not intended for covert tracking, personal surveillance, harassment, stalking, or any unlawful
            use of location data.
          </p>
        </Section>

        <Section title="3. Customer responsibilities">
          <p>Each customer organization is responsible for:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Using the service in compliance with applicable laws and workplace policies</li>
            <li>Informing workers, contractors, or field users about location-based features</li>
            <li>Obtaining any required notices, consents, or authorizations</li>
            <li>Managing user roles, permissions, geofences, and reports responsibly</li>
            <li>Preventing unauthorized, abusive, or deceptive use of the service</li>
          </ul>
        </Section>

        <Section title="4. Prohibited uses">
          <p>Customers and users must not use Geocercas GPS for:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Secret tracking, personal spying, harassment, or stalking</li>
            <li>Tracking unrelated to legitimate business operations</li>
            <li>Monitoring people without proper authorization or required notice</li>
            <li>Fraudulent, deceptive, illegal, or abusive activity</li>
            <li>Attempting to bypass security, access controls, or role permissions</li>
          </ul>
          <p>
            We may suspend or terminate accounts that violate these terms or create legal, security, privacy, or
            compliance risk.
          </p>
        </Section>

        <Section title="5. Subscriptions and web payments">
          <p>
            Paid subscriptions are managed through the web platform. The Android app is operational only and does
            not include in-app purchases or in-app payments.
          </p>
        </Section>

        <Section title="6. Data and privacy">
          <p>
            Use of the service is also governed by our{" "}
            <a className="text-sky-300 hover:text-sky-200" href="/privacy">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a className="text-sky-300 hover:text-sky-200" href="/authorized-location-use">
              Authorized Location Use & Workforce Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section title="7. Changes to the service or terms">
          <p>
            We may update the service or these terms from time to time. Continued use of the service after updates
            means acceptance of the updated terms.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            For questions about these terms, contact us at{" "}
            <a className="text-sky-300 hover:text-sky-200" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            .
          </p>
        </Section>

        <LegalLinks />
      </div>
    </main>
  );
}
