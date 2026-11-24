import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import * as DocumentPicker from "expo-document-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";

import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
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
  setFileReceivedHandler,
  setReceiveProgressHandler,
} from "../service/serverService";
import {
  startDiscovery,
  startPublishing,
  getDeviceId,
  getDeviceName,
  rescan,
} from "../service/discoveryService";

import type { DiscoveredDevice } from "../service/discoveryService";
import {
  pingDevice,
  connectToDevice,
  sendFileToDevice,
} from "../service/localSendClient";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface TransferItem {
  id: string;
  fileName: string;
  direction: "sent" | "received";
  deviceName: string;
  timestamp: string;
  status: "completed" | "error";
}

const MEDIA_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
];

function isMediaFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return MEDIA_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function HomeScreen() {
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [searching, setSearching] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedDevice, setConnectedDevice] =
    useState<DiscoveredDevice | null>(null);

  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [transferLabel, setTransferLabel] = useState("");
  const [history, setHistory] = useState<TransferItem[]>([]);

  const connectedDeviceRef = useRef<DiscoveredDevice | null>(null);
  connectedDeviceRef.current = connectedDevice;

  // ANIMACIONES CONFIGURADAS CON useNativeDriver: false PARA EVITAR EL ERROR DE WIDTH
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 160,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false, // OBLIGATORIO en false para propiedades de layout como width
    }).start();
  }, [progress, animatedWidth]);

  useEffect(() => {
    if (!transferring) {
      pulseAnim.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true, // Opacity sí soporta native driver
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 550,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [transferring, pulseAnim]);

  function addHistoryItem(
    fileName: string,
    direction: "sent" | "received",
    deviceName: string,
    status: "completed" | "error" = "completed"
  ) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setHistory((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        fileName,
        direction,
        deviceName,
        timestamp,
        status,
      },
      ...prev.slice(0, 19),
    ]);
  }

  async function handleConnect(device: DiscoveredDevice) {
    if (connectingId || transferring) return;
    setConnectingId(device.id);

    try {
      const ping = await pingDevice(device);
      if (!ping.ok) {
        Alert.alert("No se pudo conectar", ping.message);
        return;
      }

      const result = await connectToDevice(device, getDeviceName());
      if (!result.ok) {
        Alert.alert("No se pudo conectar", result.message);
        return;
      }

      setConnectedDevice(device);
      await showConnectionNotification(device.name);
    } catch {
      Alert.alert("Error", "Error desconocido al conectar.");
    } finally {
      setConnectingId(null);
    }
  }

  function handleDisconnect() {
    if (transferring) return;
    setConnectedDevice(null);
  }

  async function handleSendFile() {
    if (!connectedDevice) {
      Alert.alert("Sin conexión", "Primero conectate a un dispositivo.");
      return;
    }
    if (transferring) return;

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (picked.canceled || picked.assets.length === 0) return;
      const file = picked.assets[0];

      setTransferring(true);
      setProgress(15);
      setTransferLabel(`Enviando "${file.name}"...`);

      const timer = setInterval(() => {
        setProgress((prev) => (prev < 88 ? prev + 9 : prev));
      }, 220);

      const result = await sendFileToDevice(connectedDevice, {
        uri: file.uri,
        name: file.name,
        size: file.size ?? 0,
        mimeType: file.mimeType ?? "application/octet-stream",
      });

      clearInterval(timer);

      if (!result.ok) {
        addHistoryItem(file.name, "sent", connectedDevice.name, "error");
        Alert.alert("No se pudo enviar", result.message);
        return;
      }

      setProgress(100);
      setLastFile(file.name);
      addHistoryItem(file.name, "sent", connectedDevice.name, "completed");

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "LocalSend",
          body: `${file.name} enviado a ${connectedDevice.name}`,
          sound: "default",
        },
        trigger: null,
      });
    } catch {
      Alert.alert("Error", "No se pudo enviar el archivo.");
    } finally {
      setTimeout(() => {
        setTransferring(false);
        setProgress(0);
        setTransferLabel("");
      }, 450);
    }
  }

  useEffect(() => {
    initializeNotifications();
    startLocalServer();

    setConnectionHandler(async (deviceName, accept, reject) => {
      Alert.alert(
        "Solicitud de Conexión",
        `¿Permites que "${deviceName}" se conecte?`,
        [
          { text: "Rechazar", onPress: () => reject(), style: "cancel" },
          {
            text: "Permitir",
            onPress: async () => {
              accept();
              await showConnectionNotification(deviceName);
              setDevices((currentList) => {
                const found = currentList.find((d) => d.name === deviceName);
                if (found) {
                  setConnectedDevice(found);
                } else {
                  setConnectedDevice({
                    id: deviceName,
                    name: deviceName,
                    address: "",
                    host: "",
                    port: 53317,
                    platform: "windows",
                  } as DiscoveredDevice);
                }
                return currentList;
              });
            },
          },
        ],
        { cancelable: false }
      );
    });

    setReceiveProgressHandler((fileName, percent) => {
      setTransferring(true);
      setTransferLabel(`Recibiendo "${fileName}"...`);
      setProgress(percent);
    });

    setFileReceivedHandler(async (fileName, tempPath) => {
      const senderName = connectedDeviceRef.current?.name || "PC";

      try {
        if (isMediaFile(fileName)) {
          const { status } = await MediaLibrary.requestPermissionsAsync();

          if (status !== "granted") {
            addHistoryItem(fileName, "received", senderName, "error");
            Alert.alert(
              "Permiso requerido",
              "Necesitamos acceso a la galería para guardar las imágenes recibidas."
            );
            return;
          }

          await MediaLibrary.saveToLibraryAsync(tempPath);
        } else {
          const docsDir = `${FileSystem.documentDirectory}LocalSend/`;
          const info = await FileSystem.getInfoAsync(docsDir);
          if (!info.exists) {
            await FileSystem.makeDirectoryAsync(docsDir, {
              intermediates: true,
            });
          }
          await FileSystem.copyAsync({
            from: tempPath,
            to: `${docsDir}${fileName}`,
          });
        }

        await FileSystem.deleteAsync(tempPath, { idempotent: true });

        setProgress(100);
        setLastFile(fileName);
        addHistoryItem(fileName, "received", senderName, "completed");

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "LocalSend",
            body: isMediaFile(fileName)
              ? `¡"${fileName}" guardado en tu Galería!`
              : `¡"${fileName}" recibido correctamente!`,
            sound: "default",
          },
          trigger: null,
        });
      } catch (e) {
        console.error("Error guardando archivo:", e);
        addHistoryItem(fileName, "received", senderName, "error");
        Alert.alert("Error", "No se pudo guardar el archivo recibido.");
      } finally {
        setTimeout(() => {
          setTransferring(false);
          setProgress(0);
          setTransferLabel("");
        }, 500);
      }
    });

    startPublishing();

    const cleanup = startDiscovery(
      (device) => {
        if (device.id === getDeviceId()) return;
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
        setConnectedDevice((current) =>
          current && (current.id === id || current.name === id) ? null : current
        );
      }
    );

    return () => {
      cleanup();
      setReceiveProgressHandler(null);
      stopLocalServer();
    };
  }, []);

  function searchDevices() {
    setDevices([]);
    setConnectedDevice(null);
    setSearching(true);
    rescan();
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={styles.title}>LocalSend Clone</Text>

      <Pressable
        style={[
          styles.button,
          (!connectedDevice || transferring) && styles.buttonDisabled,
        ]}
        onPress={handleSendFile}
        disabled={transferring}
      >
        {transferring ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Elegir archivo</Text>
        )}
      </Pressable>

      {connectedDevice ? (
        <View style={styles.connectedBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.connectedTitle}>
              ✓ Conectado con {connectedDevice.name}
            </Text>
            {lastFile && (
              <Text style={styles.connectedHint}>Último: {lastFile}</Text>
            )}
          </View>
          <Pressable
            style={styles.disconnectButton}
            onPress={handleDisconnect}
            disabled={transferring}
          >
            <Text style={styles.disconnectText}>Desconectar</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.fileText}>
          Conectate a un dispositivo para enviar archivos.
        </Text>
      )}

      {/* BARRA DE PROGRESO ANIMADA */}
      {transferring && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle} numberOfLines={1}>
              {transferLabel || "Transfiriendo archivo..."}
            </Text>
            <Text style={styles.progressPercent}>{progress}%</Text>
          </View>

          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  opacity: pulseAnim,
                  width: animatedWidth.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        </View>
      )}

      <Pressable style={styles.button} onPress={searchDevices}>
        <Text style={styles.buttonText}>
          {searching ? "Buscando dispositivos..." : "Buscar dispositivos"}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Dispositivos cercanos</Text>

      {devices.length === 0 ? (
        <Text style={styles.empty}>No se encontraron dispositivos.</Text>
      ) : (
        <FlatList
          data={devices}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isConnected = connectedDevice?.id === item.id;
            const isConnecting = connectingId === item.id;

            return (
              <View
                style={[
                  styles.deviceCard,
                  isConnected && styles.deviceCardConnected,
                ]}
              >
                <Text style={styles.deviceName}>
                  {item.platform === "windows" ? "💻" : "📱"} {item.name}
                </Text>
                <Text style={styles.deviceInfo}>
                  {item.address}:{item.port}
                </Text>

                {isConnected ? (
                  <View style={styles.connectedBadge}>
                    <Text style={styles.connectedBadgeText}>✓ Conectado</Text>
                  </View>
                ) : (
                  <Pressable
                    style={[
                      styles.connectButton,
                      isConnecting && styles.connectButtonDisabled,
                    ]}
                    disabled={isConnecting}
                    onPress={() => handleConnect(item)}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.connectButtonText}>Conectar</Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      {/* HISTORIAL DE ARCHIVOS */}
      {history.length > 0 && (
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Historial de transferencias</Text>
            <Pressable onPress={() => setHistory([])}>
              <Text style={styles.clearHistoryText}>Limpiar</Text>
            </Pressable>
          </View>

          {history.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <Text style={styles.historyIcon}>
                {item.direction === "sent" ? "📤" : "📥"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyFileName} numberOfLines={1}>
                  {item.fileName}
                </Text>
                <Text style={styles.historyMeta}>
                  {item.direction === "sent" ? "Enviado a" : "Recibido de"}{" "}
                  {item.deviceName} · {item.timestamp}
                </Text>
              </View>
              <Text
                style={[
                  styles.historyStatus,
                  item.status === "error" && { color: "#F87171" },
                ]}
              >
                {item.status === "completed" ? "✓" : "✕"}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111827" },
  contentContainer: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: "bold", color: "white", marginBottom: 24 },
  button: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  fileText: { color: "#9CA3AF", marginBottom: 20 },
  connectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#064E3B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  connectedTitle: { color: "white", fontWeight: "600", fontSize: 15 },
  connectedHint: { color: "#A7F3D0", fontSize: 13, marginTop: 2 },
  disconnectButton: {
    backgroundColor: "#065F46",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 10,
  },
  disconnectText: { color: "white", fontWeight: "600", fontSize: 13 },
  progressCard: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#374151",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressTitle: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  progressPercent: {
    color: "#60A5FA",
    fontSize: 14,
    fontWeight: "700",
  },
  progressTrack: {
    height: 10,
    backgroundColor: "#111827",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3B82F6",
    borderRadius: 999,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "white",
    marginTop: 10,
    marginBottom: 14,
  },
  empty: {
    color: "#9CA3AF",
    textAlign: "center",
    marginVertical: 20,
  },
  deviceCard: {
    backgroundColor: "#1F2937",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  deviceCardConnected: { borderColor: "#16A34A", borderWidth: 1 },
  deviceName: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  deviceInfo: { color: "#9CA3AF", fontSize: 14, marginTop: 2 },
  connectButton: {
    backgroundColor: "#16A34A",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    alignItems: "center",
  },
  connectButtonDisabled: { backgroundColor: "#166534" },
  connectButtonText: { color: "white", fontWeight: "600", fontSize: 15 },
  connectedBadge: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#064E3B",
  },
  connectedBadgeText: { color: "#A7F3D0", fontWeight: "600", fontSize: 15 },
  historySection: {
    marginTop: 16,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clearHistoryText: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2937",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    gap: 10,
  },
  historyIcon: {
    fontSize: 18,
  },
  historyFileName: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  historyMeta: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  historyStatus: {
    color: "#34D399",
    fontWeight: "700",
    fontSize: 15,
  },
});