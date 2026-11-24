import Zeroconf from "react-native-zeroconf";
import * as Device from "expo-device";
import { Platform } from "react-native";
import uuid from "react-native-uuid";

export interface DiscoveredDevice {
  id: string;
  name: string;
  host: string;
  address: string;
  port: number;
  type: string;
  platform: string;
  version?: string;
}

const zeroconf = new Zeroconf();

const SERVICE_TYPE = "localsend";
const SERVICE_PROTOCOL = "tcp";
const SERVICE_DOMAIN = "local.";

const DEVICE_ID = uuid.v4() as string;
const DEVICE_NAME = Device.deviceName || "Android";
const PLATFORM = Platform.OS;
const PORT = 53317;

export function getDeviceId() {
  return DEVICE_ID;
}

export function getDeviceName() {
  return DEVICE_NAME;
}

export function startPublishing() {
  console.log("Publicando dispositivo mobile...");

  try {
    zeroconf.publishService(
      SERVICE_TYPE,
      SERVICE_PROTOCOL,
      SERVICE_DOMAIN,
      DEVICE_NAME,
      PORT,
      {
        id: DEVICE_ID,
        deviceName: DEVICE_NAME,
        platform: PLATFORM,
        version: "1.0",
      },
      "DNSSD"
    );
  } catch (error) {
    console.error("Error al publicar servicio:", error);
  }
}

/**
 * Busca otros dispositivos LocalSend en la red local.
 */
export function startDiscovery(
  onDeviceFound: (device: DiscoveredDevice) => void,
  onDeviceRemoved?: (id: string) => void
) {
  console.log("Iniciando búsqueda de dispositivos...");

  // Limpiamos listeners previos para evitar duplicados
  zeroconf.removeAllListeners();

  // La librería resuelve los servicios sola y dispara "resolved"
  // con IP, puerto y TXT. No hace falta llamar a resolve() a mano.
  zeroconf.on("resolved", (service: any) => {
    if (!service) return;

    const address =
      service.addresses?.find((ip: string) => ip.includes(".")) ||
      service.addresses?.[0];

    if (!address) return;

    const id = service.txt?.id || service.fullName || service.name;
    const isSelf =
      service.txt?.id === DEVICE_ID ||
      service.name === DEVICE_NAME ||
      service.txt?.deviceName === DEVICE_NAME;

    if (isSelf) return;

    const device: DiscoveredDevice = {
      id,
      name: service.txt?.deviceName || service.name || "Dispositivo",
      host: service.host || address,
      address,
      port: service.port || PORT,
      type: "localsend",
      platform: service.txt?.platform || "unknown",
      version: service.txt?.version,
    };

    console.log("[Zeroconf] Dispositivo resuelto:", device.name, device.address);
    onDeviceFound(device);
  });

  zeroconf.on("remove", (name: string) => {
    console.log("[Zeroconf] Dispositivo removido:", name);
    onDeviceRemoved?.(name);
  });

  zeroconf.on("error", (error: any) => {
    console.error("[Zeroconf] Error:", error);
  });

  // Iniciamos el escaneo
  try {
    zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN, "DNSSD");
  } catch (e) {
    console.error("[Zeroconf] Error iniciando scan:", e);
  }

  return () => {
    stopDiscovery();
  };
}

export function rescan() {
  try {
    zeroconf.stop("DNSSD");
  } catch (error) {
    // ignorar
  }
  setTimeout(() => {
    zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN, "DNSSD");
  }, 300);
}

export function stopDiscovery() {
  try {
    zeroconf.stop("DNSSD");
  } catch (error) {
    // ignorar
  }
  zeroconf.removeAllListeners();
}

export function stopPublishing() {
  try {
    zeroconf.unpublishService(DEVICE_NAME, "DNSSD");
  } catch (error) {
    console.log("Error deteniendo publicación:", error);
  }
}