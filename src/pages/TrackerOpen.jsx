import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// TRACKER_OPEN_LEGACY_REDIRECT_V1

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function buildQuery(params) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const cleaned = clean(value);
    if (cleaned) query.set(key, cleaned);
  });

  return query.toString();
}

function safeSetStorage(storage, key, value) {
  try {
    const cleaned = clean(value);
    if (cleaned) storage.setItem(key, cleaned);
  } catch {
    // Ignore storage errors in restricted browsers/WebViews.
  }
}

export default function TrackerOpen() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const inviteToken =
      clean(searchParams.get("inviteToken")) ||
      clean(searchParams.get("invite_token")) ||
      clean(searchParams.get("token"));

    const runtimeToken =
      clean(searchParams.get("tracker_runtime_token")) ||
      clean(searchParams.get("runtimeToken")) ||
      clean(searchParams.get("runtime_token"));

    const orgId =
      clean(searchParams.get("org_id")) ||
      clean(searchParams.get("orgId")) ||
      clean(searchParams.get("org"));

    const trackerUserId =
      clean(searchParams.get("tracker_user_id")) ||
      clean(searchParams.get("trackerUserId")) ||
      clean(searchParams.get("userId")) ||
      clean(searchParams.get("user_id"));

    if (runtimeToken) {
      const query = buildQuery({
        tracker_runtime_token: runtimeToken,
        tracker_user_id: trackerUserId,
        org_id: orgId,
      });

      if (orgId) {
        safeSetStorage(window.localStorage, "currentOrgId", orgId);
        safeSetStorage(window.sessionStorage, "trackerAcceptedOrgId", orgId);
      }

      const target = query ? `/tracker-gps?${query}` : "/tracker-gps";
      safeSetStorage(window.sessionStorage, "trackerAcceptedRedirect", target);
      window.location.replace(target);
      return;
    }

    if (inviteToken) {
      const query = buildQuery({
        inviteToken,
        org_id: orgId,
      });

      window.location.replace(`/tracker-accept?${query}`);
      return;
    }

    window.location.replace("/tracker-install");
  }, [searchParams]);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.icon}>✅</div>
        <h1 style={styles.title}>Redirigiendo a GeoField GPS</h1>
        <p style={styles.text}>
          Estamos preparando tu invitación de seguimiento.
        </p>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f8fafc",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 24,
    background: "#ffffff",
    padding: 32,
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 24,
    color: "#0f172a",
  },
  text: {
    marginTop: 12,
    color: "#475569",
    lineHeight: 1.5,
  },
};