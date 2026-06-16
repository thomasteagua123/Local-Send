import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function HomeScreen() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [devices, setDevices] = useState<string[]>([]);


async function handlePickFile() {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
  });

  if (!result.canceled) {
    setSelectedFile(result.assets[0].name);
  }
}

  function handleSearchDevices() {
    // Simulación
    setDevices([
      "Mi Notebook",
      "PC Escritorio",
      "Samsung Galaxy",
    ]);
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

      <Pressable style={styles.button} onPress={handleSearchDevices}>
        <Text style={styles.buttonText}>Buscar dispositivos</Text>
      </Pressable>

      <FlatList
        data={devices}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <View style={styles.deviceCard}>
            <Text style={styles.deviceName}>{item}</Text>
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
  deviceCard: {
    backgroundColor: "#1F2937",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  deviceName: {
    color: "white",
    fontSize: 16,
  },
});