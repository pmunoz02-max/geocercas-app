import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase env vars for tracker client");
}

export const supabaseTracker = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		storageKey: "geocercas-tracker-auth",
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: false,
	},
});

export default supabaseTracker;