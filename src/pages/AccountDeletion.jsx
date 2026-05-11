import React from "react";

const SUPPORT_EMAIL = "soporte@tugeocercas.com";
const SUBJECT = "Account deletion request";

export default function AccountDeletion() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">
          GeoField GPS Account and Data Deletion
        </h1>

        <p className="mt-4 text-base leading-7 text-slate-700">
          GeoField GPS users can request deletion of their account and associated
          personal data by contacting our support team from the email address
          linked to their account.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-xl font-semibold">How to request deletion</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
            <li>
              Send an email to{" "}
              <a
                className="font-medium text-blue-700 underline"
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  SUBJECT
                )}`}
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </li>
            <li>
              Use this subject:{" "}
              <span className="rounded bg-white px-2 py-1 font-medium">
                {SUBJECT}
              </span>
            </li>
            <li>
              Write from the email address associated with your GeoField GPS
              account.
            </li>
            <li>
              Include the organization name if your account belongs to a company
              or field team.
            </li>
          </ol>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-xl font-semibold">Data we delete</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
              <li>Account profile information.</li>
              <li>Email and login-related account references.</li>
              <li>Tracker records associated with the requesting user.</li>
              <li>GPS location history associated with the requesting user.</li>
              <li>Reports or operational records linked to that user, when applicable.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-xl font-semibold">Data we may retain</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
              <li>Records required for legal or regulatory obligations.</li>
              <li>Security, abuse prevention, or fraud prevention records.</li>
              <li>Billing, audit, or legitimate business records when required.</li>
              <li>Aggregated or anonymized data that no longer identifies the user.</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 p-5">
          <h2 className="text-xl font-semibold">Response timeframe</h2>
          <p className="mt-3 leading-7 text-slate-700">
            We review account and data deletion requests and respond within 30
            days. Some data may be retained for a limited period when required
            for legal, security, fraud prevention, billing, audit, or legitimate
            business reasons.
          </p>
        </div>

        <hr className="my-10" />

        <h2 className="text-2xl font-bold">
          Eliminacion de cuenta y datos de GeoField GPS
        </h2>

        <p className="mt-4 text-base leading-7 text-slate-700">
          Los usuarios de GeoField GPS pueden solicitar la eliminacion de su
          cuenta y de los datos personales asociados escribiendo a nuestro equipo
          de soporte desde el correo electronico vinculado a su cuenta.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-xl font-semibold">Como solicitar la eliminacion</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
            <li>
              Escriba a {" "}
              <a
                className="font-medium text-blue-700 underline"
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  SUBJECT
                )}`}
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </li>
            <li>
              Use este asunto: {" "}
              <span className="rounded bg-white px-2 py-1 font-medium">
                {SUBJECT}
              </span>
            </li>
            <li>
              Escriba desde el correo electronico asociado a su cuenta de
              GeoField GPS.
            </li>
            <li>
              Incluya el nombre de la organizacion si su cuenta pertenece a una
              empresa o equipo de campo.
            </li>
          </ol>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-xl font-semibold">Datos que eliminamos</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
              <li>Informacion del perfil de la cuenta.</li>
              <li>Correo electronico y referencias de acceso relacionadas.</li>
              <li>Registros de tracker asociados al usuario solicitante.</li>
              <li>Historial de ubicacion GPS asociado al usuario solicitante.</li>
              <li>Reportes o registros operativos vinculados al usuario, cuando aplique.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-xl font-semibold">Datos que podemos conservar</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
              <li>Registros requeridos por obligaciones legales o regulatorias.</li>
              <li>Registros de seguridad, prevencion de abuso o prevencion de fraude.</li>
              <li>Datos de facturacion, auditoria o razones comerciales legitimas cuando sea necesario.</li>
              <li>Datos agregados o anonimizados que ya no identifiquen al usuario.</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 p-5">
          <h3 className="text-xl font-semibold">Plazo de respuesta</h3>
          <p className="mt-3 leading-7 text-slate-700">
            Revisamos las solicitudes de eliminacion de cuenta y datos, y
            respondemos dentro de un plazo de 30 dias. Algunos datos pueden
            conservarse por un periodo limitado cuando sea necesario por motivos
            legales, seguridad, prevencion de fraude, facturacion, auditoria u
            otras razones comerciales legitimas.
          </p>
        </div>
      </section>
    </main>
  );
}