-- 02_preview_rls_policies.sql
-- Grants + RLS + Policies (idempotente: DROP POLICY IF EXISTS antes de crear)

DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar" ON "public"."geocercas_tbl";

CREATE POLICY "Usuarios autenticados pueden insertar" ON "public"."geocercas_tbl" FOR INSERT TO "authenticated" WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden leer" ON "public"."geocercas_tbl";

CREATE POLICY "Usuarios autenticados pueden leer" ON "public"."geocercas_tbl" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "aa_mod" ON "public"."activity_assignments";

CREATE POLICY "aa_mod" ON "public"."activity_assignments" TO "authenticated" USING (("tenant_id" = "public"."app_jwt_tenant"())) WITH CHECK (("tenant_id" = "public"."app_jwt_tenant"()));

DROP POLICY IF EXISTS "aa_sel" ON "public"."activity_assignments";

CREATE POLICY "aa_sel" ON "public"."activity_assignments" FOR SELECT USING ((("public"."app_jwt_role"() = 'owner'::"text") OR ("tenant_id" = "public"."app_jwt_tenant"())));

ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_delete_none" ON "public"."activities";

CREATE POLICY "activities_delete_none" ON "public"."activities" FOR DELETE USING (false);

DROP POLICY IF EXISTS "activities_insert_owner_admin" ON "public"."activities";

CREATE POLICY "activities_insert_owner_admin" ON "public"."activities" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE (("app_user_roles"."user_id" = "auth"."uid"()) AND ("app_user_roles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "activities_select_by_is_member" ON "public"."activities";

CREATE POLICY "activities_select_by_is_member" ON "public"."activities" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));

DROP POLICY IF EXISTS "activities_select_by_membership" ON "public"."activities";

CREATE POLICY "activities_select_by_membership" ON "public"."activities" FOR SELECT USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));

DROP POLICY IF EXISTS "activities_select_by_org" ON "public"."activities";

CREATE POLICY "activities_select_by_org" ON "public"."activities" FOR SELECT USING (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE ("app_user_roles"."user_id" = "auth"."uid"()))));

DROP POLICY IF EXISTS "activities_update_owner_admin" ON "public"."activities";

CREATE POLICY "activities_update_owner_admin" ON "public"."activities" FOR UPDATE USING (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE (("app_user_roles"."user_id" = "auth"."uid"()) AND ("app_user_roles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE (("app_user_roles"."user_id" = "auth"."uid"()) AND ("app_user_roles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "activities_write_by_membership" ON "public"."activities";

CREATE POLICY "activities_write_by_membership" ON "public"."activities" USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"())))) WITH CHECK (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));

ALTER TABLE "public"."activity_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_rates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_full_access" ON "public"."geofence_assignments";

CREATE POLICY "admins_full_access" ON "public"."geofence_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text")))));

DROP POLICY IF EXISTS "admins_root_only_delete" ON "public"."admins";

CREATE POLICY "admins_root_only_delete" ON "public"."admins" FOR DELETE TO "authenticated" USING ("public"."is_root_owner"());

DROP POLICY IF EXISTS "admins_root_only_select" ON "public"."admins";

CREATE POLICY "admins_root_only_select" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."is_root_owner"());

DROP POLICY IF EXISTS "admins_root_only_update" ON "public"."admins";

CREATE POLICY "admins_root_only_update" ON "public"."admins" FOR UPDATE TO "authenticated" USING ("public"."is_root_owner"()) WITH CHECK ("public"."is_root_owner"());

DROP POLICY IF EXISTS "admins_root_only_write" ON "public"."admins";

CREATE POLICY "admins_root_only_write" ON "public"."admins" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_root_owner"());

DROP POLICY IF EXISTS "allow anon insert" ON "public"."geocercas_tbl";

CREATE POLICY "allow anon insert" ON "public"."geocercas_tbl" FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow anon read" ON "public"."geocercas_tbl";

CREATE POLICY "allow anon read" ON "public"."geocercas_tbl" FOR SELECT USING (true);

ALTER TABLE "public"."app_root_users" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_root_users_read_own" ON "public"."app_root_users";

CREATE POLICY "app_root_users_read_own" ON "public"."app_root_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read_authenticated" ON "public"."app_settings";

CREATE POLICY "app_settings_read_authenticated" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "app_settings_write_service_role" ON "public"."app_settings";

CREATE POLICY "app_settings_write_service_role" ON "public"."app_settings" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."app_superadmins" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_superadmins_read_authenticated" ON "public"."app_superadmins";

CREATE POLICY "app_superadmins_read_authenticated" ON "public"."app_superadmins" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "app_superadmins_write_service_role" ON "public"."app_superadmins";

CREATE POLICY "app_superadmins_write_service_role" ON "public"."app_superadmins" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."app_user_roles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_user_roles_select_by_org_admin" ON "public"."app_user_roles";

CREATE POLICY "app_user_roles_select_by_org_admin" ON "public"."app_user_roles" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("org_id"));

DROP POLICY IF EXISTS "app_user_roles_select_own" ON "public"."app_user_roles";

CREATE POLICY "app_user_roles_select_own" ON "public"."app_user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "app_user_roles_write_by_org_admin" ON "public"."app_user_roles";

CREATE POLICY "app_user_roles_write_by_org_admin" ON "public"."app_user_roles" TO "authenticated" USING ("public"."is_org_admin"(COALESCE("org_id", "public"."current_org_id_from_memberships"()))) WITH CHECK ("public"."is_org_admin"(COALESCE("org_id", "public"."current_org_id_from_memberships"())));

DROP POLICY IF EXISTS "ar_mod" ON "public"."activity_rates";

CREATE POLICY "ar_mod" ON "public"."activity_rates" TO "authenticated" USING (("tenant_id" = "public"."app_jwt_tenant"())) WITH CHECK (("tenant_id" = "public"."app_jwt_tenant"()));

DROP POLICY IF EXISTS "ar_sel" ON "public"."activity_rates";

CREATE POLICY "ar_sel" ON "public"."activity_rates" FOR SELECT USING ((("public"."app_jwt_role"() = 'owner'::"text") OR ("tenant_id" = "public"."app_jwt_tenant"())));

ALTER TABLE "public"."asignaciones" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asignaciones delete" ON "public"."asignaciones";

CREATE POLICY "asignaciones delete" ON "public"."asignaciones" FOR DELETE TO "authenticated" USING ("public"."is_member_of_org"("org_id"));

DROP POLICY IF EXISTS "asignaciones insert" ON "public"."asignaciones";

CREATE POLICY "asignaciones insert" ON "public"."asignaciones" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_member_of_org"("org_id"));

DROP POLICY IF EXISTS "asignaciones select" ON "public"."asignaciones";

CREATE POLICY "asignaciones select" ON "public"."asignaciones" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));

DROP POLICY IF EXISTS "asignaciones update" ON "public"."asignaciones";

CREATE POLICY "asignaciones update" ON "public"."asignaciones" FOR UPDATE TO "authenticated" USING ("public"."is_member_of_org"("org_id")) WITH CHECK ("public"."is_member_of_org"("org_id"));

DROP POLICY IF EXISTS "asignaciones_delete_owner_admin" ON "public"."asignaciones";

CREATE POLICY "asignaciones_delete_owner_admin" ON "public"."asignaciones" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "asignaciones_insert_owner_admin" ON "public"."asignaciones";

CREATE POLICY "asignaciones_insert_owner_admin" ON "public"."asignaciones" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "asignaciones_select_by_role" ON "public"."asignaciones";

CREATE POLICY "asignaciones_select_by_role" ON "public"."asignaciones" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."org_members" "om2"
  WHERE (("om2"."org_id" = "asignaciones"."org_id") AND ("om2"."user_id" = "auth"."uid"()) AND ("om2"."role" = 'tracker'::"text"))))));

DROP POLICY IF EXISTS "asignaciones_update_owner_admin" ON "public"."asignaciones";

CREATE POLICY "asignaciones_update_owner_admin" ON "public"."asignaciones" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

ALTER TABLE "public"."asistencias" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asistencias_insert_self" ON "public"."asistencias";

CREATE POLICY "asistencias_insert_self" ON "public"."asistencias" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "asistencias_select_self" ON "public"."asistencias";

CREATE POLICY "asistencias_select_self" ON "public"."asistencias" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "asistencias_update_self" ON "public"."asistencias";

CREATE POLICY "asistencias_update_self" ON "public"."asistencias" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendances_insert_auth" ON "public"."attendances";

CREATE POLICY "attendances_insert_auth" ON "public"."attendances" FOR INSERT TO "authenticated" WITH CHECK (true);

DROP POLICY IF EXISTS "attendances_read_auth" ON "public"."attendances";

CREATE POLICY "attendances_read_auth" ON "public"."attendances" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "auth can delete" ON "public"."geocercas_tbl";

CREATE POLICY "auth can delete" ON "public"."geocercas_tbl" FOR DELETE TO "authenticated" USING (true);

DROP POLICY IF EXISTS "auth can insert" ON "public"."geocercas_tbl";

CREATE POLICY "auth can insert" ON "public"."geocercas_tbl" FOR INSERT TO "authenticated" WITH CHECK (true);

DROP POLICY IF EXISTS "auth can select" ON "public"."geocercas_tbl";

CREATE POLICY "auth can select" ON "public"."geocercas_tbl" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "auth can update" ON "public"."geocercas_tbl";

CREATE POLICY "auth can update" ON "public"."geocercas_tbl" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete own geocercas" ON "public"."geocercas_tbl";

CREATE POLICY "delete own geocercas" ON "public"."geocercas_tbl" FOR DELETE USING (("owner_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "dev_all_assignments" ON "public"."geofence_assignments";

CREATE POLICY "dev_all_assignments" ON "public"."geofence_assignments" USING (true) WITH CHECK (true);

ALTER TABLE "public"."geocercas" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geocercas_crud_auth" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_crud_auth" ON "public"."geocercas_tbl" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = COALESCE("created_by", "auth"."uid"())));

DROP POLICY IF EXISTS "geocercas_delete" ON "public"."geocercas";

CREATE POLICY "geocercas_delete" ON "public"."geocercas" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geocercas"."org_id")))));

DROP POLICY IF EXISTS "geocercas_delete_own" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_delete_own" ON "public"."geocercas_tbl" FOR DELETE USING (("created_by" = "auth"."uid"()));

DROP POLICY IF EXISTS "geocercas_delete_owner" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_delete_owner" ON "public"."geocercas_tbl" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "geocercas_insert_by_org" ON "public"."geocercas";

CREATE POLICY "geocercas_insert_by_org" ON "public"."geocercas" FOR INSERT TO "authenticated" WITH CHECK (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));

DROP POLICY IF EXISTS "geocercas_insert_own" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_insert_own" ON "public"."geocercas_tbl" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));

DROP POLICY IF EXISTS "geocercas_insert_self" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_insert_self" ON "public"."geocercas_tbl" FOR INSERT TO "authenticated" WITH CHECK ((COALESCE("owner_id", "auth"."uid"()) = "auth"."uid"()));

DROP POLICY IF EXISTS "geocercas_mod" ON "public"."geocercas";

CREATE POLICY "geocercas_mod" ON "public"."geocercas" USING ((("org_id" IS NOT NULL) AND ("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))))) WITH CHECK ((("org_id" IS NOT NULL) AND ("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"())))));

DROP POLICY IF EXISTS "geocercas_select" ON "public"."geocercas";

CREATE POLICY "geocercas_select" ON "public"."geocercas" FOR SELECT USING ((("org_id" IS NOT NULL) AND ("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"())))));

DROP POLICY IF EXISTS "geocercas_select_assigned_trackers" ON "public"."geocercas";

CREATE POLICY "geocercas_select_assigned_trackers" ON "public"."geocercas" FOR SELECT TO "authenticated" USING ("public"."is_tracker_assigned_to_geofence"("org_id", "id"));

DROP POLICY IF EXISTS "geocercas_select_auth" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_select_auth" ON "public"."geocercas_tbl" FOR SELECT USING (("auth"."uid"() = "created_by"));

DROP POLICY IF EXISTS "geocercas_select_by_is_member" ON "public"."geocercas";

CREATE POLICY "geocercas_select_by_is_member" ON "public"."geocercas" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));

DROP POLICY IF EXISTS "geocercas_select_by_org" ON "public"."geocercas";

CREATE POLICY "geocercas_select_by_org" ON "public"."geocercas" FOR SELECT TO "authenticated" USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));

DROP POLICY IF EXISTS "geocercas_select_org_members" ON "public"."geocercas";

CREATE POLICY "geocercas_select_org_members" ON "public"."geocercas" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("org_id"));

DROP POLICY IF EXISTS "geocercas_select_own" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_select_own" ON "public"."geocercas_tbl" FOR SELECT USING (("created_by" = "auth"."uid"()));

DROP POLICY IF EXISTS "geocercas_select_owner" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_select_owner" ON "public"."geocercas_tbl" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));

ALTER TABLE "public"."geocercas_tbl" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geocercas_update" ON "public"."geocercas";

CREATE POLICY "geocercas_update" ON "public"."geocercas" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geocercas"."org_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geocercas"."org_id")))));

DROP POLICY IF EXISTS "geocercas_update_own" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_update_own" ON "public"."geocercas_tbl" FOR UPDATE USING (("created_by" = "auth"."uid"()));

DROP POLICY IF EXISTS "geocercas_update_owner" ON "public"."geocercas_tbl";

CREATE POLICY "geocercas_update_owner" ON "public"."geocercas_tbl" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));

ALTER TABLE "public"."geofence_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."geofence_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."geofence_members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."geofences" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geofences_delete" ON "public"."geofences";

CREATE POLICY "geofences_delete" ON "public"."geofences" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));

DROP POLICY IF EXISTS "geofences_delete_admin" ON "public"."geofences";

CREATE POLICY "geofences_delete_admin" ON "public"."geofences" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "geofences_insert" ON "public"."geofences";

CREATE POLICY "geofences_insert" ON "public"."geofences" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));

DROP POLICY IF EXISTS "geofences_insert_admin" ON "public"."geofences";

CREATE POLICY "geofences_insert_admin" ON "public"."geofences" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));

DROP POLICY IF EXISTS "geofences_insert_in_org" ON "public"."geofences";

CREATE POLICY "geofences_insert_in_org" ON "public"."geofences" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_user_roles" "r"
  WHERE (("r"."org_id" = "geofences"."org_id") AND ("r"."user_id" = "auth"."uid"())))));

DROP POLICY IF EXISTS "geofences_select" ON "public"."geofences";

CREATE POLICY "geofences_select" ON "public"."geofences" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));

DROP POLICY IF EXISTS "geofences_select_admin" ON "public"."geofences";

CREATE POLICY "geofences_select_admin" ON "public"."geofences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "geofences_select_in_org" ON "public"."geofences";

CREATE POLICY "geofences_select_in_org" ON "public"."geofences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_user_roles" "r"
  WHERE (("r"."org_id" = "geofences"."org_id") AND ("r"."user_id" = "auth"."uid"())))));

DROP POLICY IF EXISTS "geofences_select_tracker_assigned" ON "public"."geofences";

CREATE POLICY "geofences_select_tracker_assigned" ON "public"."geofences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tracker_assignments" "ta"
  WHERE (("ta"."org_id" = "geofences"."org_id") AND ("ta"."geofence_id" = "geofences"."id") AND ("ta"."tracker_user_id" = "auth"."uid"()) AND (COALESCE("ta"."active", true) = true) AND ((CURRENT_DATE >= "ta"."start_date") AND (CURRENT_DATE <= "ta"."end_date"))))));

DROP POLICY IF EXISTS "geofences_update" ON "public"."geofences";

CREATE POLICY "geofences_update" ON "public"."geofences" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));

DROP POLICY IF EXISTS "geofences_update_admin" ON "public"."geofences";

CREATE POLICY "geofences_update_admin" ON "public"."geofences" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((("org_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));

DROP POLICY IF EXISTS "insert own geocercas" ON "public"."geocercas_tbl";

CREATE POLICY "insert own geocercas" ON "public"."geocercas_tbl" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "insert_anyone" ON "public"."attendances";

CREATE POLICY "insert_anyone" ON "public"."attendances" FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "insert_anyone_dev" ON "public"."attendances";

CREATE POLICY "insert_anyone_dev" ON "public"."attendances" FOR INSERT TO "anon" WITH CHECK (true);

DROP POLICY IF EXISTS "insert_authenticated" ON "public"."attendances";

CREATE POLICY "insert_authenticated" ON "public"."attendances" FOR INSERT TO "authenticated" WITH CHECK (true);

DROP POLICY IF EXISTS "insert_own_location" ON "public"."tracker_locations";

CREATE POLICY "insert_own_location" ON "public"."tracker_locations" FOR INSERT TO "authenticated" WITH CHECK (("tracker_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "inv: managers modify" ON "public"."invitations";

CREATE POLICY "inv: managers modify" ON "public"."invitations" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "invitations"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"public"."role_type", 'admin'::"public"."role_type"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "invitations"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"public"."role_type", 'admin'::"public"."role_type"]))))));

DROP POLICY IF EXISTS "inv: managers select" ON "public"."invitations";

CREATE POLICY "inv: managers select" ON "public"."invitations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "invitations"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"public"."role_type", 'admin'::"public"."role_type"]))))));

ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "me update my phone" ON "public"."user_profiles";

CREATE POLICY "me update my phone" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));

DROP POLICY IF EXISTS "me update my phone - upd" ON "public"."user_profiles";

CREATE POLICY "me update my phone - upd" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));

ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_delete_admin" ON "public"."memberships";

CREATE POLICY "memberships_delete_admin" ON "public"."memberships" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id"));

DROP POLICY IF EXISTS "memberships_insert_admin" ON "public"."memberships";

CREATE POLICY "memberships_insert_admin" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" IS NOT NULL) AND "public"."is_org_admin"("org_id")));

DROP POLICY IF EXISTS "memberships_insert_self" ON "public"."memberships";

CREATE POLICY "memberships_insert_self" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("org_id" IS NOT NULL)));

DROP POLICY IF EXISTS "memberships_select_admin" ON "public"."memberships";

CREATE POLICY "memberships_select_admin" ON "public"."memberships" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("org_id"));

DROP POLICY IF EXISTS "memberships_select_own" ON "public"."memberships";

CREATE POLICY "memberships_select_own" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "memberships_update_admin" ON "public"."memberships";

CREATE POLICY "memberships_update_admin" ON "public"."memberships" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id")) WITH CHECK ("public"."is_org_admin"("org_id"));

DROP POLICY IF EXISTS "memberships_update_own" ON "public"."memberships";

CREATE POLICY "memberships_update_own" ON "public"."memberships" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "org admins can read org tracker positions" ON "public"."tracker_positions";

CREATE POLICY "org admins can read org tracker positions" ON "public"."tracker_positions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."personal" "p"
  WHERE (("p"."user_id" = "tracker_positions"."user_id") AND (COALESCE("p"."is_deleted", false) = false) AND (COALESCE("p"."activo_bool", true) = true) AND (COALESCE("p"."vigente", true) = true) AND "public"."is_org_admin"("p"."org_id", "auth"."uid"())))));

DROP POLICY IF EXISTS "org_delete_owner_only" ON "public"."organizations";

CREATE POLICY "org_delete_owner_only" ON "public"."organizations" FOR DELETE TO "authenticated" USING (("public"."_is_root_claim"() OR ("owner_id" = "auth"."uid"())));

DROP POLICY IF EXISTS "org_insert_owner_self" ON "public"."organizations";

CREATE POLICY "org_insert_owner_self" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (("public"."_is_root_claim"() OR ("owner_id" = "auth"."uid"())));

ALTER TABLE "public"."org_invites" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_invites_root_only_delete" ON "public"."org_invites";

CREATE POLICY "org_invites_root_only_delete" ON "public"."org_invites" FOR DELETE TO "authenticated" USING ("public"."is_root_owner"());

DROP POLICY IF EXISTS "org_invites_root_only_select" ON "public"."org_invites";

CREATE POLICY "org_invites_root_only_select" ON "public"."org_invites" FOR SELECT TO "authenticated" USING ("public"."is_root_owner"());

DROP POLICY IF EXISTS "org_invites_root_only_update" ON "public"."org_invites";

CREATE POLICY "org_invites_root_only_update" ON "public"."org_invites" FOR UPDATE TO "authenticated" USING ("public"."is_root_owner"()) WITH CHECK ("public"."is_root_owner"());

DROP POLICY IF EXISTS "org_invites_root_only_write" ON "public"."org_invites";

CREATE POLICY "org_invites_root_only_write" ON "public"."org_invites" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_root_owner"());

ALTER TABLE "public"."org_members" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_self" ON "public"."org_members";

CREATE POLICY "org_members_select_self" ON "public"."org_members" FOR SELECT USING (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "org_select_owner_or_member" ON "public"."organizations";

CREATE POLICY "org_select_owner_or_member" ON "public"."organizations" FOR SELECT TO "authenticated" USING (("public"."_is_root_claim"() OR ("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "organizations"."id") AND ("m"."user_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "org_update_owner_only" ON "public"."organizations";

CREATE POLICY "org_update_owner_only" ON "public"."organizations" FOR UPDATE TO "authenticated" USING (("public"."_is_root_claim"() OR ("owner_id" = "auth"."uid"()))) WITH CHECK (("public"."_is_root_claim"() OR ("owner_id" = "auth"."uid"())));

ALTER TABLE "public"."org_users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pe_insert" ON "public"."position_events";

CREATE POLICY "pe_insert" ON "public"."position_events" FOR INSERT TO "authenticated" WITH CHECK ((("tracker_user_id" = "auth"."uid"()) AND ("tenant_id" = "public"."app_jwt_tenant"())));

DROP POLICY IF EXISTS "pe_select" ON "public"."position_events";

CREATE POLICY "pe_select" ON "public"."position_events" FOR SELECT USING ((("public"."app_jwt_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("tenant_id" = "public"."app_jwt_tenant"())));

ALTER TABLE "public"."pending_invites" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_invites read" ON "public"."pending_invites";

CREATE POLICY "pending_invites read" ON "public"."pending_invites" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_owner"("auth"."uid"()));

DROP POLICY IF EXISTS "pending_invites write" ON "public"."pending_invites";

CREATE POLICY "pending_invites write" ON "public"."pending_invites" TO "authenticated" USING ("public"."is_admin_or_owner"("auth"."uid"())) WITH CHECK ("public"."is_admin_or_owner"("auth"."uid"()));

DROP POLICY IF EXISTS "pending_invites_insert_root" ON "public"."pending_invites";

CREATE POLICY "pending_invites_insert_root" ON "public"."pending_invites" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "r"
  WHERE (("r"."user_id" = "auth"."uid"()) AND ("r"."active" = true)))));

DROP POLICY IF EXISTS "pending_invites_select_own_email" ON "public"."pending_invites";

CREATE POLICY "pending_invites_select_own_email" ON "public"."pending_invites" FOR SELECT TO "authenticated" USING ((("email" IS NOT NULL) AND ("lower"("email") = "lower"("auth"."email"()))));

DROP POLICY IF EXISTS "pending_invites_select_root" ON "public"."pending_invites";

CREATE POLICY "pending_invites_select_root" ON "public"."pending_invites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "r"
  WHERE (("r"."user_id" = "auth"."uid"()) AND ("r"."active" = true)))));

ALTER TABLE "public"."personal" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_delete_admin" ON "public"."personal";

CREATE POLICY "personal_delete_admin" ON "public"."personal" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"()));

DROP POLICY IF EXISTS "personal_insert_admin" ON "public"."personal";

CREATE POLICY "personal_insert_admin" ON "public"."personal" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("org_id", "auth"."uid"()));

DROP POLICY IF EXISTS "personal_select_admins" ON "public"."personal";

CREATE POLICY "personal_select_admins" ON "public"."personal" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"()));

DROP POLICY IF EXISTS "personal_select_by_is_member" ON "public"."personal";

CREATE POLICY "personal_select_by_is_member" ON "public"."personal" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));

DROP POLICY IF EXISTS "personal_select_members" ON "public"."personal";

CREATE POLICY "personal_select_members" ON "public"."personal" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "personal"."org_id") AND ("m"."user_id" = "auth"."uid"())))));

DROP POLICY IF EXISTS "personal_update_admin" ON "public"."personal";

CREATE POLICY "personal_update_admin" ON "public"."personal" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"())) WITH CHECK ("public"."is_org_admin"("org_id", "auth"."uid"()));

ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personas_select_auth" ON "public"."personas";

CREATE POLICY "personas_select_auth" ON "public"."personas" FOR SELECT USING (("auth"."uid"() IS NOT NULL));

DROP POLICY IF EXISTS "pos_insert_self" ON "public"."posiciones";

CREATE POLICY "pos_insert_self" ON "public"."posiciones" FOR INSERT TO "authenticated" WITH CHECK (("tracker_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "pos_select_self" ON "public"."posiciones";

CREATE POLICY "pos_select_self" ON "public"."posiciones" FOR SELECT TO "authenticated" USING (("tracker_id" = "auth"."uid"()));

ALTER TABLE "public"."posiciones" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."position_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "positions_delete_admin_org" ON "public"."positions";

CREATE POLICY "positions_delete_admin_org" ON "public"."positions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "positions_insert_self" ON "public"."positions";

CREATE POLICY "positions_insert_self" ON "public"."positions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "positions_insert_tracker" ON "public"."positions";

CREATE POLICY "positions_insert_tracker" ON "public"."positions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['tracker'::"text", 'admin'::"text", 'owner'::"text"]))))) AND ("user_id" = "auth"."uid"())));

DROP POLICY IF EXISTS "positions_select_admin_org" ON "public"."positions";

CREATE POLICY "positions_select_admin_org" ON "public"."positions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));

DROP POLICY IF EXISTS "positions_select_authenticated" ON "public"."positions";

CREATE POLICY "positions_select_authenticated" ON "public"."positions" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "positions_select_tracker_self" ON "public"."positions";

CREATE POLICY "positions_select_tracker_self" ON "public"."positions" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = 'tracker'::"text"))))));

DROP POLICY IF EXISTS "positions_update_admin_org" ON "public"."positions";

CREATE POLICY "positions_update_admin_org" ON "public"."positions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_insert_self" ON "public"."profiles";

CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));

DROP POLICY IF EXISTS "profiles_select_authenticated" ON "public"."profiles";

CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "profiles_select_same_org" ON "public"."profiles";

CREATE POLICY "profiles_select_same_org" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("org_id" IN ( SELECT "user_orgs"."org_id"
   FROM "public"."user_orgs"
  WHERE ("user_orgs"."user_id" = "auth"."uid"())))));

DROP POLICY IF EXISTS "profiles_select_self" ON "public"."profiles";

CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));

DROP POLICY IF EXISTS "profiles_self_read" ON "public"."profiles";

CREATE POLICY "profiles_self_read" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));

DROP POLICY IF EXISTS "profiles_update_self" ON "public"."profiles";

CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));

DROP POLICY IF EXISTS "read all logs" ON "public"."tracker_logs";

CREATE POLICY "read all logs" ON "public"."tracker_logs" FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "read geofence events all" ON "public"."geofence_events";

CREATE POLICY "read geofence events all" ON "public"."geofence_events" FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "read latest by org" ON "public"."tracker_latest";

CREATE POLICY "read latest by org" ON "public"."tracker_latest" FOR SELECT TO "authenticated" USING ((("org_id")::"text" = COALESCE((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'org_id'::"text"), ''::"text")));

DROP POLICY IF EXISTS "read latest positions" ON "public"."tracker_latest";

CREATE POLICY "read latest positions" ON "public"."tracker_latest" FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "read own positions" ON "public"."tracker_positions";

CREATE POLICY "read own positions" ON "public"."tracker_positions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "read state all" ON "public"."user_geofence_state";

CREATE POLICY "read state all" ON "public"."user_geofence_state" FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "read_all_attendances" ON "public"."attendances";

CREATE POLICY "read_all_attendances" ON "public"."attendances" FOR SELECT USING (true);

ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select_all" ON "public"."roles";

CREATE POLICY "roles_select_all" ON "public"."roles" FOR SELECT USING (true);

DROP POLICY IF EXISTS "select own geocercas" ON "public"."geocercas_tbl";

CREATE POLICY "select own geocercas" ON "public"."geocercas_tbl" FOR SELECT USING (("owner_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "select_anyone_dev" ON "public"."attendances";

CREATE POLICY "select_anyone_dev" ON "public"."attendances" FOR SELECT TO "anon" USING (true);

DROP POLICY IF EXISTS "select_own_locations" ON "public"."tracker_locations";

CREATE POLICY "select_own_locations" ON "public"."tracker_locations" FOR SELECT TO "authenticated" USING (("tracker_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "ta_mod" ON "public"."tracker_assignments";

CREATE POLICY "ta_mod" ON "public"."tracker_assignments" TO "authenticated" USING (("tenant_id" = "public"."app_jwt_tenant"())) WITH CHECK (("tenant_id" = "public"."app_jwt_tenant"()));

DROP POLICY IF EXISTS "ta_sel" ON "public"."tracker_assignments";

CREATE POLICY "ta_sel" ON "public"."tracker_assignments" FOR SELECT USING ((("public"."app_jwt_role"() = 'owner'::"text") OR ("tenant_id" = "public"."app_jwt_tenant"())));

ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_owner_all" ON "public"."tenants";

CREATE POLICY "tenants_owner_all" ON "public"."tenants" USING (("public"."app_jwt_role"() = 'owner'::"text"));

ALTER TABLE "public"."tracker_assignments" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracker_assignments_delete_org" ON "public"."tracker_assignments";

CREATE POLICY "tracker_assignments_delete_org" ON "public"."tracker_assignments" FOR DELETE USING (true);

DROP POLICY IF EXISTS "tracker_assignments_insert_org" ON "public"."tracker_assignments";

CREATE POLICY "tracker_assignments_insert_org" ON "public"."tracker_assignments" FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "tracker_assignments_select_org" ON "public"."tracker_assignments";

CREATE POLICY "tracker_assignments_select_org" ON "public"."tracker_assignments" FOR SELECT USING (true);

DROP POLICY IF EXISTS "tracker_assignments_update_org" ON "public"."tracker_assignments";

CREATE POLICY "tracker_assignments_update_org" ON "public"."tracker_assignments" FOR UPDATE USING (true) WITH CHECK (true);

ALTER TABLE "public"."tracker_latest" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tracker_locations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tracker_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tracker_positions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trackers insert their own position" ON "public"."tracker_positions";

CREATE POLICY "trackers insert their own position" ON "public"."tracker_positions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "uo_delete_owner_only" ON "public"."user_orgs";

CREATE POLICY "uo_delete_owner_only" ON "public"."user_orgs" FOR DELETE TO "authenticated" USING (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"()))));

DROP POLICY IF EXISTS "uo_insert_owner_only" ON "public"."user_orgs";

CREATE POLICY "uo_insert_owner_only" ON "public"."user_orgs" FOR INSERT TO "authenticated" WITH CHECK (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"()))));

DROP POLICY IF EXISTS "uo_select_self_or_owned" ON "public"."user_orgs";

CREATE POLICY "uo_select_self_or_owned" ON "public"."user_orgs" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"())))));

DROP POLICY IF EXISTS "uo_update_owner_only" ON "public"."user_orgs";

CREATE POLICY "uo_update_owner_only" ON "public"."user_orgs" FOR UPDATE TO "authenticated" USING (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"())))) WITH CHECK (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"()))));

DROP POLICY IF EXISTS "up_ins_admin" ON "public"."users_public";

CREATE POLICY "up_ins_admin" ON "public"."users_public" FOR INSERT WITH CHECK ((("public"."app_jwt_role"() = 'admin'::"text") AND ("tenant_id" = "public"."app_jwt_tenant"())));

DROP POLICY IF EXISTS "up_ins_owner" ON "public"."users_public";

CREATE POLICY "up_ins_owner" ON "public"."users_public" FOR INSERT WITH CHECK (("public"."app_jwt_role"() = 'owner'::"text"));

DROP POLICY IF EXISTS "up_sel_admin" ON "public"."users_public";

CREATE POLICY "up_sel_admin" ON "public"."users_public" FOR SELECT USING ((("public"."app_jwt_role"() = 'admin'::"text") AND ("tenant_id" = "public"."app_jwt_tenant"())));

DROP POLICY IF EXISTS "up_sel_owner" ON "public"."users_public";

CREATE POLICY "up_sel_owner" ON "public"."users_public" FOR SELECT USING (("public"."app_jwt_role"() = 'owner'::"text"));

DROP POLICY IF EXISTS "up_sel_self" ON "public"."users_public";

CREATE POLICY "up_sel_self" ON "public"."users_public" FOR SELECT USING (("id" = "auth"."uid"()));

DROP POLICY IF EXISTS "up_upd_admin" ON "public"."users_public";

CREATE POLICY "up_upd_admin" ON "public"."users_public" FOR UPDATE USING ((("public"."app_jwt_role"() = 'admin'::"text") AND ("tenant_id" = "public"."app_jwt_tenant"()))) WITH CHECK ((("public"."app_jwt_role"() = 'admin'::"text") AND ("tenant_id" = "public"."app_jwt_tenant"())));

DROP POLICY IF EXISTS "up_upd_owner" ON "public"."users_public";

CREATE POLICY "up_upd_owner" ON "public"."users_public" FOR UPDATE USING (("public"."app_jwt_role"() = 'owner'::"text"));

DROP POLICY IF EXISTS "update own geocercas" ON "public"."geocercas_tbl";

CREATE POLICY "update own geocercas" ON "public"."geocercas_tbl" FOR UPDATE USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "update_own_locations" ON "public"."tracker_locations";

CREATE POLICY "update_own_locations" ON "public"."tracker_locations" FOR UPDATE TO "authenticated" USING (("tracker_id" = "auth"."uid"())) WITH CHECK (("tracker_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "user can insert own positions" ON "public"."tracker_positions";

CREATE POLICY "user can insert own positions" ON "public"."tracker_positions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "user can read own org settings" ON "public"."user_org_settings";

CREATE POLICY "user can read own org settings" ON "public"."user_org_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "user can see own positions" ON "public"."tracker_positions";

CREATE POLICY "user can see own positions" ON "public"."tracker_positions" FOR SELECT USING (("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "user can update own org settings" ON "public"."user_org_settings";

CREATE POLICY "user can update own org settings" ON "public"."user_org_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));

DROP POLICY IF EXISTS "user can upsert own org settings" ON "public"."user_org_settings";

CREATE POLICY "user can upsert own org settings" ON "public"."user_org_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."user_geofence_state" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_org_select_self" ON "public"."user_organizations";

CREATE POLICY "user_org_select_self" ON "public"."user_organizations" FOR SELECT USING (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."user_org_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_organizations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_orgs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_orgs_insert_self" ON "public"."user_organizations";

CREATE POLICY "user_orgs_insert_self" ON "public"."user_organizations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles write only admin/owner" ON "public"."user_roles";

CREATE POLICY "user_roles write only admin/owner" ON "public"."user_roles" TO "authenticated" USING ("public"."is_admin_or_owner"("auth"."uid"())) WITH CHECK ("public"."is_admin_or_owner"("auth"."uid"()));

ALTER TABLE "public"."users_public" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_insert_self" ON "public"."usuarios";

CREATE POLICY "usuarios_insert_self" ON "public"."usuarios" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));

DROP POLICY IF EXISTS "usuarios_select_self" ON "public"."usuarios";

CREATE POLICY "usuarios_select_self" ON "public"."usuarios" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));

DROP POLICY IF EXISTS "usuarios_update_self" ON "public"."usuarios";

CREATE POLICY "usuarios_update_self" ON "public"."usuarios" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));

GRANT USAGE ON SCHEMA "public" TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";




DO $$
BEGIN
  -- _col_exists(regclass,text)
  BEGIN
    EXECUTE 'GRANT ALL ON FUNCTION public._col_exists(regclass, text) TO anon';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    EXECUTE 'GRANT ALL ON FUNCTION public._col_exists(regclass, text) TO authenticated';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    EXECUTE 'GRANT ALL ON FUNCTION public._col_exists(regclass, text) TO service_role';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  -- _col_exists(text,text)
  BEGIN
    EXECUTE 'GRANT ALL ON FUNCTION public._col_exists(text, text) TO anon';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    EXECUTE 'GRANT ALL ON FUNCTION public._col_exists(text, text) TO authenticated';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    EXECUTE 'GRANT ALL ON FUNCTION public._col_exists(text, text) TO service_role';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;



























































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
