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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [searching, setSearching] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  /**
   * Botón "Conectar" de cada dispositivo.
   * 1) Verifica que el otro lado responda el protocolo LocalSend real.
   * 2) Pide el archivo a mandar.
   * 3) Ejecuta el handshake (prepare-upload) + subida (upload).
   */
  async function handleConnectPress(device: DiscoveredDevice) {
    if (connectingId) return; // evita doble tap mientras ya hay una conexión en curso

    setConnectingId(device.id);

    try {
      console.log("Conectando con:", device.name);

      // Log temporal para confirmar que la IP resuelta por Zeroconf
      // es la real de la PC (sacalo cuando confirmes que anda bien).
      console.log("IP resuelta:", device.address, ":", device.port);

      const picked = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (picked.canceled) {
        return;
      }

      const file = picked.assets[0];
      setSelectedFile(file.name);

      const result = await connectAndSendFile(
        device,
        getDeviceName(),
        {
          uri: file.uri,
          name: file.name,
          size: file.size ?? 0,
          mimeType: file.mimeType ?? "application/octet-stream",
        }
      );

      if (!result.ok) {
        console.error("No se pudo conectar/enviar:", result.message);
        Alert.alert("No se pudo conectar", result.message);
        return;
      }

      await showConnectionNotification(`Archivo enviado a ${device.name}`);
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

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        setSelectedFile(result.assets[0].name);
      }
    } catch (error) {
      console.error("Error seleccionando archivo:", error);
    }
  }

  useEffect(() => {
    initializeNotifications();

    /*
     * Servidor HTTP del celular.
     */
    startLocalServer();

    /*
     * Cuando OTRO dispositivo intenta conectarse con este celular.
     */
    setConnectionHandler(async (deviceName) => {
      console.log("Conexión recibida desde:", deviceName);
      await showConnectionNotification(deviceName);
    });

    /*
     * Publicamos el dispositivo.
     */
    startPublishing();

    /*
     * Buscamos otros dispositivos.
     */
    const cleanup = startDiscovery(
      (device) => {
        // Defensa extra: si por algún motivo el filtro de
        // discoveryService no lo agarró, lo descartamos acá también.
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
    /*
     * Limpiamos la lista Y forzamos un nuevo ciclo de consultas mDNS,
     * en vez de esperar al backoff natural del protocolo.
     */
    setDevices([]);
    setSearching(true);
    rescan();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LocalSend Clone</Text>

      <Pressable style={styles.button} onPress={handlePickFile}>
        <Text style={styles.buttonText}>Elegir archivo</Text>
      </Pressable>

      {selectedFile && (
        <Text style={styles.fileText}>
          Archivo seleccionado: {selectedFile}
        </Text>
      )}

      <Pressable style={styles.button} onPress={searchDevices}>
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

            <Text style={styles.deviceInfo}>{item.platform}</Text>

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
                <Text style={styles.connectButtonText}>Conectar</Text>
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
    marginBottom: 30,
  },

  button: {
    backgroundColor: "#2563EB",
    padding: 16,
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
    color: "white",
    marginBottom: 20,
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