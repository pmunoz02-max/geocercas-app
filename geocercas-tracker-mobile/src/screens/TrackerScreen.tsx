// src/screens/TrackerScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Button, Alert } from "react-native";
import * as Location from "expo-location";
import { sendPosition } from "../lib/sendPosition";
import { LOCATION_TASK } from "../tasks/location-task";

type LastLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

export default function TrackerScreen() {
  const [tracking, setTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<Location.PermissionStatus | null>(null);
  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backgroundActive, setBackgroundActive] = useState(false);

  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null
  );

  // ======================
  // Permisos iniciales
  // ======================
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);

      if (status !== "granted") {
        setErrorMsg(
          "No se concedió permiso de ubicación. Actívalo en los ajustes del sistema."
        );
      }
    })();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, []);

  // ======================
  // Helpers
  // ======================
  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString();
  };

  // ======================
  // Iniciar tracking
  // ======================
  const startTracking = useCallback(async () => {
    if (permissionStatus !== "granted") {
      Alert.alert(
        "Permiso requerido",
        "Debes conceder permiso de ubicación para iniciar el tracker."
      );
      return;
    }

    try {
      setErrorMsg(null);

      // Permiso de segundo plano
      const bgPerm = await Location.requestBackgroundPermissionsAsync();
      if (bgPerm.status !== "granted") {
        Alert.alert(
          "Permiso en segundo plano requerido",
          "Para que el tracker funcione con la pantalla apagada, concede permiso de ubicación en segundo plano en los ajustes del sistema."
        );
      }

      // Limpiar watcher previo
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      // Foreground watcher (esta parte YA funcionaba antes)
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000, // ~3s
          distanceInterval: 0, // cualquier cambio pequeño
        },
        async (location) => {
          const {
            coords: { latitude, longitude, accuracy },
            timestamp,
          } = location;

          const fix = {
            latitude,
            longitude,
            accuracy: accuracy ?? null,
            timestamp: timestamp ?? Date.now(),
          };

          setLastLocation(fix);

          console.log("📍 Foreground position:", fix);

          // Enviar a Supabase (usa el sendPosition nuevo)
          await sendPosition({
            lat: latitude,
            lng: longitude,
            accuracy: accuracy ?? null,
            timestamp: fix.timestamp,
            source: "mobile-native-fg-v2",
          });
        }
      );

      locationSubscription.current = subscription;

      // Background updates usando la tarea LOCATION_TASK
      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK
      );

      if (!alreadyStarted && bgPerm.status === "granted") {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000,
          distanceInterval: 5,
          pausesUpdatesAutomatically: false,
          foregroundService: {
            notificationTitle: "Tracker activo",
            notificationBody: "Enviando tu ubicación a tu organización.",
          },
        });
        setBackgroundActive(true);
      } else if (alreadyStarted) {
        setBackgroundActive(true);
      }

      setTracking(true);
    } catch (error: any) {
      console.error("Error iniciando tracking:", error);
      setErrorMsg(error?.message ?? "Error iniciando el tracker.");
    }
  }, [permissionStatus]);

  // ======================
  // Detener tracking
  // ======================
  const stopTracking = useCallback(async () => {
    try {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      const started = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK
      );
      if (started) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      }

      setBackgroundActive(false);
      setTracking(false);
    } catch (error: any) {
      console.error("Error deteniendo tracking:", error);
      setErrorMsg(error?.message ?? "Error deteniendo el tracker.");
    }
  }, []);

  // ======================
  // UI
  // ======================
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

        {errorMsg ? (
          <Text style={styles.error}>⚠ {errorMsg}</Text>
        ) : permissionStatus === "granted" ? (
          <Text style={styles.statusOk}>
            Permiso de ubicación en primer plano concedido.
          </Text>
        ) : (
          <Text style={styles.statusWarn}>
            Aún no se ha concedido el permiso de ubicación.
          </Text>
        )}

        {tracking && (
          <Text style={styles.statusInfo}>
            {backgroundActive
              ? "Tracking en segundo plano: ACTIVADO."
              : "Tracking solo en primer plano (sin permiso de background)."}
          </Text>
        )}

        <View className="mt-2 mb-1" style={styles.buttonsRow}>
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
  statusInfo: {
    color: "#38bdf8",
    fontSize: 12,
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

