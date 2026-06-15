import React from "react";
import { contactEmail, LegalShell, Section } from "./LegalShared.jsx";

export default function LegalRefundPage() {
  return (
    <LegalShell title="Refund Policy">
      <p className="mt-8 text-lg leading-relaxed text-slate-300">
        Geocercas GPS provides digital SaaS subscriptions for geofence management, authorized workforce operations,
        field activity verification, and operational reporting.
      </p>

      <Section title="1. Digital subscription service">
        <p>
          Because Geocercas GPS is a digital subscription service, automatic refunds are not guaranteed once an
          account has access to the platform. Refund requests are reviewed case by case.
        </p>
      </Section>

      <Section title="2. Cases where a refund may apply">
        <ul className="list-disc space-y-2 pl-6">
          <li>Verified billing errors</li>
          <li>Duplicate charges</li>
          <li>Critical platform failures that prevent access to the paid service</li>
          <li>Other cases required by applicable law or payment provider rules</li>
        </ul>
      </Section>

      <Section title="3. Cases where a refund may not apply">
        <ul className="list-disc space-y-2 pl-6">
          <li>Partial use of the service during an active billing period</li>
          <li>Failure to cancel before a renewal date</li>
          <li>User configuration errors or misuse of the service</li>
          <li>Requests that fall outside applicable payment provider or legal time limits</li>
        </ul>
      </Section>

      <Section title="4. Web-only payments">
        <p>
          Paid subscriptions are managed through the web platform. The Android app is operational only and does not
          include in-app purchases or in-app payments.
        </p>
      </Section>

      <Section title="5. How to request a refund">
        <p>
          To request a refund review, contact us at{" "}
          <a className="text-sky-300 hover:text-sky-200" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>{" "}
          and include the account email, organization name, billing date, and reason for the request.
        </p>
      </Section>

      <Section title="6. Changes">
        <p>We may update this Refund Policy from time to time.</p>
      </Section>
    </LegalShell>
  );
}
