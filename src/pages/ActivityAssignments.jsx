// src/pages/ActivityAssignments.jsx
// Asignación de actividades a trackers/personas
// Evita que la misma persona tenga dos actividades al mismo tiempo.

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { listActivities } from "../lib/activitiesApi";
import { listTrackers } from "../lib/trackersApi";
import {
  listActivityAssignments,
  createActivityAssignment,
  updateActivityAssignment,
  deleteActivityAssignment,
} from "../lib/activityAssignmentsApi";

// Form vacío
const initialForm = {
  id: null,
  tracker_user_id: "",
  activity_id: "",
  start_date: "",
  end_date: "",
};

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false;
  const aS = aStart;
  const aE = aEnd || "9999-12-31";
  const bS = bStart;
  const bE = bEnd || "9999-12-31";

  return aS <= bE && bS <= aE;
}

export default function ActivityAssignmentsPage() {
  const { t } = useTranslation();
  const tt = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { user } = useAuth() || {};

  const [activities, setActivities] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [trackerFilter, setTrackerFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [startFilter, setStartFilter] = useState("");
  const [endFilter, setEndFilter] = useState("");

  const [form, setForm] = useState(initialForm);
  const [mode, setMode] = useState("view"); // view | create | edit
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    cargarBase();
  }, []);

  async function cargarBase() {
    try {
      setLoading(true);
      setErrorMsg("");
      await Promise.all([fetchActivities(), fetchTrackers(), fetchAssignments()]);
    } catch (err) {
      console.error("Error carga inicial ActivityAssignments:", err);
      setErrorMsg(
        err.message ||
          tt(
            "activityAssignments.messages.initialLoadError",
            "Error loading initial data"
          )
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchActivities() {
    try {
      const data = await listActivities({ includeInactive: false });
      setActivities(data || []);
    } catch (err) {
      console.error("Error listActivities:", err);
      setErrorMsg(
        tt(
          "activityAssignments.messages.activitiesLoadError",
          "Could not load activities"
        )
      );
    }
  }

  async function fetchTrackers() {
    try {
      const data = await listTrackers();
      setTrackers(data || []);
    } catch (err) {
      console.error("Error listTrackers:", err);
      setErrorMsg(
        tt(
          "activityAssignments.messages.trackersLoadError",
          "Could not load trackers"
        )
      );
    }
  }

  async function fetchAssignments(extraFilters = {}) {
    try {
      setLoading(true);
      const data = await listActivityAssignments({
        tracker_user_id: trackerFilter,
        activity_id: activityFilter,
        start_date: startFilter,
        end_date: endFilter,
        ...extraFilters,
      });
      setRows(data || []);
    } catch (err) {
      console.error("Error listActivityAssignments:", err);
      setErrorMsg(
        err.message ||
          tt(
            "activityAssignments.messages.assignmentsLoadError",
            "Could not load assignments"
          )
      );
    } finally {
      setLoading(false);
    }
  }

  const trackersById = useMemo(() => {
    const m = new Map();
    trackers.forEach((tracker) => m.set(tracker.id, tracker));
    return m;
  }, [trackers]);

  const activitiesById = useMemo(() => {
    const m = new Map();
    activities.forEach((activity) => m.set(activity.id, activity));
    return m;
  }, [activities]);

  function resetForm() {
    setForm(initialForm);
    setMode("view");
    setSelectedId(null);
    setErrorMsg("");
    setSuccessMsg("");
  }

  function handleNueva() {
    setForm(initialForm);
    setMode("create");
    setSelectedId(null);
    setErrorMsg("");
    setSuccessMsg("");
  }

  function handleSelectRow(row) {
    setSelectedId(row.id);
    setMode("edit");
    setForm({
      id: row.id,
      tracker_user_id: row.tracker_user_id,
      activity_id: row.activity_id,
      start_date: row.start_date || "",
      end_date: row.end_date || "",
    });
    setSuccessMsg("");
    setErrorMsg("");
  }

  function handleChangeForm(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  useEffect(() => {
    fetchAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerFilter, activityFilter, startFilter, endFilter]);

  function checkOverlapLocal({ tracker_user_id, start_date, end_date, id }) {
    if (!tracker_user_id || !start_date) return null;

    const conflict = rows.find((row) => {
      if (row.tracker_user_id !== tracker_user_id) return false;
      if (id && row.id === id) return false;
      return rangesOverlap(start_date, end_date, row.start_date, row.end_date);
    });

    return conflict || null;
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    setLoadingForm(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (!form.tracker_user_id || !form.activity_id || !form.start_date) {
        setErrorMsg(
          tt(
            "activityAssignments.messages.requiredFields",
            "Tracker, activity, and start date are required"
          )
        );
        return;
      }

      const overlap = checkOverlapLocal(form);
      if (overlap) {
        const tracker = trackersById.get(overlap.tracker_user_id);
        const activity = activitiesById.get(overlap.activity_id);
        setErrorMsg(
          tt(
            "activityAssignments.overlap.message",
            'The person {{person}} already has the activity "{{activity}}" assigned between {{start}} and {{end}}.',
            {
              person:
                tracker?.full_name ||
                tracker?.email ||
                tt(
                  "activityAssignments.overlap.selectedPerson",
                  "selected"
                ),
              activity:
                activity?.name ||
                tt(
                  "activityAssignments.overlap.otherActivity",
                  "another activity"
                ),
              start: overlap.start_date,
              end:
                overlap.end_date ||
                tt(
                  "activityAssignments.overlap.noEndDate",
                  "no end date"
                ),
            }
          )
        );
        return;
      }

      if (mode === "create") {
        await createActivityAssignment({
          tracker_user_id: form.tracker_user_id,
          activity_id: form.activity_id,
          start_date: form.start_date,
          end_date: form.end_date || null,
        });
        setSuccessMsg(
          tt(
            "activityAssignments.messages.assignedSuccessfully",
            "Activity assigned successfully"
          )
        );
      } else if (mode === "edit" && form.id) {
        await updateActivityAssignment(form.id, {
          tracker_user_id: form.tracker_user_id,
          activity_id: form.activity_id,
          start_date: form.start_date,
          end_date: form.end_date || null,
        });
        setSuccessMsg(
          tt(
            "activityAssignments.messages.updatedSuccessfully",
            "Assignment updated successfully"
          )
        );
      } else {
        setErrorMsg(
          tt(
            "activityAssignments.messages.invalidFormMode",
            "Invalid form mode"
          )
        );
        return;
      }

      await fetchAssignments();
      if (mode === "create") {
        resetForm();
      }
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("activity_assignments_no_overlap")) {
        setErrorMsg(
          tt(
            "activityAssignments.messages.constraintOverlap",
            "This activity cannot be assigned: the person already has another activity in that date range."
          )
        );
      } else {
        setErrorMsg(
          err.message ||
            tt(
              "activityAssignments.messages.saveError",
              "Error saving the activity assignment"
            )
        );
      }
      console.error("Error al guardar ActivityAssignment:", err);
    } finally {
      setLoadingForm(false);
    }
  }

  async function handleDelete(row) {
    const tracker = trackersById.get(row.tracker_user_id);
    const activity = activitiesById.get(row.activity_id);

    const ok = window.confirm(
      tt(
        "activityAssignments.confirmDelete",
        'Are you sure you want to delete the assignment of "{{activity}}" for "{{tracker}}"?',
        {
          activity:
            activity?.name ||
            tt("activityAssignments.fallbacks.activity", "activity"),
          tracker:
            tracker?.full_name ||
            tracker?.email ||
            tt("activityAssignments.fallbacks.tracker", "tracker"),
        }
      )
    );
    if (!ok) return;

    try {
      await deleteActivityAssignment(row.id);
      setSuccessMsg(
        tt(
          "activityAssignments.messages.deletedSuccessfully",
          "Assignment deleted successfully"
        )
      );
      if (selectedId === row.id) {
        resetForm();
      }
      await fetchAssignments();
    } catch (err) {
      console.error("Error al eliminar ActivityAssignment:", err);
      setErrorMsg(
        err.message ||
          tt(
            "activityAssignments.messages.deleteError",
            "Could not delete the activity assignment"
          )
      );
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            {tt("activityAssignments.title", "Activity assignments")}
          </h1>
          <p className="text-sm text-gray-600">
            {tt(
              "activityAssignments.subtitle",
              "Define which activity each person performs within a date range. The same person cannot have two activities at the same time."
            )}
          </p>
          {user && (
            <p className="text-xs text-gray-500 mt-1">
              {tt("activityAssignments.session", "Session")}:{" "}
              <span className="font-mono">{user.email}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleNueva}
            className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            {tt("activityAssignments.actions.new", "+ New assignment")}
          </button>
          <button
            type="button"
            onClick={() => fetchAssignments()}
            className="px-3 py-1 rounded border text-sm hover:bg-gray-100"
          >
            {tt("activityAssignments.actions.refresh", "Refresh")}
          </button>
        </div>
      </header>

      {(errorMsg || successMsg) && (
        <div className="space-y-2">
          {errorMsg && (
            <div className="px-3 py-2 rounded bg-red-100 text-red-800 text-sm">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="px-3 py-2 rounded bg-green-100 text-green-800 text-sm">
              {successMsg}
            </div>
          )}
        </div>
      )}

      <section className="border rounded p-3 bg-gray-50 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              {tt("activityAssignments.filters.trackerPerson", "Tracker / Person")}
            </label>
            <select
              value={trackerFilter}
              onChange={(e) => setTrackerFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">
                {tt("activityAssignments.filters.allTrackers", "All")}
              </option>
              {trackers.map((tracker) => (
                <option key={tracker.id} value={tracker.id}>
                  {tracker.full_name || tracker.email} ({tracker.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              {tt("activityAssignments.filters.activity", "Activity")}
            </label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">
                {tt("activityAssignments.filters.allActivities", "All")}
              </option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              {tt("activityAssignments.filters.startFrom", "Start from")}
            </label>
            <input
              type="date"
              value={startFilter}
              onChange={(e) => setStartFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              {tt("activityAssignments.filters.endUntil", "End until")}
            </label>
            <input
              type="date"
              value={endFilter}
              onChange={(e) => setEndFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <section className="border rounded p-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="font-medium text-sm">
              {tt(
                "activityAssignments.table.title",
                "Assignment list"
              )}
            </h2>
            {loading && (
              <span className="text-xs text-gray-500">
                {tt("activityAssignments.table.loading", "Loading...")}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">
                    {tt("activityAssignments.table.person", "Person")}
                  </th>
                  <th className="border px-2 py-1 text-left">
                    {tt("activityAssignments.table.activity", "Activity")}
                  </th>
                  <th className="border px-2 py-1 text-left">
                    {tt("activityAssignments.table.start", "Start")}
                  </th>
                  <th className="border px-2 py-1 text-left">
                    {tt("activityAssignments.table.end", "End")}
                  </th>
                  <th className="border px-2 py-1 text-center">
                    {tt("activityAssignments.table.actions", "Actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="border px-2 py-3 text-center text-gray-500"
                    >
                      {tt(
                        "activityAssignments.table.empty",
                        "There are no assignments for the current filters."
                      )}
                    </td>
                  </tr>
                )}

                {rows.map((row) => {
                  const tracker = trackersById.get(row.tracker_user_id);
                  const activity = activitiesById.get(row.activity_id);
                  return (
                    <tr
                      key={row.id}
                      className={
                        "cursor-pointer hover:bg-blue-50" +
                        (selectedId === row.id ? " bg-blue-100" : "")
                      }
                      onClick={() => handleSelectRow(row)}
                    >
                      <td className="border px-2 py-1">
                        {tracker?.full_name || tracker?.email || row.tracker_user_id}
                        {tracker?.email ? ` (${tracker.email})` : ""}
                      </td>
                      <td className="border px-2 py-1">
                        {activity?.name || row.activity_id}
                      </td>
                      <td className="border px-2 py-1">
                        {row.start_date || "-"}
                      </td>
                      <td className="border px-2 py-1">
                        {row.end_date || "-"}
                      </td>
                      <td
                        className="border px-2 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex gap-1 justify-center">
                          <button
                            type="button"
                            className="px-2 py-0.5 text-xs rounded border hover:bg-gray-100"
                            onClick={() => handleSelectRow(row)}
                          >
                            {tt("activityAssignments.actions.edit", "Edit")}
                          </button>
                          <button
                            type="button"
                            className="px-2 py-0.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                            onClick={() => handleDelete(row)}
                          >
                            {tt("activityAssignments.actions.delete", "Delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border rounded p-3 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">
              {mode === "create"
                ? tt("activityAssignments.form.titleCreate", "New assignment")
                : mode === "edit"
                ? tt("activityAssignments.form.titleEdit", "Edit assignment")
                : tt(
                    "activityAssignments.form.titleView",
                    "Details / new assignment"
                  )}
            </h2>
            <button
              type="button"
              className="text-xs text-gray-600 hover:underline"
              onClick={resetForm}
            >
              {tt("activityAssignments.actions.clear", "Clear")}
            </button>
          </div>

          <form className="space-y-3" onSubmit={handleSubmitForm}>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-700">
                {tt("activityAssignments.form.trackerPerson", "Person / Tracker")}
              </label>
              <select
                name="tracker_user_id"
                value={form.tracker_user_id}
                onChange={handleChangeForm}
                className="border rounded px-2 py-1 text-sm"
                required
              >
                <option value="">
                  {tt("activityAssignments.form.selectOption", "Select...")}
                </option>
                {trackers.map((tracker) => (
                  <option key={tracker.id} value={tracker.id}>
                    {tracker.full_name || tracker.email} ({tracker.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-700">
                {tt("activityAssignments.form.activity", "Activity")}
              </label>
              <select
                name="activity_id"
                value={form.activity_id}
                onChange={handleChangeForm}
                className="border rounded px-2 py-1 text-sm"
                required
              >
                <option value="">
                  {tt("activityAssignments.form.selectOption", "Select...")}
                </option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-700">
                  {tt("activityAssignments.form.startDate", "Start date")}
                </label>
                <input
                  type="date"
                  name="start_date"
                  value={form.start_date}
                  onChange={handleChangeForm}
                  className="border rounded px-2 py-1 text-sm"
                  required
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-700">
                  {tt(
                    "activityAssignments.form.endDateOptional",
                    "End date (optional)"
                  )}
                </label>
                <input
                  type="date"
                  name="end_date"
                  value={form.end_date || ""}
                  onChange={handleChangeForm}
                  className="border rounded px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              {mode === "edit" && (
                <button
                  type="button"
                  className="px-3 py-1 rounded border text-sm hover:bg-gray-100"
                  onClick={handleNueva}
                >
                  {tt("activityAssignments.actions.newShort", "New")}
                </button>
              )}
              <button
                type="submit"
                disabled={loadingForm}
                className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {loadingForm
                  ? tt("activityAssignments.actions.saving", "Saving...")
                  : mode === "edit"
                  ? tt(
                      "activityAssignments.actions.saveChanges",
                      "Save changes"
                    )
                  : tt(
                      "activityAssignments.actions.createAssignment",
                      "Create assignment"
                    )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}