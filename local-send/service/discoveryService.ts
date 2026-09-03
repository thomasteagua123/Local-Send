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
}

const SERVICE_TYPE = "localsend";
const SERVICE_PROTOCOL = "tcp";
const SERVICE_DOMAIN = "local.";

const zeroconf = new Zeroconf();

let deviceId = uuid.v4() as string;

export function getDeviceId() {
  return deviceId;
}

export function getDeviceName() {
  return Device.deviceName || "Dispositivo";
}

export function getPlatform() {
  return Platform.OS;
}

export function startPublishing(port: number) {
  const name = `${getDeviceName()}-${deviceId.substring(0, 6)}`;

  zeroconf.publishService(
    SERVICE_TYPE,
    SERVICE_PROTOCOL,
    SERVICE_DOMAIN,
    name,
    port,
    {
      id: deviceId,
      deviceName: getDeviceName(),
      platform: Platform.OS,
      version: "1.0",
    }
  );

  console.log("Servicio publicado:", name);
}

export function startDiscovery(
  onDeviceFound: (device: DiscoveredDevice) => void,
  onDeviceRemoved?: (name: string) => void
) {
  const handleResolved = (service: any) => {
    const address =
      service.addresses?.find((ip: string) => !ip.includes(":")) ||
      service.addresses?.[0];

    if (!address) return;

    const id =
      service.txt?.id ||
      service.fullName ||
      service.name;

    // No agregarnos a nosotros mismos
    if (service.txt?.id === deviceId) {
      return;
    }

    const device: DiscoveredDevice = {
      id,
      name:
        service.txt?.deviceName ||
        service.name ||
        "Dispositivo",
      host: service.host,
      address,
      port: service.port,
      type: "localsend",
      platform:
        service.txt?.platform ||
        "unknown",
    };

    console.log("Dispositivo encontrado:", device);

    onDeviceFound(device);
  };

  const handleRemove = (name: string) => {
    console.log("Dispositivo desconectado:", name);

    if (onDeviceRemoved) {
      onDeviceRemoved(name);
    }
  };

  zeroconf.on("resolved", handleResolved);
  zeroconf.on("remove", handleRemove);

  zeroconf.on("error", (error) => {
    console.error("Error Zeroconf:", error);
  });

  // DNSSD suele ser más confiable en Android
  if (Platform.OS === "android") {
    zeroconf.scan(
      SERVICE_TYPE,
      SERVICE_PROTOCOL,
      SERVICE_DOMAIN,
      "DNSSD"
    );
  } else {
    zeroconf.scan(
      SERVICE_TYPE,
      SERVICE_PROTOCOL,
      SERVICE_DOMAIN
    );
  }

  return () => {
    try {
      if (Platform.OS === "android") {
        zeroconf.stop("DNSSD");
      } else {
        zeroconf.stop();
      }
    } catch (error) {
      console.log("Error deteniendo discovery:", error);
    }

    zeroconf.removeDeviceListeners();
  };
}