// src/lib/supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wpaixkvokdkudymgjoua.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwYWl4a3Zva2RrdWR5bWdqb3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwODMyMzYsImV4cCI6MjA3NTY1OTIzNn0.kx3OyK2T1aXhaUFD798ekw_Il-QvdFgC1OqUBE5FGIY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    },
  },
});
