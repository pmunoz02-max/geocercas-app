// scripts/test-multiorg-rls.ts
//
// Test de RLS multiorg para App Geocercas
//
// Cómo ejecutar:
//  1) ts-node scripts/test-multiorg-rls.ts
//     o compilar: tsc scripts/test-multiorg-rls.ts && node dist/scripts/test-multiorg-rls.js

import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  console.error("Faltan variables SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

type TestUser = {
  email: string;
  password: string;
  id?: string;
  accessToken?: string;
};

const OWNER: TestUser = {
  email: "owner@test.rlssuite",
  password: "TestRls#Owner123",
};

const ADMIN: TestUser = {
  email: "admin@test.rlssuite",
  password: "TestRls#Admin123",
};

const TRACKER: TestUser = {
  email: "tracker@test.rlssuite",
  password: "TestRls#Tracker123",
};

const OUTSIDER: TestUser = {
  email: "outsider@test.rlssuite",
  password: "TestRls#Outsider123",
};

const TEST_ORG_NAME = "RLS Test Org – DO NOT USE";

const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Utilidad: log + abortar
function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    console.error("❌ TEST FAILED:", message);
    process.exit(1);
  }
}

// Crea o recupera un usuario de prueba usando el service role
async function ensureUser(u: TestUser): Promise<TestUser> {
  const { data: lookup, error: lookupErr } = await serviceClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (lookupErr) {
    throw lookupErr;
  }

  const existing = lookup?.users?.find((x) => x.email === u.email);
  if (existing) {
    return {
      ...u,
      id: existing.id,
    };
  }

  const { data, error } = await serviceClient.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });

  if (error) throw error;

  return {
    ...u,
    id: data.user?.id,
  };
}

// Devuelve un SupabaseClient autenticado como el usuario de prueba
async function asUser(u: TestUser): Promise<SupabaseClient> {
  // Login usando anonKey
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: u.email,
    password: u.password,
  });

  assert(!error, `No se pudo hacer login para ${u.email}: ${error?.message}`);
  assert(data.session, `No se obtuvo session para ${u.email}`);

  return client;
}

async function main() {
  console.log("== RLS MULTI-ORG TEST SUITE ==");

  // 1) Crear / asegurar usuarios
  const owner = await ensureUser(OWNER);
  const admin = await ensureUser(ADMIN);
  const tracker = await ensureUser(TRACKER);
  const outsider = await ensureUser(OUTSIDER);

  assert(owner.id, "Owner sin id");
  assert(admin.id, "Admin sin id");
  assert(tracker.id, "Tracker sin id");
  assert(outsider.id, "Outsider sin id");

  console.log("Usuarios de prueba asegurados ✅");

  // 2) Crear organización de prueba (o reutilizar si ya existe)
  let orgId: string | null = null;

  // Buscar si ya existe
  {
    const { data, error } = await serviceClient
      .from("organizations")
      .select("id")
      .eq("name", TEST_ORG_NAME)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    orgId = data?.id ?? null;
  }

  if (!orgId) {
    const { data, error } = await serviceClient
      .from("organizations")
      .insert({
        name: TEST_ORG_NAME,
        owner_id: owner.id,
        created_by: owner.id,
        active: true,
      })
      .select("id")
      .maybeSingle();

    assert(!error, "No se pudo crear organización de prueba: " + error?.message);
    assert(data?.id, "Organización de prueba sin id");
    orgId = data.id;
    console.log("Organización de prueba creada:", orgId);
  } else {
    console.log("Organización de prueba ya existe:", orgId);
  }

  // 3) Asegurar memberships
  assert(orgId, "orgId nulo");

  const upsertMembership = async (userId: string, role: string, is_default: boolean) => {
    const { error } = await serviceClient
      .from("memberships")
      .upsert({
        org_id: orgId,
        user_id: userId,
        role,
        is_default,
      })
      .eq("org_id", orgId)
      .eq("user_id", userId);

    assert(!error, `No se pudo upsert membership ${role} para ${userId}: ${error?.message}`);
  };

  await upsertMembership(owner.id!, "admin", true);
  await upsertMembership(admin.id!, "admin", false);
  await upsertMembership(tracker.id!, "tracker", false);

  console.log("Memberships aseguradas ✅");

  // 4) Crear clientes por rol
  const ownerClient = await asUser(owner);
  const adminClient = await asUser(admin);
  const trackerClient = await asUser(tracker);
  const outsiderClient = await asUser(outsider);

  // Helper: inserción de personal
  async function tryInsertPersonal(client: SupabaseClient, label: string): Promise<boolean> {
    const { data, error } = await client
      .from("personal")
      .insert({
        nombre: `Test RLS ${label}`,
        email: `${label.toLowerCase()}@rls.test`,
        telefono: "+593000000000",
        vigente: true,
        org_id: orgId,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.log(`(${label}) INSERT personal → BLOQUEADO (OK si esperado)`, error.message);
      return false;
    }
    console.log(`(${label}) INSERT personal → PERMITIDO id=${data?.id}`);
    return true;
  }

  // Helper: ver si ve la org
  async function canSeeOrg(client: SupabaseClient, label: string): Promise<boolean> {
    const { data, error } = await client
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .maybeSingle();

    if (error) {
      console.log(`(${label}) SELECT org → error (OK si outsider):`, error.message);
      return false;
    }
    if (!data) {
      console.log(`(${label}) SELECT org → sin filas`);
      return false;
    }
    console.log(`(${label}) SELECT org → OK`, data);
    return true;
  }

  // ---------------- TESTS ----------------

  console.log("\n=== TESTS OWNER ===");
  assert(await canSeeOrg(ownerClient, "OWNER"), "Owner no puede ver su organización");
  assert(
    await tryInsertPersonal(ownerClient, "OWNER"),
    "Owner no pudo insertar en personal (debe poder)"
  );

  console.log("\n=== TESTS ADMIN ===");
  assert(await canSeeOrg(adminClient, "ADMIN"), "Admin no puede ver la organización");
  assert(
    await tryInsertPersonal(adminClient, "ADMIN"),
    "Admin no pudo insertar en personal (debe poder)"
  );

  console.log("\n=== TESTS TRACKER ===");
  assert(await canSeeOrg(trackerClient, "TRACKER"), "Tracker no puede ver la organización");
  const trackerInsert = await tryInsertPersonal(trackerClient, "TRACKER");
  assert(!trackerInsert, "Tracker pudo insertar en personal (NO debería poder)");

  console.log("\n=== TESTS OUTSIDER ===");
  const outsiderSeesOrg = await canSeeOrg(outsiderClient, "OUTSIDER");
  assert(!outsiderSeesOrg, "Outsider puede ver la organización (NO debería)");
  const outsiderInsert = await tryInsertPersonal(outsiderClient, "OUTSIDER");
  assert(!outsiderInsert, "Outsider pudo insertar en personal (NO debería)");

  console.log("\nALL RLS MULTI-ORG TESTS PASSED ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error inesperado en test:", err);
  process.exit(1);
});
