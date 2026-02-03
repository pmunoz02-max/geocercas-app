import React from "react";

/**
 * Privacy Policy — App Geocercas
 * Public page (no auth).
 * Note: Text is intentionally clear and "Google Play friendly".
 */
export default function PrivacyPolicy() {
  const today = new Date();
  const lastUpdated = today.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-2xl font-semibold tracking-tight">Política de Privacidad</h1>
          <p className="mt-2 text-sm text-slate-600">
            App Geocercas · Última actualización: <span className="font-medium">{lastUpdated}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">1. Introducción</h2>
          <p className="text-slate-700 leading-relaxed">
            App Geocercas (“la Aplicación”) es una plataforma para gestión operativa mediante geocercas,
            asignaciones y tracking GPS, orientada a organizaciones que necesitan registrar actividades y
            calcular costos asociados.
          </p>
          <p className="text-slate-700 leading-relaxed">
            Esta Política de Privacidad explica qué datos recopilamos, para qué los usamos y cómo los protegemos.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">2. Alcance</h2>
          <p className="text-slate-700 leading-relaxed">
            Esta política aplica a usuarios de App Geocercas, incluidos: Propietarios, Administradores y Trackers.
            El acceso a la aplicación es por invitación y está controlado por roles y organización.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">3. Datos que recopilamos</h2>

          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <h3 className="font-semibold">3.1 Datos de identificación</h3>
            <ul className="mt-2 list-disc pl-6 text-slate-700 space-y-1">
              <li>Correo electrónico</li>
              <li>Identificadores internos de usuario</li>
              <li>Rol dentro de la organización</li>
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <h3 className="font-semibold">3.2 Datos de ubicación</h3>
            <ul className="mt-2 list-disc pl-6 text-slate-700 space-y-1">
              <li>Puntos GPS asociados a trackers</li>
              <li>Fecha y hora del registro</li>
              <li>Relación con geocercas y asignaciones activas</li>
            </ul>
            <p className="mt-3 text-slate-700 leading-relaxed">
              <span className="font-medium">Importante:</span> la ubicación se recopila únicamente para funciones
              operativas (geocercas/tracking) definidas por la organización y según permisos otorgados por el usuario.
            </p>
          </div>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">4. Uso de la información</h2>
          <p className="text-slate-700 leading-relaxed">Usamos los datos exclusivamente para:</p>
          <ul className="list-disc pl-6 text-slate-700 space-y-1">
            <li>Registrar ubicación de trackers dentro de geocercas asignadas</li>
            <li>Validar presencia operativa en zonas definidas</li>
            <li>Calcular horas y costos por persona, actividad y geocerca</li>
            <li>Generar reportes y dashboards operativos</li>
          </ul>

          <div className="mt-4 rounded-2xl bg-slate-900 text-white p-5">
            <p className="font-semibold">No usamos los datos para:</p>
            <ul className="mt-2 list-disc pl-6 space-y-1 text-white/90">
              <li>Publicidad</li>
              <li>Marketing</li>
              <li>Perfilamiento de usuarios</li>
              <li>Vigilancia fuera del contexto operativo</li>
            </ul>
          </div>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">5. Compartición de datos</h2>
          <p className="text-slate-700 leading-relaxed">
            App Geocercas no vende ni comparte datos personales o de ubicación con terceros. Los datos están
            disponibles únicamente para usuarios autorizados dentro de la organización, según sus roles.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">6. Seguridad</h2>
          <ul className="list-disc pl-6 text-slate-700 space-y-1">
            <li>Cifrado en tránsito (HTTPS)</li>
            <li>Controles de acceso basados en roles</li>
            <li>Aislamiento por organización (multi-tenant)</li>
          </ul>
          <p className="text-slate-700 leading-relaxed">
            Aplicamos medidas razonables para proteger la información contra accesos no autorizados, pérdida o uso indebido.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">7. Control y eliminación de datos</h2>
          <p className="text-slate-700 leading-relaxed">
            Los administradores de cada organización pueden gestionar registros (crear, actualizar, desactivar o eliminar).
            Los usuarios pueden solicitar eliminación de sus datos a través de su organización.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">8. Permisos</h2>
          <p className="text-slate-700 leading-relaxed">
            La aplicación puede solicitar permisos como ubicación (GPS) y acceso a red. Estos permisos se usan únicamente
            para el funcionamiento principal: geocercas, tracking y sincronización de información.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">9. Menores de edad</h2>
          <p className="text-slate-700 leading-relaxed">
            App Geocercas no está dirigida a menores de edad y no recopila intencionalmente información de menores de 18 años.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">10. Cambios en esta política</h2>
          <p className="text-slate-700 leading-relaxed">
            Podemos actualizar esta Política de Privacidad ocasionalmente. Publicaremos los cambios en esta misma página
            indicando la fecha de actualización.
          </p>
        </section>

        <hr className="my-8 border-slate-200" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">11. Contacto</h2>
          <p className="text-slate-700 leading-relaxed">
            Si tienes preguntas sobre esta Política de Privacidad o el tratamiento de datos, contáctanos:
          </p>

          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <p className="text-slate-700">
              📧 <span className="font-semibold">Correo de soporte:</span>{" "}
              <a className="text-blue-600 hover:underline" href="mailto:soporte@tugeocercas.com">
                soporte@tugeocercas.com
              </a>
            </p>
          </div>
        </section>

        <div className="mt-10 text-sm text-slate-500">
          © {new Date().getFullYear()} App Geocercas. Todos los derechos reservados.
        </div>
      </main>
    </div>
  );
}
