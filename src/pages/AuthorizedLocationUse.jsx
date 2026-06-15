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
      <a className="mr-4 text-sky-300 hover:text-sky-200" href="/terms">
        Terms
      </a>
      <a className="mr-4 text-sky-300 hover:text-sky-200" href="/refund-policy">
        Refund Policy
      </a>
    </nav>
  );
}

export default function AuthorizedLocationUse() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-sky-300">Geocercas GPS</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          Authorized Location Use & Workforce Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {lastUpdated}</p>

        <p className="mt-8 text-lg leading-relaxed text-slate-300">
          Geocercas GPS is a business SaaS platform for authorized workforce operations, geofence-based
          attendance, field activity verification, and operational reporting. The platform is intended for
          organizations that manage field teams, farms, facilities, service routes, or other work locations where
          authorized location reporting is necessary for business operations.
        </p>

        <Section title="1. Business purpose">
          <p>Geocercas GPS helps organizations manage legitimate business operations such as:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Geofence-based attendance and worksite verification</li>
            <li>Field staff check-in and check-out records</li>
            <li>Activity assignments and operational reports</li>
            <li>Cost, productivity, and team management reports</li>
            <li>Organization-controlled tracker invitations and role-based access</li>
          </ul>
          <p>
            Location data is used to support authorized business operations. It is not intended for personal
            surveillance, covert monitoring, or non-business tracking.
          </p>
        </Section>

        <Section title="2. Authorized users only">
          <p>
            The service is intended only for authorized organizations and invited users. Trackers must be added,
            invited, or authorized by an organization before using the service. The platform is not designed for
            hidden tracking or for monitoring individuals without a business relationship or proper authorization.
          </p>
        </Section>

        <Section title="3. Customer responsibilities">
          <p>Each customer organization is responsible for:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Informing workers, contractors, or field users about the use of location-based tools</li>
            <li>Obtaining notices, consents, or authorizations required by applicable laws</li>
            <li>Using the platform only for lawful business purposes</li>
            <li>Respecting worker privacy and applicable labor and privacy regulations</li>
            <li>Configuring users, roles, geofences, and reports appropriately</li>
          </ul>
          <p>
            Geocercas GPS provides the software platform. Each customer controls how it applies the service within
            its own organization.
          </p>
        </Section>

        <Section title="4. Location data processed by the platform">
          <p>Depending on the configuration and user role, the platform may process data such as:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>GPS coordinates and location timestamps</li>
            <li>Geofence entry or exit events</li>
            <li>Check-in and check-out records</li>
            <li>Assigned work locations, activities, and attendance records</li>
            <li>Operational reports generated from authorized activity data</li>
          </ul>
          <p>
            This information is used for attendance verification, geofence validation, operational reporting, and
            field team management.
          </p>
        </Section>

        <Section title="5. No covert tracking or abusive use">
          <p>Geocercas GPS must not be used for:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Secret tracking, personal spying, harassment, stalking, or abusive monitoring</li>
            <li>Tracking unrelated to legitimate business operations</li>
            <li>Monitoring people without proper authorization or required notice</li>
            <li>Any unlawful, deceptive, or abusive use of location data</li>
          </ul>
          <p>
            Accounts may be suspended or terminated if the platform is used in a way that violates these
            restrictions.
          </p>
        </Section>

        <Section title="6. Android app and payments">
          <p>
            The Android app is operational only. It is used for field work, tracker access, and authorized location
            reporting. The Android app does not include in-app purchases or in-app payments. Subscription management
            and payments are handled only through the web platform.
          </p>
        </Section>

        <Section title="7. Access and roles">
          <p>
            Access to information depends on the user role within an organization. Organization owners and
            administrators may access operational reports and team activity data. Trackers have access only to the
            features required for their operational role.
          </p>
        </Section>

        <Section title="8. Data retention, correction, and deletion">
          <p>
            Customer organizations are responsible for managing operational data according to their internal
            policies and applicable laws. Users or organizations may contact support to request assistance regarding
            account access, data correction, or deletion requests.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            For questions about authorized location use, privacy, or data requests, contact us at{" "}
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
