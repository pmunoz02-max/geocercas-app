  return !!p && p.startsWith("/") && !p.startsWith("//") && !p.includes("://");
}

/**
 * Une params de query + hash (Supabase puede usar ambos)
 */
function getAllParams(search: string, hash: string) {
  const out = new URLSearchParams(search || "");

  const rawHash = (hash || "").startsWith("#") ? (hash || "").slice(1) : (hash || "");
  const rawHash = (hash || "").startsWith("#")
    ? (hash || "").slice(1)
    : (hash || "");

  if (rawHash) {
    const hashPart = rawHash.includes("?") ? rawHash.split("?").pop() || "" : rawHash;
    const hashPart = rawHash.includes("?")
      ? rawHash.split("?").pop() || ""
      : rawHash;
    const h = new URLSearchParams(hashPart);
    h.forEach((v, k) => {
      if (!out.has(k)) out.set(k, v);
@@ -41,62 +43,54 @@ export default function AuthCallback() {

  const code = params.get("code");
  const tokenHash = params.get("token_hash") || params.get("token");
  const type = params.get("type"); // invite | recovery | email | magiclink
  const type = params.get("type");
  const nextParam = params.get("next");
  const trackerOrgId = params.get("tracker_org_id");

  // Implicit hash tokens (por si llega así)
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  const [processing, setProcessing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const once = useRef(false);

  // Paso 1: finalizar auth
  useEffect(() => {
    let cancelled = false;

    async function finalize() {
      try {
        // Caso A: PKCE
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // Caso B: Implicit hash tokens
        else if (accessToken && refreshToken) {
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }
        // Caso C: OTP / invite / magic link
        else if (tokenHash && type) {
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });
          if (error) throw error;
        }
        // Caso D: sin params → NO es error
        else {
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setProcessing(false);
            return;
          }
        }

        // Espera a que sesión aparezca
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) break;
          await sleep(200);
        }

        await reloadAuth?.();
      } catch (e: any) {
      } catch (e) {
        console.error("AuthCallback error:", e);
        if (!cancelled) setAuthError("auth");
      } finally {
@@ -110,6 +104,7 @@ export default function AuthCallback() {
    };
  }, [code, tokenHash, type, accessToken, refreshToken, reloadAuth]);

  // Paso 2: navegación final
  useEffect(() => {
    if (processing || loading || once.current) return;
    once.current = true;
@@ -137,7 +132,9 @@ export default function AuthCallback() {

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-slate-500">Finalizando autenticación…</div>
      <div className="text-sm text-slate-500">
        Finalizando autenticación…
      </div>
    </div>
  );
}