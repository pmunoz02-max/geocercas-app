// src/pages/Asistencia.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  getOrCreateTodayAttendance,
  markCheckIn,
  markCheckOut,
  listMyAttendance,
  calcHours,
} from '../lib/attendance';

function useSession() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

export default function Asistencia() {
  const session = useSession();
  const user = session?.user ?? null;

  const [todayRec, setTodayRec] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [rows, setRows] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const canCheckIn = useMemo(() => !!todayRec && !todayRec.check_in, [todayRec]);
  const canCheckOut = useMemo(() => !!todayRec && todayRec.check_in && !todayRec.check_out, [todayRec]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setLoading(true);
        // Asegura el registro del día
        const rec = await getOrCreateTodayAttendance(user.id, new Date());
        setTodayRec(rec);
        // Carga últimos 14 días
        const to = new Date().toISOString().slice(0, 10);
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 13);
        const from = fromDate.toISOString().slice(0, 10);
        const data = await listMyAttendance({ from, to, limit: 200 });
        setRows(data);
      } catch (err) {
        setErrorMsg(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  async function getCoords() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }

  async function onCheckIn() {
    if (!todayRec) return;
    setMarking(true);
    setErrorMsg('');
    try {
      const coords = await getCoords();
      const upd = await markCheckIn(todayRec.id, coords);
      setTodayRec(upd);
      // refrescar lista
      const to = new Date().toISOString().slice(0, 10);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 13);
      const from = fromDate.toISOString().slice(0, 10);
      const data = await listMyAttendance({ from, to, limit: 200 });
      setRows(data);
    } catch (err) {
      setErrorMsg(err.message ?? String(err));
    } finally {
      setMarking(false);
    }
  }

  async function onCheckOut() {
    if (!todayRec) return;
    setMarking(true);
    setErrorMsg('');
    try {
      const coords = await getCoords();
      const upd = await markCheckOut(todayRec.id, coords);
      setTodayRec(upd);
      const to = new Date().toISOString().slice(0, 10);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 13);
      const from = fromDate.toISOString().slice(0, 10);
      const data = await listMyAttendance({ from, to, limit: 200 });
      setRows(data);
    } catch (err) {
      setErrorMsg(err.message ?? String(err));
    } finally {
      setMarking(false);
    }
  }

  if (!session) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Asistencia</h1>
        <p className="mt-2">Debes iniciar sesión.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-extrabold">APP DE CONTROL DE PERSONAL CON GEOCERCAS</h1>

      <section className="mt-8">
        <h2 className="text-2xl font-bold">Asistencia</h2>
        <p className="text-slate-600 mt-1">
          Marca tu entrada/salida. Guardamos la hora y (si el navegador lo permite) tu ubicación.
        </p>

        {errorMsg && (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="mt-6 flex items-center gap-4">
          <div className="rounded-xl border p-4 min-w-[260px]">
            <div className="text-sm text-slate-500">Estado de hoy</div>
            <div className="text-lg font-semibold mt-1">{todayRec?.status ?? '—'}</div>
            <div className="mt-2 text-sm">
              <div><span className="font-medium">Entrada:</span> {todayRec?.check_in ? new Date(todayRec.check_in).toLocaleTimeString() : '—'}</div>
              <div><span className="font-medium">Salida:</span> {todayRec?.check_out ? new Date(todayRec.check_out).toLocaleTimeString() : '—'}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onCheckIn}
                disabled={!canCheckIn || marking || loading}
                className={`px-4 py-2 rounded-lg text-white ${canCheckIn && !marking ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-300 cursor-not-allowed'}`}
              >
                Marcar entrada
              </button>
              <button
                onClick={onCheckOut}
                disabled={!canCheckOut || marking || loading}
                className={`px-4 py-2 rounded-lg text-white ${canCheckOut && !marking ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-300 cursor-not-allowed'}`}
              >
                Marcar salida
              </button>
            </div>
          </div>
          <div className="text-sm text-slate-500">
            <ul className="list-disc ml-5">
              <li>Un registro por día por usuario (único).</li>
              <li>RLS: el usuario ve/edita lo propio; dueño/admin ven todo.</li>
              <li>Ubicación es opcional (si el navegador la permite).</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h3 className="text-xl font-bold">Últimos 14 días</h3>

        {loading ? (
          <div className="mt-4">Cargando…</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border rounded-lg">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2 border">Fecha</th>
                  <th className="text-left p-2 border">Entrada</th>
                  <th className="text-left p-2 border">Salida</th>
                  <th className="text-left p-2 border">Horas</th>
                  <th className="text-left p-2 border">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/40">
                    <td className="p-2 border">{new Date(r.fecha).toLocaleDateString()}</td>
                    <td className="p-2 border">{r.check_in ? new Date(r.check_in).toLocaleTimeString() : '—'}</td>
                    <td className="p-2 border">{r.check_out ? new Date(r.check_out).toLocaleTimeString() : '—'}</td>
                    <td className="p-2 border">{calcHours(r)}</td>
                    <td className="p-2 border">{r.status}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={5}>Sin registros.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
