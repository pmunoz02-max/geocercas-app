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

export default function Privacy() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-sky-300">Geocercas GPS</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {lastUpdated}</p>

        <p className="mt-8 text-lg leading-relaxed text-slate-300">
          This Privacy Policy explains how Geocercas GPS collects, uses, and protects information when customers
          and authorized users use our web platform and Android app for geofence-based attendance, field activity
          verification, and workforce operations.
        </p>

        <Section title="1. Information we may collect">
          <ul className="list-disc space-y-2 pl-6">
            <li>Account information such as name, email address, organization, and user role</li>
            <li>Operational data such as geofences, activities, assignments, check-ins, and reports</li>
            <li>Location-related data such as GPS coordinates, timestamps, and geofence events, when enabled</li>
            <li>Technical data such as device, browser, session, and security logs</li>
            <li>Billing-related information required to manage subscriptions through web checkout providers</li>
          </ul>
        </Section>

        <Section title="2. How we use information">
          <p>We use information to provide, secure, maintain, and improve the service, including:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Managing organizations, roles, invitations, and access permissions</li>
            <li>Supporting authorized location reporting and geofence-based attendance</li>
            <li>Generating operational, activity, productivity, and cost reports</li>
            <li>Providing customer support and account administration</li>
            <li>Preventing fraud, abuse, unauthorized access, and service misuse</li>
          </ul>
        </Section>

        <Section title="3. Authorized location use">
          <p>
            Location data is used only for authorized workforce operations, attendance verification, geofence
            validation, and business reporting. Geocercas GPS is not intended for covert tracking, personal spying,
            harassment, stalking, or monitoring people without proper authorization.
          </p>
          <p>
            Customer organizations are responsible for informing their workers, contractors, or field users and for
            obtaining any notices, consents, or authorizations required by applicable laws.
          </p>
          <p>
            More details are available in our{" "}
            <a className="text-sky-300 hover:text-sky-200" href="/authorized-location-use">
              Authorized Location Use & Workforce Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section title="4. Sharing of information">
          <p>
            We do not sell personal information. We may share information only when necessary to operate the
            service, comply with legal obligations, process web-based subscriptions, prevent abuse, or provide
            customer support.
          </p>
        </Section>

        <Section title="5. Android app and payments">
          <p>
            The Android app is operational only and does not include in-app purchases or in-app payments.
            Subscription management and payments are handled only through the web platform.
          </p>
        </Section>

        <Section title="6. Security and retention">
          <p>
            We use reasonable administrative, technical, and organizational measures to protect information. Customer
            organizations are responsible for managing their operational data according to their internal policies and
            applicable laws.
          </p>
        </Section>

        <Section title="7. Account access, correction, and deletion">
          <p>
            Users and organizations may contact us to request assistance with account access, data correction, or
            deletion requests.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            For privacy questions or data requests, contact us at{" "}
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
