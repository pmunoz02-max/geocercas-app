import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TrackerMap from './TrackerMap';
import { supabase } from '../../supabaseClient';

export default function TrackerPage() {
  const { t } = useTranslation();
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 🔁 polling simple (cada 5s)
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { data, error } = await supabase
          .from('v_tracker_dashboard')
          .select('*');

        if (error) throw error;

        if (!mounted) return;
        setTrackers(data || []);
      } catch (e) {
        if (!mounted) return;
        setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // 📍 convertir a formato del mapa
  const positions = useMemo(() => {
    return trackers
      .filter(t => t.lat && t.lng)
      .map(t => ({
        lat: t.lat,
        lng: t.lng,
        user_id: t.tracker_user_id,
        label: t.nombre,
        recorded_at: t.last_position_at,
      }));
  }, [trackers]);

  return (
    <div className="flex h-[calc(100vh-80px)] w-full">

      {/* SIDEBAR */}
      <aside className="w-80 border-r p-4 space-y-4 bg-slate-50">

        <h2 className="text-xl font-semibold">{t('tracker.page.title')}</h2>

        {loading && <div>{t('common.actions.loading')}</div>}
        {error && <div className="text-red-600">{error}</div>}

        <div className="space-y-2 text-sm">
          {trackers.map(t => (
            <div key={t.tracker_user_id} className="border p-2 rounded bg-white">

              <div className="font-semibold">
                {t.nombre} {t.apellido || ''}
              </div>

              <div>
                Estado:{" "}
                <b className={t.status === 'active' ? 'text-green-600' : 'text-gray-500'}>
                  {t.status}
                </b>
              </div>

              <div>
                Última pos: {t.last_position_at || '—'}
              </div>

              <div>
                Última actualización: {t.last_seen_at || '—'}
              </div>

              <div className="text-xs text-slate-500">
                {t.lat && t.lng ? `${t.lat}, ${t.lng}` : 'Sin posición'}
              </div>

            </div>
          ))}
        </div>

      </aside>

      {/* MAPA */}
      <section className="flex-1">
        <TrackerMap positions={positions} />
      </section>

    </div>
  );
}