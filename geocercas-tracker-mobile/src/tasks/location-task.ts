// src/tasks/location-task.ts
import * as TaskManager from "expo-task-manager";
import { sendPosition } from "../lib/sendPosition";

export const LOCATION_TASK = "background-location-task";

type LocationObject = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
  timestamp: number;
};

type TaskData = {
  locations?: LocationObject[];
};

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("[LOCATION_TASK] error:", error);
    return;
  }

  const { locations } = (data || {}) as TaskData;
  if (!locations || locations.length === 0) return;

  const loc = locations[0];

  await sendPosition({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    timestamp: loc.timestamp,
  });
});
