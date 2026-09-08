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

const DEVICE_NAME =
  Device.deviceName || "Android";

const PLATFORM =
  Platform.OS;

const PORT = 53317;

/**
 * Devuelve el ID del dispositivo.
 */
export function getDeviceId() {
  return DEVICE_ID;
}

/**
 * Publica este celular en la red.
 */
export function startPublishing() {
  console.log(
    "Publicando dispositivo mobile..."
  );

  console.log(
    "Nombre:",
    DEVICE_NAME
  );

  console.log(
    "ID:",
    DEVICE_ID
  );

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

  zeroconf.on(
    "published",
    (service) => {
      console.log(
        "================================"
      );

      console.log(
        "MOBILE PUBLICADO"
      );

      console.log(
        service
      );

      console.log(
        "================================"
      );
    }
  );
}

/**
 * Busca otros dispositivos.
 */
export function startDiscovery(
  onDeviceFound: (
    device: DiscoveredDevice
  ) => void,
  onDeviceRemoved?: (
    id: string
  ) => void
) {
  console.log(
    "Buscando dispositivos LocalSend..."
  );

  const handleResolved = (
    service: any
  ) => {
    const address =
      service.addresses?.find(
        (ip: string) =>
          ip.includes(".")
      ) ||
      service.addresses?.[0];

    if (!address) {
      return;
    }

    const id =
      service.txt?.id ||
      service.fullName ||
      service.name;

    /*
     * Ignoramos nuestro propio servicio.
     */
    if (
      service.txt?.id ===
      DEVICE_ID
    ) {
      return;
    }

    const device: DiscoveredDevice = {
      id,

      name:
        service.txt?.deviceName ||
        service.name ||
        "Dispositivo",

      host:
        service.host,

      address,

      port:
        service.port,

      type:
        "localsend",

      platform:
        service.txt?.platform ||
        "unknown",

      version:
        service.txt?.version,
    };

    console.log(
      "Dispositivo encontrado:",
      device
    );

    onDeviceFound(device);
  };

  const handleRemove = (
    name: string
  ) => {
    console.log(
      "Dispositivo eliminado:",
      name
    );

    onDeviceRemoved?.(
      name
    );
  };

  zeroconf.on(
    "resolved",
    handleResolved
  );

  zeroconf.on(
    "remove",
    handleRemove
  );

  zeroconf.on(
    "error",
    (error) => {
      console.error(
        "Error Zeroconf:",
        error
      );
    }
  );

  /*
   * Android:
   * usamos DNSSD para discovery.
   */
  zeroconf.scan(
    SERVICE_TYPE,
    SERVICE_PROTOCOL,
    SERVICE_DOMAIN,
    "DNSSD"
  );

  return () => {
    try {
      zeroconf.stop(
        "DNSSD"
      );
    } catch (error) {
      console.log(
        "Error deteniendo discovery:",
        error
      );
    }

    zeroconf.removeDeviceListeners();
  };
}

/**
 * Detiene todo Zeroconf.
 */
export function stopDiscovery() {
  try {
    zeroconf.stop(
      "DNSSD"
    );
  } catch {
    // ignorar
  }

  zeroconf.removeDeviceListeners();
}

/**
 * Deja de publicar el dispositivo.
 */
export function stopPublishing() {
  try {
    zeroconf.unpublishService(
      DEVICE_NAME,
      "DNSSD"
    );
  } catch (error) {
    console.log(
      "Error deteniendo publicación:",
      error
    );
  }
}