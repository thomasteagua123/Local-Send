import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  startDiscovery,
  DiscoveredDevice,
} from "../service/discoveryService";

export default function HomeScreen() {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [searching, setSearching] = useState(false);

  function searchDevices() {
    setDevices([]);
    setSearching(true);

    const cleanup = startDiscovery(
      (device) => {
        setDevices((current) => {
          const exists = current.some(
            (item) => item.id === device.id
          );

          if (exists) {
            return current.map((item) =>
              item.id === device.id ? device : item
            );
          }

          return [...current, device];
        });
      },
      (removedName) => {
        setDevices((current) =>
          current.filter(
            (device) => device.name !== removedName
          )
        );
      }
    );

    setTimeout(() => {
      cleanup();
      setSearching(false);
    }, 10000);
  }

  useEffect(() => {
    searchDevices();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        LocalSend Clone
      </Text>

      <Pressable
        style={styles.button}
        onPress={searchDevices}
      >
        <Text style={styles.buttonText}>
          {searching
            ? "Buscando..."
            : "Buscar dispositivos"}
        </Text>
      </Pressable>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No hay dispositivos encontrados.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.deviceCard}>
            <Text style={styles.deviceName}>
              {item.name}
            </Text>

            <Text style={styles.deviceInfo}>
              {item.address}:{item.port}
            </Text>

            <Text style={styles.deviceInfo}>
              {item.platform}
            </Text>
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
    marginBottom: 20,
  },

  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
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
    marginBottom: 5,
  },

  deviceInfo: {
    color: "#9CA3AF",
    fontSize: 14,
  },

  empty: {
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 30,
  },
});