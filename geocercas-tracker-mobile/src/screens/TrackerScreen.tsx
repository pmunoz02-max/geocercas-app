// src/screens/TrackerScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Location from "expo-location";
import type { LocationSubscription, LocationObject } from "expo-location";
import { supabase } from "../lib/supabase";

type SendStatus = "idle" | "sending" | "ok" | "error";

const TrackerScreen: React.FC = () => {
  console.log("[TrackerNative] TrackerScreen MONTADO");

  const [hasForegroundPermission, setHasForegroundPermission] = useState<boolean | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastPosition, setLastPosition] = useState<LocationObject | null>(null);
  const [lastSendAt, setLastSendAt] = useState<Date | null>(null);
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const watchRef = useRef<LocationSubscription | null>(null);

  // ------------------ PERMISOS ------------------
  useEffect(() => {
    (async () => {
      console.log("[TrackerNative] Pidiendo permisos de ubicación...");
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasForegroundPermission(status === "granted");
      if (status !== "granted") {
        setErrorMsg("Permiso de ubicación en primer plano denegado.");
      }
      console.log("[TrackerNative] Permiso foreground:", status);
    })();

    return () => {
      if (watchRef.current) {
        console.log("[TrackerNative] limpiando watchPositionAsync");
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, []);

  // ------------------ OBTENER TOKEN ------------------
  const getAuthToken = async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.auth.getSession();

      console.log(
        "[TrackerNative] SESSION TEST:",
        JSON.stringify({ data, error }, null, 2)
      );

      if (error) {
        console.log("[TrackerNative] getSession error:", error);
        setErrorMsg("Error obteniendo sesión de Supabase.");
        return null;
      }

      const token = data.session?.access_token ?? null;
      if (!token) {
        console.log("[TrackerNative] SIN access_token en sesión");
        setErrorMsg("Usuario no autenticado. Vuelve a iniciar sesión en la app.");
        return null;
      }

      return token;
    } catch (e) {
      console.log("[TrackerNative] Excepción en getAuthToken:", e);
      setErrorMsg("Error inesperado leyendo la sesión.");
      return null;
    }
  };

  // ------------------ ENVIAR POSICIÓN ------------------
  const sendPositionToSupabase = async (
    location: LocationObject,
    token: string
  ) => {
    try {
      setSendStatus("sending");
      setErrorMsg(null);

      const { latitude, longitude, accuracy } = location.coords;

      console.log("[TrackerNative] Enviando posición a Supabase:", {
        latitude,
        longitude,
        accuracy,
      });

      const { data, error } = await supabase.functions.invoke("send_position", {
        body: {
          lat: latitude,
          lng: longitude,
          accuracy,
          source: "tracker-native-v2",
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) {
        console.log(
          "[TrackerNative] Error Supabase send_position:",
          JSON.stringify(error, null, 2)
        );
        setSendStatus("error");

        let msg = error.message ?? "Error al enviar posición a Supabase.";
        const anyErr: any = error;
        if (anyErr?.context?.response?.error) {
          msg = String(anyErr.context.response.error);
        }
        setErrorMsg(msg);
        return;
      }

      console.log("[TrackerNative] Respuesta send_position OK:", data);
      setSendStatus("ok");
      setLastSendAt(new Date());
    } catch (e: any) {
      console.log("[TrackerNative] Excepción al enviar posición:", e);
      setSendStatus("error");
      setErrorMsg(e?.message ?? "Error inesperado al enviar posición.");
    }
  };

  // ------------------ INICIAR TRACKING ------------------
  const startForegroundTracking = async () => {
    console.log("[TrackerNative] BOTÓN TRACKER ACTIVO PRESIONADO");

    const token = await getAuthToken();
    if (!token) {
      console.log("[TrackerNative] No se inicia tracking porque no hay token");
      return;
    }

    if (hasForegroundPermission === false) {
      setErrorMsg("No tienes permiso de ubicación en primer plano.");
      return;
    }

    if (watchRef.current) {
      console.log("[TrackerNative] Tracking ya estaba activo");
      return;
    }

    try {
      setErrorMsg(null);
      console.log("[TrackerNative] Iniciando watchPositionAsync...");

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000, // cada 15s
          distanceInterval: 5, // cada 5m
        },
        async (location) => {
          console.log(
            "[TrackerNative] Nuevo fix recibido:",
            location.coords.latitude,
            location.coords.longitude,
            "acc:",
            location.coords.accuracy
          );
          setLastPosition(location);
          await sendPositionToSupabase(location, token);
        }
      );

      watchRef.current = sub;
      setIsTracking(true);
      console.log("[TrackerNative] Tracking EN PRIMER PLANO ACTIVADO");
    } catch (e: any) {
      console.log("[TrackerNative] Error iniciando watchPositionAsync:", e);
      setErrorMsg(e?.message ?? "No se pudo iniciar el tracking.");
      setIsTracking(false);
    }
  };

  // ------------------ DETENER TRACKING ------------------
  const stopForegroundTracking = () => {
    console.log("[TrackerNative] BOTÓN DETENER TRACKER PRESIONADO");
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
      console.log("[TrackerNative] Tracking detenido");
    }
    setIsTracking(false);
    setSendStatus("idle");
  };

  // ------------------ HELPERS UI ------------------
  const formatCoord = (val: number | null | undefined) =>
    typeof val === "number" ? val.toFixed(6) : "--";

  const formatAccuracy = (val: number | null | undefined) =>
    typeof val === "number" ? `${val.toFixed(1)} m` : "--";

  const formatTime = (d: Date | null) =>
    d ? d.toLocaleTimeString() : "--";

  const lat = lastPosition?.coords.latitude ?? null;
  const lng = lastPosition?.coords.longitude ?? null;
  const acc = lastPosition?.coords.accuracy ?? null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.headerTitle}>Tracker NATIVO v2 (prueba)</Text>
        <Text style={styles.headerSubtitle}>
          Al iniciar el tracker, la app enviará tu posición a Supabase en primer plano y, si los
          permisos lo permiten, también en segundo plano.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Lat: {formatCoord(lat)}</Text>
          <Text style={styles.infoText}>Lng: {formatCoord(lng)}</Text>
          <Text style={styles.infoText}>Precisión: {formatAccuracy(acc)}</Text>
          <Text style={styles.infoText}>
            Último fix: {lastPosition ? formatTime(new Date(lastPosition.timestamp)) : "--"}
          </Text>
          <Text style={styles.infoText}>
            Último envío Supabase: {formatTime(lastSendAt)}
          </Text>
        </View>

        <Text style={styles.permissionText}>
          Permiso de ubicación en primer plano:{" "}
          {hasForegroundPermission === null
            ? "verificando..."
            : hasForegroundPermission
            ? "CONCEDIDO"
            : "DENEGADO"}
        </Text>

        <Text style={styles.statusText}>
          Tracking en primer plano: {isTracking ? "ACTIVADO" : "DETENIDO"}
        </Text>

        <Text style={styles.statusText}>
          Estado envío Supabase:{" "}
          {sendStatus === "idle"
            ? "inactivo"
            : sendStatus === "sending"
            ? "enviando..."
            : sendStatus === "ok"
            ? "último envío OK"
            : "error"}
        </Text>

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={startForegroundTracking}
          >
            <Text style={styles.buttonText}>TRACKER ACTIVO</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={stopForegroundTracking}
          >
            <Text style={styles.buttonText}>DETENER TRACKER</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity style={[styles.button, styles.buttonGhost]} disabled>
            <Text style={styles.buttonText}>BG TRACKER ACTIVO (próximo paso)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.buttonGhost]} disabled>
            <Text style={styles.buttonText}>DETENER TRACKING SEGUNDO PLANO</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          Nota: Este tracker nativo usa la Edge Function `send_position` y marca el campo
          "source" como "tracker-native-v2" para diferenciarlo del tracker web.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f9fafb",
    marginBottom: 4,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 12,
  },
  infoBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    padding: 10,
    backgroundColor: "#020617",
    marginBottom: 12,
  },
  infoText: {
    color: "#e5e7eb",
    fontSize: 13,
  },
  permissionText: {
    color: "#a7f3d0",
    fontSize: 12,
    marginBottom: 4,
  },
  statusText: {
    color: "#d1d5db",
    fontSize: 12,
  },
  errorText: {
    color: "#fecaca",
    fontSize: 12,
    marginTop: 6,
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: "#22c55e",
  },
  buttonSecondary: {
    backgroundColor: "#ef4444",
  },
  buttonGhost: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#f9fafb",
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },
  footerNote: {
    marginTop: 16,
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
  },
});

export default TrackerScreen;
