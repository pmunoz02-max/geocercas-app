// src/hooks/useRealtimePositions.js
import { useEffect, useRef, useState } from 'react';
import { fetchLatest, subscribeLatest } from '../lib/trackerApi';

export default function useRealtimePositions(orgId, { initialLimit = 500 } = {}) {
  const [rows, setRows] = useState([]);
  const rowsRef = useRef([]);

  useEffect(() => {
    let unsub = null;

    async function boot() {
      const latest = await fetchLatest(orgId, { limit: initialLimit });
      rowsRef.current = latest;
      setRows(latest);

      const { unsubscribe } = subscribeLatest({
        orgId,
        onInsertOrUpdate: (payload) => {
          const newRow = payload.new ?? payload.old;
          if (!newRow) return;

          // reemplaza por user_id
          const idx = rowsRef.current.findIndex(
            (r) => r.user_id === newRow.user_id
          );
          if (idx >= 0) {
            const next = [...rowsRef.current];
            next[idx] = { ...rowsRef.current[idx], ...newRow };
            rowsRef.current = next;
            setRows(next);
          } else {
            const next = [newRow, ...rowsRef.current];
            rowsRef.current = next;
            setRows(next);
          }
        },
      });

      unsub = unsubscribe;
    }

    boot();

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [orgId, initialLimit]);

  return rows;
}
