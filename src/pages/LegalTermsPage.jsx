import React from "react";
import { contactEmail, LegalShell, Section } from "./LegalShared.jsx";

export default function LegalTermsPage() {
  return (
    <LegalShell title="Terms of Service">
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
          <li>Fraudulent, deceptive, illegal,, or abusive activity</li>
          <li>Attempting to bypass security, access controls, or role permissions</li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate these terms or create legal, security, privacy, or
          compliance risk.
        </p>
      </Section>

      <Section title="5. Subscriptions and web payments">
        <p>
          Paid subscriptions are managed through the web platform. The Android app is operational only and does not
          include in-app purchases or in-app payments.
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
    </LegalShell>
  );
}
