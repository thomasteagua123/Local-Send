import { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import * as DocumentPicker from "expo-document-picker";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  showConnectionNotification,
  initializeNotifications,
} from "../service/notificationService";

import {
  startLocalServer,
  stopLocalServer,
  setConnectionHandler,
} from "../service/serverService";
import {
  startDiscovery,
  startPublishing,
  getDeviceId,
  getDeviceName,
  rescan,
} from "../service/discoveryService";

import type { DiscoveredDevice } from "../service/discoveryService";

import { connectAndSendFile } from "../service/localSendClient";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function HomeScreen() {
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    size: number;
    mimeType: string;
  } | null>(null);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [searching, setSearching] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  /**
   * Permite seleccionar previamente un archivo desde el sistema de archivos del celular.
   */
  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile({
          uri: file.uri,
          name: file.name,
          size: file.size ?? 0,
          mimeType: file.mimeType ?? "application/octet-stream",
        });
      }
    } catch (error) {
      console.error("Error seleccionando archivo:", error);
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  }

  /**
   * Botón "Conectar" de cada dispositivo.
   * Si ya hay un archivo seleccionado, envía ese. Sino, abre el selector de archivos.
   */
  async function handleConnectPress(device: DiscoveredDevice) {
    if (connectingId) return;

    setConnectingId(device.id);

    try {
      console.log("Conectando con:", device.name);
      console.log("IP resuelta:", device.address, ":", device.port);

      let fileToUpload = selectedFile;

      // Si no seleccionó un archivo previamente, abrimos el selector en el momento
      if (!fileToUpload) {
        const picked = await DocumentPicker.getDocumentAsync({
          multiple: false,
          copyToCacheDirectory: true,
        });

        if (picked.canceled || picked.assets.length === 0) {
          setConnectingId(null);
          return;
        }

        const pickedFile = picked.assets[0];
        fileToUpload = {
          uri: pickedFile.uri,
          name: pickedFile.name,
          size: pickedFile.size ?? 0,
          mimeType: pickedFile.mimeType ?? "application/octet-stream",
        };

        setSelectedFile(fileToUpload);
      }

      // Proceso de conexión y transferencia
      const result = await connectAndSendFile(
        device,
        getDeviceName(),
        fileToUpload
      );

      if (!result.ok) {
        console.error("No se pudo conectar/enviar:", result.message);
        Alert.alert("No se pudo conectar", result.message);
        return;
      }

      await showConnectionNotification(`Archivo enviado a ${device.name}`);
      Alert.alert("Éxito", `Archivo "${fileToUpload.name}" enviado a ${device.name}`);
    } catch (error) {
      console.error("Error conectando:", error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Error desconocido."
      );
    } finally {
      setConnectingId(null);
    }
  }

  useEffect(() => {
    initializeNotifications();

    /*
     * Servidor HTTP local del celular.
     */
    startLocalServer();

    /*
     * Handler de conexiones entrantes desde otros dispositivos.
     */
    setConnectionHandler(async (deviceName) => {
      console.log("Conexión recibida desde:", deviceName);
      await showConnectionNotification(deviceName);
    });

    /*
     * Publicación en mDNS / Zeroconf.
     */
    startPublishing();

    /*
     * Descubrimiento de dispositivos remotos.
     */
    const cleanup = startDiscovery(
      (device) => {
        if (device.id === getDeviceId()) {
          return;
        }

        console.log("Dispositivo encontrado:", device);

        setDevices((current) => {
          const exists = current.some((item) => item.id === device.id);

          if (exists) {
            return current.map((item) =>
              item.id === device.id ? device : item
            );
          }

          return [...current, device];
        });

        setSearching(false);
      },
      (id) => {
        setDevices((current) => current.filter((device) => device.id !== id));
      }
    );

    return () => {
      cleanup();
      stopLocalServer();
    };
  }, []);

  function searchDevices() {
    setDevices([]);
    setSearching(true);
    rescan();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LocalSend Clone</Text>

      <Pressable style={styles.button} onPress={handlePickFile}>
        <Text style={styles.buttonText}>
          {selectedFile ? "Cambiar archivo" : "Elegir archivo"}
        </Text>
      </Pressable>

      {selectedFile && (
        <Text style={styles.fileText}>
          Archivo seleccionado: {selectedFile.name} (
          {(selectedFile.size / 1024).toFixed(1)} KB)
        </Text>
      )}

      <Pressable style={styles.buttonSecondary} onPress={searchDevices}>
        <Text style={styles.buttonText}>
          {searching ? "Buscando dispositivos..." : "Buscar dispositivos"}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Dispositivos cercanos</Text>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          devices.length === 0 ? styles.emptyContainer : undefined
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No se encontraron dispositivos.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.deviceCard}>
            <Text style={styles.deviceName}>
              {item.platform === "windows" ? "💻" : "📱"} {item.name}
            </Text>

            <Text style={styles.deviceInfo}>
              {item.address}:{item.port}
            </Text>

            <Text style={styles.deviceInfo}>Plataforma: {item.platform}</Text>

            <Pressable
              style={[
                styles.connectButton,
                connectingId === item.id && styles.connectButtonDisabled,
              ]}
              disabled={connectingId === item.id}
              onPress={() => handleConnectPress(item)}
            >
              {connectingId === item.id ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.connectButtonText}>Conectar y Enviar</Text>
              )}
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
    padding: 20,
    paddingTop: 60,
  },

  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "white",
    marginBottom: 20,
  },

  button: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },

  buttonSecondary: {
    backgroundColor: "#374151",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },

  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },

  fileText: {
    color: "#60A5FA",
    marginBottom: 16,
    fontWeight: "500",
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "white",
    marginTop: 10,
    marginBottom: 15,
  },

  deviceCard: {
    backgroundColor: "#1F2937",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },

  deviceName: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },

  deviceInfo: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 2,
  },

  connectButton: {
    backgroundColor: "#16A34A",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  connectButtonDisabled: {
    backgroundColor: "#166534",
  },

  connectButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 15,
  },

  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },

  empty: {
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 30,
  },
});