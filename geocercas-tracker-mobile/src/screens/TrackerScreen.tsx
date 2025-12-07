// src/screens/TrackerScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Button, Alert, Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { sendPosition } from "../lib/sendPosition";

const LOCATION_TASK_NAME = "background-location-task-v2";

type LastLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

// =====================
// TAREA DE BACKGROUND
// =====================

if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("[LOCATION_TASK] Error en tarea de background:", error);
      return;
    }

    const { locations } = (data || {}) as {
      locations?: Location.LocationObject[];
    };

    if (!locations || !locations.length) return;

    for (const loc of locations) {
      const {
        coords: { latitude, longitude, accuracy },
        timestamp,
      } = loc;

      console.log("📡 [BG] Posición recibida:", {
        latitude,
        longitude,
        accuracy,
        timestamp,
      });

      // Envío a Supabase mediante Edge Function
      await sendPosition({
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? null,
        timestamp: timestamp ?? Date.now(),
        source: "mobile-native-bg-v2",
      });
    }
  });
}

// =====================
// COMPONENTE PRINCIPAL
// =====================

export default function TrackerScreen() {
  const [tracking, setTracking] = useState(false);
  const [backgroundActive, setBackgroundActive] = useState(false);

  const [fgPermission, setFgPermission] =
    useState<Location.PermissionStatus | null>(null);
  const [bgPermission, setBgPermission] =
    useState<Location.PermissionStatus | null>(null);

  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // watcher de primer plano
  const foregroundSub = useRef<Location.LocationSubscription | null>(null);

  // =====================
  // Efecto inicial
  // =====================

  useEffect(() => {
    (async () => {
      // 1) Permiso foreground
      const fg = await Location.requestForegroundPermissionsAsync();
      setFgPermission(fg.status);

      if (fg.status !== "granted") {
        setErrorMsg(
          "No se concedió permiso de ubicación en primer plano. Actívalo en los ajustes del sistema."
        );
      }

      // 2) Estado permisos background (sin pedir aún)
      const bg = await Location.getBackgroundPermissionsAsync();
      setBgPermission(bg.status);

      // 3) Ver si ya hay tarea corriendo (tras reinicio / recarga)
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );
      setBackgroundActive(hasStarted);
      if (hasStarted) {
        setTracking(true);
      }
    })();

    return () => {
      if (foregroundSub.current) {
        foregroundSub.current.remove();
        foregroundSub.current = null;
      }
    };
  }, []);

  // =====================
  // Helpers
  // =====================

  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString();
  };

  const startForegroundWatcher = useCallback(async () => {
    if (foregroundSub.current) {
      foregroundSub.current.remove();
      foregroundSub.current = null;
    }

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // aprox cada 5 s
        distanceInterval: 5, // o cada ~5 m
      },
      async (location) => {
        const {
          coords: { latitude, longitude, accuracy },
          timestamp,
        } = location;

        const ts = timestamp ?? Date.now();

        setLastLocation({
          latitude,
          longitude,
          accuracy: accuracy ?? null,
          timestamp: ts,
        });

        console.log("📍 [FG] Nueva posición:", {
          latitude,
          longitude,
          accuracy,
          timestamp: ts,
        });

        // Envío foreground
        await sendPosition({
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
          timestamp: ts,
          source: "mobile-native-fg-v2",
        });
      }
    );

    foregroundSub.current = sub;
  }, []);

  // =====================
  // Handlers de botones
  // =====================

  const startTracking = useCallback(async () => {
    setErrorMsg(null);

    // 1) Asegurar permiso foreground
    let currentFg = fgPermission;
    if (currentFg !== "granted") {
      const { status } = await Location.requestForegroundPermissionsAsync();
      currentFg = status;
      setFgPermission(status);
    }

    if (currentFg !== "granted") {
      Alert.alert(
        "Permiso requerido",
        "Debes conceder permiso de ubicación en primer plano para iniciar el tracker."
      );
      return;
    }

    try {
      // 2) Iniciar watcher foreground
      await startForegroundWatcher();
      setTracking(true);

      // 3) Pedir permiso background (solo Android / iOS físico)
      if (Platform.OS === "android" || Platform.OS === "ios") {
        const bgReq = await Location.requestBackgroundPermissionsAsync();
        setBgPermission(bgReq.status);

        if (bgReq.status === "granted") {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.High,
            timeInterval: 15000, // 15 s en background (ajustable)
            distanceInterval: 10, // 10 m en background
            pausesUpdatesAutomatically: true,
            showsBackgroundLocationIndicator: true,
          });
          setBackgroundActive(true);
        } else {
          setBackgroundActive(false);
        }
      }
    } catch (error: any) {
      console.error("Error iniciando tracking:", error);
      setErrorMsg(error?.message ?? "Error iniciando el tracker.");
    }
  }, [fgPermission, startForegroundWatcher]);

  const stopTracking = useCallback(async () => {
    try {
      if (foregroundSub.current) {
        foregroundSub.current.remove();
        foregroundSub.current = null;
      }

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      setTracking(false);
      setBackgroundActive(false);
    } catch (error: any) {
      console.error("Error deteniendo tracking:", error);
      setErrorMsg(error?.message ?? "Error deteniendo el tracker.");
    }
  }, []);

  // =====================
  // Render
  // =====================

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Tracker NATIVO v2 (prueba)</Text>

        <Text style={styles.description}>
          Al iniciar el tracker, la app enviará tu posición a Supabase en primer
          plano y, si los permisos lo permiten, también en segundo plano
          (pantalla apagada o app minimizada).
        </Text>

        <View style={styles.box}>
          <Text style={styles.boxLine}>
            Lat:{" "}
            <Text style={styles.boxValue}>
              {lastLocation ? lastLocation.latitude.toFixed(6) : "-"}
            </Text>
          </Text>
          <Text style={styles.boxLine}>
            Lng:{" "}
            <Text style={styles.boxValue}>
              {lastLocation ? lastLocation.longitude.toFixed(6) : "-"}
            </Text>
          </Text>
          <Text style={styles.boxLine}>
            Precisión:{" "}
            <Text style={styles.boxValue}>
              {lastLocation && lastLocation.accuracy != null
                ? `${lastLocation.accuracy.toFixed(1)} m`
                : "-"}
            </Text>
          </Text>
          <Text style={styles.boxLine}>
            Último fix:{" "}
            <Text style={styles.boxValue}>
              {lastLocation ? formatTime(lastLocation.timestamp) : "-"}
            </Text>
          </Text>
        </View>

        {/* Estado permisos */}
        {errorMsg ? (
          <Text style={styles.error}>⚠ {errorMsg}</Text>
        ) : fgPermission === "granted" ? (
          <Text style={styles.statusOk}>
            Permiso de ubicación en primer plano concedido.
          </Text>
        ) : (
          <Text style={styles.statusWarn}>
            Aún no se ha concedido el permiso de ubicación en primer plano.
          </Text>
        )}

        {/* Estado background */}
        <Text
          style={
            backgroundActive ? styles.statusBgActive : styles.statusBgInactive
          }
        >
          {backgroundActive
            ? "Tracking en segundo plano: ACTIVADO."
            : "Tracking en segundo plano: no activo (sin permiso o no iniciado)."}
        </Text>

        <View style={styles.buttonsRow}>
          <Button
            title={tracking ? "TRACKER ACTIVO" : "INICIAR TRACKER"}
            onPress={startTracking}
            disabled={tracking}
          />
        </View>

        <View style={styles.buttonsRow}>
          <Button
            title="DETENER TRACKER"
            onPress={stopTracking}
            disabled={!tracking}
            color="#6b7280"
          />
        </View>

        <Text style={styles.footer}>
          Con este modo, el tracker está listo para uso en campo: primer plano +
          segundo plano, enviando posiciones a Supabase de forma continua (según
          cobertura y batería).
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    backgroundColor: "#0f172a",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#020617",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#f9fafb",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 16,
    textAlign: "center",
  },
  box: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 16,
    backgroundColor: "#020617",
    marginBottom: 16,
  },
  boxLine: {
    fontFamily: "monospace",
    color: "#9ca3af",
    marginBottom: 4,
  },
  boxValue: {
    color: "#e5e7eb",
  },
  error: {
    color: "#f97316",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  statusOk: {
    color: "#22c55e",
    fontSize: 13,
    marginBottom: 4,
    textAlign: "center",
  },
  statusWarn: {
    color: "#e5e7eb",
    fontSize: 13,
    marginBottom: 4,
    textAlign: "center",
  },
  statusBgActive: {
    color: "#22c55e",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  statusBgInactive: {
    color: "#e5e7eb",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  buttonsRow: {
    marginTop: 8,
    marginBottom: 4,
  },
  footer: {
    marginTop: 16,
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
  },
});

