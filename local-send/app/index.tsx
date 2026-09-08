import { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import * as DocumentPicker from "expo-document-picker";

import {
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
} from "../service/discoveryService";

import type {
  DiscoveredDevice,
} from "../service/discoveryService";
Notifications.setNotificationHandler({
  handleNotification:
    async () => ({
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

  async function handleDevicePress(
  device: DiscoveredDevice
) {
  try {
    console.log(
      "Conectando con:",
      device.name
    );

    const response =
      await fetch(
        `http://${device.address}:${device.port}/api/connect`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            deviceName:
              "LocalSend Mobile",
          }),
        }
      );

    const data =
      await response.json();

    console.log(
      "Respuesta conexión:",
      data
    );

    if (!data.ok) {
      console.error(
        "No se pudo conectar"
      );

      return;
    }

    /*
     * Conexión exitosa.
     */
    await showConnectionNotification(
      device.name
    );

    /*
     * Ahora seleccionamos el archivo.
     */
    await sendFileToDevice(
      device
    );
  } catch (error) {
    console.error(
      "Error conectando:",
      error
    );
  }
}
  async function sendFileToDevice(
  device: DiscoveredDevice
) {
  try {
    const result =
      await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });

    if (result.canceled) {
      return;
    }

    const file = result.assets[0];

    console.log(
      "Archivo seleccionado:",
      file.name
    );

    const response =
      await fetch(
        `http://${device.address}:${device.port}/api/upload`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/octet-stream",

            "X-File-Name":
              encodeURIComponent(
                file.name
              ),

            "X-File-Size":
              String(file.size ?? 0),

            "X-File-Type":
              file.mimeType ??
              "application/octet-stream",
          },

          body: await (
            await fetch(file.uri)
          ).blob(),
        }
      );

    const data =
      await response.json();

    console.log(
      "Respuesta del servidor:",
      data
    );

    if (data.ok) {
      await showConnectionNotification(
        `Archivo enviado a ${device.name}`
      );
    }
  } catch (error) {
    console.error(
      "Error enviando archivo:",
      error
    );
  }
}
  async function connectToDevice(
  device: DiscoveredDevice
) {
  try {
    console.log(
      "Conectando con:",
      device.name
    );

    const response =
      await fetch(
        `http://${device.address}:${device.port}/api/connect`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            deviceName:
              "LocalSend Mobile",
          }),
        }
      );

    const data =
      await response.json();

    console.log(
      "Respuesta:",
      data
    );

    if (data.ok) {
      await showConnectionNotification(
        device.name
      );
    }
  } catch (error) {
    console.error(
      "Error conectando:",
      error
    );
  }
}

  async function handlePickFile() {
    try {
      const result =
        await DocumentPicker.getDocumentAsync({
          multiple: false,
        });

      if (!result.canceled && result.assets.length > 0) {
        setSelectedFile(result.assets[0].name);
      }
    } catch (error) {
      console.error(
        "Error seleccionando archivo:",
        error
      );
    }
  }

 useEffect(() => {
  initializeNotifications();

  /*
   * Servidor HTTP del celular.
   */
  startLocalServer();

  /*
   * Cuando OTRO dispositivo intenta conectarse
   * con este celular.
   */
  setConnectionHandler(
    async (deviceName) => {
      console.log(
        "Conexión recibida desde:",
        deviceName
      );

      await showConnectionNotification(
        deviceName
      );
    }
  );

  /*
   * Publicamos el dispositivo.
   */
  startPublishing();

  /*
   * Buscamos otros dispositivos.
   */
  const cleanup =
    startDiscovery(
      (device) => {
        console.log(
          "Dispositivo encontrado:",
          device
        );

        setDevices(
          (current) => {
            const exists =
              current.some(
                (item) =>
                  item.id ===
                  device.id
              );

            if (exists) {
              return current.map(
                (item) =>
                  item.id ===
                  device.id
                    ? device
                    : item
              );
            }

            return [
              ...current,
              device,
            ];
          }
        );

        setSearching(false);
      },

      (id) => {
        setDevices(
          (current) =>
            current.filter(
              (device) =>
                device.id !== id
            )
        );
      }
    );

  return () => {
    cleanup();

    stopLocalServer();
  };
}, []);
  function searchDevices() {
    /*
     * No creamos otro listener.
     *
     * El discovery ya está ejecutándose
     * desde el useEffect.
     *
     * Solo limpiamos la lista y mostramos
     * nuevamente el estado de búsqueda.
     */
    setDevices([]);
    setSearching(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        LocalSend Clone
      </Text>

      <Pressable
        style={styles.button}
        onPress={handlePickFile}
      >
        <Text style={styles.buttonText}>
          Elegir archivo
        </Text>
      </Pressable>

      {selectedFile && (
        <Text style={styles.fileText}>
          Archivo seleccionado: {selectedFile}
        </Text>
      )}

      <Pressable
        style={styles.button}
        onPress={searchDevices}
      >
        <Text style={styles.buttonText}>
          {searching
            ? "Buscando dispositivos..."
            : "Buscar dispositivos"}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>
        Dispositivos cercanos
      </Text>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          devices.length === 0
            ? styles.emptyContainer
            : undefined
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No se encontraron dispositivos.
          </Text>
        }
        renderItem={({ item }) => (
        <Pressable
  style={styles.deviceCard}
  onPress={() =>
    handleDevicePress(item)
  }
>

            <Text style={styles.deviceName}>
              {item.platform === "windows"
                ? "💻"
                : "📱"}{" "}
              {item.name}
            </Text>

            <Text style={styles.deviceInfo}>
              {item.address}:{item.port}
            </Text>

            <Text style={styles.deviceInfo}>
              {item.platform}
            </Text>
          </Pressable>
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