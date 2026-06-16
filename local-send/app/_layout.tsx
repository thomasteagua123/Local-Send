import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Inicio" }} />
      <Stack.Screen name="send" options={{ title: "Enviar" }} />
      <Stack.Screen name="receive" options={{ title: "Recibir" }} />
      <Stack.Screen name="history" options={{ title: "Historial" }} />
    </Stack>
  );
}