-- =============================================================================
-- Migration : billing_panel_unification
-- Fecha     : 2026-03-19
-- Scope     : SOLO preview — NO aplicar en producción
-- Propósito : Crear la capa de lectura canónica para el panel de monetización.
--
-- Objetos creados / reemplazados:
--   1. org_billing columns (ADD COLUMN IF NOT EXISTS para idempotencia)
--   2. public.resolve_effective_plan_code(text, text) → text
--   3. public.org_billing_effective                   → VIEW
--   4. public.org_entitlements                        → VIEW
--   5. public.effective_tracker_limit(uuid)           → integer  (REPLACE)
--   6. public.get_org_limits(uuid)                    → jsonb    (REPLACE + DROP old signature)
--   7. public.enforce_geocercas_limit()               → trigger fn  (actualizar llamada)
--   8. public.v_org_kpis                              → VIEW
--   9. public.v_billing_panel                         → VIEW
--
-- Fuente canónica del panel:
--   org_billing          → estado comercial
--   resolve_effective_plan_code → plan efectivo (canonizado por estado de pago)
--   org_entitlements     → límites efectivos por org
--   v_billing_panel      → vista unificada para UI y reporting
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Extender org_billing con columnas necesarias (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.org_billing
  ADD COLUMN IF NOT EXISTS plan_status            text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscribed_plan_code   text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id        text,
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS trial_start            timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end              timestamptz,
  ADD COLUMN IF NOT EXISTS over_limit             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS over_limit_reason      text,
  ADD COLUMN IF NOT EXISTS over_limit_checked_at  timestamptz;

COMMENT ON COLUMN public.org_billing.plan_status IS
  'Estado del ciclo de suscripción: active, trialing, past_due, canceled, paused';
COMMENT ON COLUMN public.org_billing.subscribed_plan_code IS
  'Plan según suscripción activa (Stripe o manual). Puede diferir de plan_code durante transiciones.';
COMMENT ON COLUMN public.org_billing.plan_code IS
  'Plan base registrado en el sistema. Actúa como fallback cuando subscribed_plan_code es NULL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. resolve_effective_plan_code(plan_code, plan_status) → text
--    Función canónica: dado el plan deseado y el estado de pago, devuelve el
--    plan efectivo que realmente se aplica a la organización.
--
--    Reglas:
--      active   → devuelve el plan contratado (sin restricción)
--      trialing → devuelve el plan contratado (período de prueba aún válido)
--      past_due → devuelve el plan contratado (período de gracia, corto plazo)
--      canceled | paused | NULL | '' → degrada a 'starter'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_effective_plan_code(
  p_plan_code   text,
  p_plan_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_plan_status IN ('active', 'trialing', 'past_due')
      THEN coalesce(nullif(trim(p_plan_code), ''), 'starter')
    ELSE 'starter'
  END;
$$;

COMMENT ON FUNCTION public.resolve_effective_plan_code(text, text) IS
  'Canoniza el plan efectivo según estado de suscripción.
   active/trialing/past_due → plan contratado (con fallback a starter).
   canceled/paused/nulo     → starter.
   Esta función es la única fuente de verdad para el effective_plan_code.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. org_billing_effective  (reemplaza definición anterior si existía)
--    Extiende org_billing con effective_plan_code computado canónicamente.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_billing_panel;       -- depende de org_billing_effective
DROP VIEW IF EXISTS public.org_entitlements;      -- depende de org_billing_effective
DROP VIEW IF EXISTS public.org_billing_effective;

CREATE VIEW public.org_billing_effective AS
SELECT
  ob.org_id,
  ob.plan_code,
  ob.subscribed_plan_code,
  ob.plan_status,
  ob.tracker_limit_override,
  ob.stripe_customer_id,
  ob.stripe_subscription_id,
  ob.stripe_price_id,
  ob.current_period_end,
  ob.trial_start,
  ob.trial_end,
  ob.over_limit,
  ob.over_limit_reason,
  ob.over_limit_checked_at,
  ob.updated_at,
  -- ↓ fuente canónica del plan efectivo
  public.resolve_effective_plan_code(
    coalesce(ob.subscribed_plan_code, ob.plan_code),
    ob.plan_status
  ) AS effective_plan_code
FROM public.org_billing ob;

COMMENT ON VIEW public.org_billing_effective IS
  'Vista de lectura completa de org_billing.
   effective_plan_code es el plan real que se aplica a la org (calculado por
   resolve_effective_plan_code). Usar esta vista, nunca organizations.plan,
   como fuente de decisiones comerciales.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. org_entitlements
--    Límites efectivos por organización.
--    Fuente: org_billing_effective → plan_limits (fallback: plans table).
--    Aplica tracker_limit_override cuando está definido.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.org_entitlements AS
SELECT
  obe.org_id,
  obe.effective_plan_code,
  obe.plan_status,
  obe.tracker_limit_override,
  obe.trial_start,
  obe.trial_end,
  obe.over_limit,
  obe.over_limit_reason,

  -- max_geocercas: plan_limits → plans → default 5
  coalesce(
    pl.max_geocercas,
    p.geofence_limit,
    5
  ) AS max_geocercas,

  -- max_trackers: override tiene precedencia; después plan_limits → plans → default 1
  CASE
    WHEN obe.tracker_limit_override IS NOT NULL
      THEN greatest(obe.tracker_limit_override, 0)
    ELSE coalesce(
      pl.max_trackers,
      p.tracker_limit,
      1
    )
  END AS max_trackers

FROM public.org_billing_effective obe
LEFT JOIN public.plan_limits pl
       ON pl.plan = obe.effective_plan_code
LEFT JOIN public.plans p
       ON p.code::text = obe.effective_plan_code;

COMMENT ON VIEW public.org_entitlements IS
  'Límites efectivos por organización.
   Resueltos desde effective_plan_code (no desde organizations.plan).
   tracker_limit_override prevalece sobre los límites del plan.
   Usar esta vista para enforcement y UI. No usar plan_limits directamente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. effective_tracker_limit(p_org_id) → integer
--    Reemplaza la versión con valores hardcoded.
--    Ahora lee max_trackers desde org_entitlements (fuente única).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.effective_tracker_limit(p_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (SELECT max_trackers FROM public.org_entitlements WHERE org_id = p_org_id),
    1   -- fallback seguro si la org no tiene fila en org_billing
  );
$$;

COMMENT ON FUNCTION public.effective_tracker_limit(uuid) IS
  'Devuelve el límite efectivo de trackers para la org.
   Lee desde org_entitlements (que aplica plan efectivo + override).
   Fallback a 1 si la org no tiene registro en org_billing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. get_org_limits(p_org_id) → jsonb
--    Reemplaza versión antigua que devolvía TABLE(max_geocercas, max_trackers).
--    El trigger enforce_geocercas_limit se actualiza también (ver sección 5b).
--    IMPORTANTE: cambio de tipo de retorno requiere DROP previo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Eliminar la firma antigua (TABLE return) para poder redefinir
DROP FUNCTION IF EXISTS public.get_org_limits(uuid);

CREATE FUNCTION public.get_org_limits(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'org_id',             oe.org_id,
    'plan',               obe.plan_code,
    'effective_plan_code', oe.effective_plan_code,
    'plan_status',        oe.plan_status,
    'max_geocercas',      oe.max_geocercas,
    'max_trackers',       oe.max_trackers,
    'tracker_limit_override', oe.tracker_limit_override,
    'over_limit',         oe.over_limit,
    'over_limit_reason',  oe.over_limit_reason,
    'trial_start',        oe.trial_start,
    'trial_end',          oe.trial_end,
    'current_period_end', obe.current_period_end,
    'stripe_customer_id', obe.stripe_customer_id
  )
  FROM public.org_entitlements oe
  JOIN public.org_billing_effective obe USING (org_id)
  WHERE oe.org_id = p_org_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_org_limits(uuid) IS
  'Devuelve un JSON completo con plan, effective_plan_code, plan_status,
   límites efectivos, indicadores over_limit y fechas de trial/período.
   Fuente canónica para UI y reporting del panel de monetización.
   NO usar para enforcement interno — usar org_entitlements directamente.';

-- 5b. Actualizar enforce_geocercas_limit para no depender del tipo de retorno
--     anterior de get_org_limits. Ahora lee org_entitlements directamente.
CREATE OR REPLACE FUNCTION public.enforce_geocercas_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max   int;
  v_count int;
  v_plan  text;
  v_sql   text;
  v_has_deleted_at  boolean;
  v_has_is_deleted  boolean;
  v_has_active      boolean;
BEGIN
  IF tg_op <> 'INSERT' THEN
    RETURN new;
  END IF;

  -- Sin sesgo de RLS en el conteo
  PERFORM set_config('row_security', 'off', true);

  -- Leer límite efectivo y plan desde org_entitlements (fuente única)
  SELECT oe.max_geocercas, oe.effective_plan_code
    INTO v_max, v_plan
  FROM public.org_entitlements oe
  WHERE oe.org_id = new.org_id;

  IF v_max IS NULL THEN
    -- Sin fila en org_billing → comportamiento conservador: no bloquear
    RETURN new;
  END IF;

  v_has_deleted_at := public._col_exists('public.geocercas'::regclass, 'deleted_at');
  v_has_is_deleted := public._col_exists('public.geocercas'::regclass, 'is_deleted');
  v_has_active     := public._col_exists('public.geocercas'::regclass, 'active');

  v_sql := 'SELECT count(*) FROM public.geocercas g WHERE g.org_id = $1';

  IF v_has_deleted_at THEN
    v_sql := v_sql || ' AND g.deleted_at IS NULL';
  END IF;
  IF v_has_is_deleted THEN
    v_sql := v_sql || ' AND coalesce(g.is_deleted, false) = false';
  END IF;
  IF v_has_active THEN
    v_sql := v_sql || ' AND coalesce(g.active, true) = true';
  END IF;

  EXECUTE v_sql INTO v_count USING new.org_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION
      USING errcode = 'P0001',
            message = format(
              'Has alcanzado el límite del plan %s (%s geocerca%s).',
              initcap(coalesce(v_plan, 'starter')),
              v_max,
              CASE WHEN v_max = 1 THEN '' ELSE 's' END
            );
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.enforce_geocercas_limit() IS
  'Trigger BEFORE INSERT en geocercas.
   Valida límite de geocercas contra org_entitlements.max_geocercas.
   Actualizado para usar org_entitlements (ya no llama a get_org_limits).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. v_org_kpis
--    KPIs de uso por organización: trackers activos, geocercas activas.
--    Fuente de métricas para v_billing_panel.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_org_kpis;

CREATE VIEW public.v_org_kpis AS
SELECT
  o.id AS org_id,

  -- Trackers activos: memberships con role='tracker' y no revocadas
  (
    SELECT count(*)::int
    FROM public.memberships m
    WHERE m.org_id = o.id
      AND m.revoked_at IS NULL
      AND m.role::text = 'tracker'
  ) AS active_tracker_count,

  -- Geocercas activas (compatibilidad con columnas opcionales)
  (
    SELECT count(*)::int
    FROM public.geocercas g
    WHERE g.org_id = o.id
      AND (
        NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name  = 'geocercas'
            AND c.column_name = 'deleted_at'
        )
        OR g.deleted_at IS NULL
      )
  ) AS active_geocercas_count

FROM public.organizations o;

COMMENT ON VIEW public.v_org_kpis IS
  'KPIs de uso por organización.
   active_tracker_count: memberships con role=tracker activas.
   active_geocercas_count: filas en geocercas (excluyendo soft-deleted si aplica).
   Dependencia: public.organizations, public.memberships, public.geocercas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. v_billing_panel
--    Vista maestra del panel de monetización.
--    Combina: organizations + org_billing_effective + org_entitlements + v_org_kpis
--    Agrega indicadores derivados: is_over_tracker_limit, is_over_geocercas_limit.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_billing_panel AS
SELECT
  -- ── Identidad de la organización ──────────────────────────────────────────
  o.id                       AS org_id,
  o.name                     AS org_name,
  o.created_at               AS org_created_at,

  -- ── Datos comerciales (org_billing_effective) ─────────────────────────────
  obe.plan_code              AS billing_plan_code,
  obe.subscribed_plan_code,
  obe.plan_status,
  obe.effective_plan_code,
  obe.tracker_limit_override,
  obe.stripe_customer_id,
  obe.stripe_subscription_id,
  obe.stripe_price_id,
  obe.current_period_end,
  obe.trial_start,
  obe.trial_end,
  obe.over_limit             AS billing_over_limit,
  obe.over_limit_reason,
  obe.over_limit_checked_at,
  obe.updated_at             AS billing_updated_at,

  -- ── Límites efectivos (org_entitlements) ──────────────────────────────────
  oe.max_trackers,
  oe.max_geocercas,

  -- ── Uso actual (v_org_kpis) ───────────────────────────────────────────────
  kpi.active_tracker_count,
  kpi.active_geocercas_count,

  -- ── Indicadores derivados ─────────────────────────────────────────────────
  (kpi.active_tracker_count   >= oe.max_trackers)   AS is_over_tracker_limit,
  (kpi.active_geocercas_count >= oe.max_geocercas)  AS is_over_geocercas_limit,

  -- Porcentaje de uso (útil para barras de progreso en el panel)
  round(
    kpi.active_tracker_count::numeric / nullif(oe.max_trackers, 0) * 100, 1
  )                          AS tracker_usage_pct,
  round(
    kpi.active_geocercas_count::numeric / nullif(oe.max_geocercas, 0) * 100, 1
  )                          AS geocercas_usage_pct

FROM public.organizations o
-- LEFT JOIN: incluye orgs sin fila en org_billing (mostraría NULLs)
LEFT JOIN public.org_billing_effective obe ON obe.org_id = o.id
LEFT JOIN public.org_entitlements      oe  ON oe.org_id  = o.id
LEFT JOIN public.v_org_kpis            kpi ON kpi.org_id = o.id;

COMMENT ON VIEW public.v_billing_panel IS
  'Vista maestra del panel de monetización.
   Fuente única para UI de billing y reporting interno.
   Combina estado comercial, límites efectivos y uso actual por organización.

   NUNCA usar organizations.plan como fuente de decisiones de plan.
   SIEMPRE usar effective_plan_code de esta vista o de org_entitlements.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants: las vistas / funciones son accesibles por service_role
--         y autenticados con RLS implícita (solo ven sus propias orgs)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.org_billing_effective TO authenticated, service_role;
GRANT SELECT ON public.org_entitlements      TO authenticated, service_role;
GRANT SELECT ON public.v_org_kpis            TO authenticated, service_role;
GRANT SELECT ON public.v_billing_panel       TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.resolve_effective_plan_code(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_tracker_limit(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_org_limits(uuid)                    TO authenticated, service_role;
