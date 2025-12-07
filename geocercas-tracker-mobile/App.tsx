// App.tsx
import React from "react";

// ⬅️ Registro del task de background (NECESARIO para PASO 6)
import "./src/tasks/location-task";

import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  return <AppNavigator />;
}
