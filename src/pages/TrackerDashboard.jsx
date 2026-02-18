/**
 * Lee desde public.tracker_positions (CANÓNICO)
 */
const fetchPositions = useCallback(
  async (currentOrgId, options = { showSpinner: true }) => {
    if (!currentOrgId) return;
    const { showSpinner } = options;

    try {
      if (showSpinner) setLoading(true);
      setErrorMsg("");
      setDiag((d) => ({ ...d, lastPositionsError: null }));

      const windowConfig =
        TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
      const fromIso = new Date(Date.now() - windowConfig.ms).toISOString();

      // Si hay assignments, limita a trackers asignados. Si no, muestra por org (modo visual).
      const allowedTrackerIds = (assignmentTrackers || [])
        .map((x) => x.user_id)
        .filter(Boolean);

      let targetIds = null;
      if (allowedTrackerIds.length) {
        targetIds = allowedTrackerIds;
        if (selectedTrackerId !== "all") {
          const wanted = String(selectedTrackerId);
          targetIds = allowedTrackerIds.includes(wanted)
            ? [wanted]
            : allowedTrackerIds;
        }
      } else {
        if (selectedTrackerId !== "all") targetIds = [String(selectedTrackerId)];
      }

      let q = supabase
        .from("tracker_positions")
        .select(
          "id, org_id, user_id, personal_id, lat, lng, accuracy, speed, heading, battery, source, recorded_at, created_at"
        )
        .eq("org_id", currentOrgId)
        .gte("recorded_at", fromIso)
        .order("recorded_at", { ascending: false })
        .limit(500);

      if (Array.isArray(targetIds) && targetIds.length) {
        q = q.in("user_id", targetIds);
      }

      const { data, error } = await q;

      if (error) {
        setDiag((d) => ({
          ...d,
          lastPositionsError: error.message || String(error),
        }));
        setErrorMsg("Error al cargar posiciones (tracker_positions).");
        setPositions([]);
        setDiag((d) => ({ ...d, positionsFound: 0 }));
        return;
      }

      const normalized = (data || [])
        .map((r) => {
          const lat = toNum(r.lat);
          const lng = toNum(r.lng);
          const ts = r.recorded_at || r.created_at || null;
          return {
            id: r.id,
            user_id: r.user_id ? String(r.user_id) : null,
            personal_id: r.personal_id ? String(r.personal_id) : null,
            lat,
            lng,
            recorded_at: ts,
            accuracy: r.accuracy ?? null,
            speed: r.speed ?? null,
            heading: r.heading ?? null,
            battery: r.battery ?? null,
            source: r.source ?? null,
            _valid: isValidLatLng(lat, lng),
          };
        })
        .filter((p) => p._valid);

      setPositions(normalized);
      setDiag((d) => ({ ...d, positionsFound: normalized.length }));
    } finally {
      if (showSpinner) setLoading(false);
    }
  },
  [assignmentTrackers, selectedTrackerId, timeWindowId]
);
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
