// src/navigation/AppNavigator.tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import TrackerScreen from "../screens/TrackerScreen";
import LoginScreen from "../screens/LoginScreen";
import { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Tracker"  // 👈 SIEMPRE arrancamos en Tracker
        screenOptions={{
          headerShown: true,
        }}
      >
        <Stack.Screen
          name="Tracker"
          component={TrackerScreen}
          options={{ title: "Tracker NATIVO v2" }} // Título claro
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: "Iniciar sesión" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
