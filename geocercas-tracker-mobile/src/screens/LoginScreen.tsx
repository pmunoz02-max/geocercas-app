// src/screens/LoginScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { supabaseMobile } from "../lib/supabaseMobile";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // para login con password
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  // Deep link para Magic Link (app móvil)
  const redirectTo = "geocercas://tracker";

  const handleMagicLink = async () => {
    if (!email.includes("@")) {
      Alert.alert("Correo inválido", "Ingresa un correo válido.");
      return;
    }

    setLoadingMagic(true);

    const { error } = await supabaseMobile.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    setLoadingMagic(false);

    if (error) {
      Alert.alert("Error enviando Magic Link", error.message);
      return;
    }

    Alert.alert(
      "Revisa tu correo",
      "Te enviamos un Magic Link. Ábrelo en este mismo celular y selecciona abrir con Expo Go."
    );
  };

  const handlePasswordLogin = async () => {
    if (!email.includes("@")) {
      Alert.alert("Correo inválido", "Ingresa un correo válido.");
      return;
    }

    if (!password) {
      Alert.alert("Contraseña requerida", "Ingresa una contraseña.");
      return;
    }

    setLoadingPassword(true);

    const { data, error } = await supabaseMobile.auth.signInWithPassword({
      email,
      password,
    });

    setLoadingPassword(false);

    if (error) {
      console.error("Login con password error:", error);
      Alert.alert("Error de login", error.message);
      return;
    }

    console.log("✅ Login con password OK. Usuario:", data.user);
    Alert.alert("Sesión iniciada", "Login exitoso, abriendo tracker nativo.");
    navigation.navigate("Tracker");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Iniciar sesión</Text>

      <TextInput
        style={styles.input}
        placeholder="correo@ejemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      {/* Campo de contraseña (para login con password) */}
      <TextInput
        style={styles.input}
        placeholder="Contraseña (solo pruebas)"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />

      <Button
        title={loadingMagic ? "Enviando Magic Link..." : "Enviar Magic Link"}
        onPress={handleMagicLink}
        disabled={loadingMagic || loadingPassword}
      />

      <View style={{ height: 12 }} />

      <Button
        title={loadingPassword ? "Iniciando sesión..." : "Login con password (debug)"}
        onPress={handlePasswordLogin}
        disabled={loadingMagic || loadingPassword}
        color="#16a34a"
      />

      <View style={{ height: 20 }} />

      <Button
        title="Continuar sin login (modo prueba)"
        onPress={() => navigation.navigate("Tracker")}
        color="gray"
      />

      <Text style={styles.hint}>
        • Magic Link usa geocercas://tracker como deep link hacia la app.{"\n"}
        • Login con password garantiza sesión activa dentro de Expo Go.{"\n"}
        • Modo prueba no envía posiciones a Supabase (solo muestra la UI).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  hint: {
    marginTop: 16,
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
});
