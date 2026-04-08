import { useEffect, useRef, useState, useCallback } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const EMPTY_FORM = {
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  documento: "",
  vigente: true,
  fecha_inicio: "",
  fecha_fin: "",
};

function normalizeInitial(initial) {
  return {
    ...EMPTY_FORM,
    ...(initial || {}),
    vigente: initial?.vigente ?? true,
    fecha_inicio: initial?.fecha_inicio || "",
    fecha_fin: initial?.fecha_fin || "",
  };
}

export default function PersonalModal({ initial, onCancel, onSubmit }) {
  const { t } = useTranslation();
  const tt = useCallback((key, fallback, options = {}) => t(key, { defaultValue: fallback, ...options }), [t]);

  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => normalizeInitial(initial));

  useEffect(() => {
    setForm(normalizeInitial(initial));
  }, [initial]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {}
    }

    return () => {
      try {
        if (dialog.open) dialog.close();
      } catch {}
    };
  }, []);

  const update = (field) => (e) => {
    const value = e?.target?.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    if (!form.nombre?.trim()) return tt("personalModal.errors.nameRequired", "Name is required.");
    if (!form.apellido?.trim()) return tt("personalModal.errors.lastNameRequired", "Last name is required.");
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return tt("personalModal.errors.invalidEmail", "Invalid email.");
    }
    if (form.fecha_inicio && form.fecha_fin && form.fecha_fin < form.fecha_inicio) {
      return tt("personalModal.errors.invalidDateRange", "End date must be later than or equal to start date.");
    }
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      // Mensaje claro, validación de formulario
      window.alert(err);
      return;
    }
    await onSubmit(form);
  };

  return (
    <dialog ref={dialogRef} className="rounded-2xl p-0 w-full max-w-2xl shadow-2xl">
      <form onSubmit={submit} className="p-6">
        <h2 className="text-xl font-semibold mb-4">
          {initial
            ? tt("personal.formTitleEdit", "Edit personnel")
            : tt("personal.formTitleNew", "New personnel")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">{tt("personal.fieldName", "Name")}</label>
            <input className="w-full rounded-xl border p-2" value={form.nombre} onChange={update("nombre")} required />
          </div>
          <div>
            <label className="block text-sm mb-1">{tt("personal.fieldLastName", "Last name")}</label>
            <input className="w-full rounded-xl border p-2" value={form.apellido} onChange={update("apellido")} required />
          </div>
          <div>
            <label className="block text-sm mb-1">{tt("personal.fieldEmail", "Email")}</label>
            <input
              className="w-full rounded-xl border p-2"
              type="email"
              value={form.email}
              onChange={update("email")}
              placeholder={tt("personalModal.placeholders.email", "email@domain.com")}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">{tt("personal.tablePhone", "Phone")}</label>
            <input
              className="w-full rounded-xl border p-2"
              value={form.telefono}
              onChange={update("telefono")}
              placeholder={tt("personal.fieldPhonePlaceholder", "Phone (+593…)")}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">{tt("personalModal.fields.document", "Document")}</label>
            <input className="w-full rounded-xl border p-2" value={form.documento} onChange={update("documento")} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="vigente" type="checkbox" checked={form.vigente} onChange={update("vigente")} />
            <label htmlFor="vigente">{tt("personal.fieldActive", "Active")}</label>
          </div>
          <div>
            <label className="block text-sm mb-1">{tt("personal.table.columns.start", "Start")}</label>
            <input className="w-full rounded-xl border p-2" type="date" value={form.fecha_inicio || ""} onChange={update("fecha_inicio")} />
          </div>
          <div>
            <label className="block text-sm mb-1">{tt("personal.table.columns.end", "End")}</label>
            <input className="w-full rounded-xl border p-2" type="date" value={form.fecha_fin || ""} onChange={update("fecha_fin")} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 border">
            {tt("common.actions.cancel", "Cancel")}
          </button>
          <button type="submit" className="rounded-xl px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">
            {tt("common.actions.save", "Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

PersonalModal.propTypes = {
  initial: PropTypes.object,
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
