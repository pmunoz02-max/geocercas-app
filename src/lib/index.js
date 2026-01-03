// /src/lib/index.js
import { supabase } from "../supabaseClient.js";
export { supabase } from "./supabaseClient";
export { listPersonal, upsertPersonal, deletePersonal } from "./personalApi";
