// App.tsx
import React, { useCallback, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Button, ActivityIndicator } from "react-native";
import { supabase } from "./src/lib/supabase";

export default function App() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  const testSupabase = useCallback(async () => {
    try {
      setStatus("loading");
      setMessage("");

      // Prueba simple: consulta una tabla que exista (tenants, personal, etc.)
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .limit(1);

      if (error) {
        console.error("[App] Error Supabase:", error);
        setStatus("error");
        setMessage(error.message || "Error consultando Supabase");
        return;
      }

      setStatus("ok");
      if (data && data.length > 0) {
        setMessage(`Conexión OK. Ejemplo: ${data[0].name ?? data[0].id}`);
      } else {
        setMessage("Conexión OK, pero la tabla está vacía o sin registros.");
      }
    } catch (e: any) {
      console.error("[App] Excepción:", e);
      setStatus("error");
      setMessage(e?.message ?? "Error desconocido");
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>App Geocercas – Tracker Mobile</Text>
        <Text style={styles.subtitle}>
          Paso 1: Probar conexión con Supabase desde Expo.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Prueba rápida</Text>
          <Text style={styles.cardText}>
            Pulsa el botón para hacer una consulta simple a Supabase usando el
            mismo backend de tu app web.
          </Text>

          <View style={styles.buttonContainer}>
            <Button title="Probar Supabase" onPress={testSupabase} />
          </View>

          <View style={styles.statusContainer}>
            {status === "loading" && (
              <>
                <ActivityIndicator size="small" />
                <Text style={styles.statusText}>Consultando Supabase...</Text>
              </>
            )}
            {status === "ok" && (
              <Text style={[styles.statusText, styles.statusOk]}>
                ✅ {message}
              </Text>
            )}
            {status === "error" && (
              <Text style={[styles.statusText, styles.statusError]}>
                ❌ {message}
              </Text>
            )}
            {status === "idle" && (
              <Text style={styles.statusText}>
                Aún no se ha realizado ninguna prueba.
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.footer}>
          Cuando esta prueba funcione, pasamos al Paso 2: login/Magic Link y
          luego GPS.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "stretch",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#6b7280",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
    color: "#111827",
  },
  cardText: {
    fontSize: 14,
    color: "#4b5563",
  },
  buttonContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  statusContainer: {
    marginTop: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  statusText: {
    fontSize: 13,
    color: "#6b7280",
  },
  statusOk: {
    color: "#059669",
  },
  statusError: {
    color: "#dc2626",
  },
  footer: {
    fontSize: 12,
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 8,
  },
});
