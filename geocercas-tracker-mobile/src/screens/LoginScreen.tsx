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
import { supabase } from "../lib/supabase";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  // 🚀 REDIRECT CORRECTO PARA APP NATIVA
  const redirectTo = "geocercas://tracker";

  const handleMagicLink = async () => {
    if (!email.includes("@")) {
      Alert.alert("Correo inválido", "Ingresa un correo válido.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);

    if (error) {
      Alert.alert("Error enviando Magic Link", error.message);
      return;
    }

    Alert.alert(
      "Revisa tu correo",
      "Te enviamos un Magic Link. Ábrelo en este mismo celular."
    );
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

      <Button
        title={loading ? "Enviando..." : "Enviar Magic Link"}
        onPress={handleMagicLink}
        disabled={loading}
      />

      <View style={{ height: 20 }} />

      <Button
        title="Continuar sin login (modo prueba)"
        onPress={() => navigation.navigate("Tracker")}
        color="gray"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
});
