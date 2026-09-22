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

/**
 * Devuelve el ID del dispositivo.
 */
export function getDeviceId() {
  return DEVICE_ID;
}

/**
 * Devuelve el nombre publicado de este dispositivo.
 */
export function getDeviceName() {
  return DEVICE_NAME;
}

/**
 * Publica este celular en la red.
 */
export function startPublishing() {
  console.log("Publicando dispositivo mobile...");
  console.log("Nombre:", DEVICE_NAME);
  console.log("ID:", DEVICE_ID);

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

  zeroconf.on("published", (service) => {
    console.log("================================");
    console.log("MOBILE PUBLICADO");
    console.log(service);
    console.log("================================");
  });
}

/**
 * Busca otros dispositivos.
 */
export function startDiscovery(
  onDeviceFound: (device: DiscoveredDevice) => void,
  onDeviceRemoved?: (id: string) => void
) {
  console.log("Buscando dispositivos LocalSend...");

  const handleResolved = (service: any) => {
    const address =
      service.addresses?.find((ip: string) => ip.includes(".")) ||
      service.addresses?.[0];

    if (!address) {
      return;
    }

    const id = service.txt?.id || service.fullName || service.name;

    /*
     * Ignoramos nuestro propio servicio.
     *
     * Chequeamos por ID (txt) Y por nombre publicado, porque en algunos
     * dispositivos Android el TXT record puede no llegar bien parseado
     * en el evento "resolved" y el chequeo por ID solo fallaría en
     * silencio, mostrándonos a nosotros mismos en la lista.
     */
    const isSelf =
      service.txt?.id === DEVICE_ID || service.name === DEVICE_NAME;

    if (isSelf) {
      return;
    }

    const device: DiscoveredDevice = {
      id,
      name: service.txt?.deviceName || service.name || "Dispositivo",
      host: service.host,
      address,
      port: service.port,
      type: "localsend",
      platform: service.txt?.platform || "unknown",
      version: service.txt?.version,
    };

    console.log("Dispositivo encontrado:", device);

    onDeviceFound(device);
  };

  const handleRemove = (name: string) => {
    console.log("Dispositivo eliminado:", name);
    onDeviceRemoved?.(name);
  };

  zeroconf.on("resolved", handleResolved);
  zeroconf.on("remove", handleRemove);

  zeroconf.on("error", (error) => {
    console.error("Error Zeroconf:", error);
  });

  /*
   * Android:
   * usamos DNSSD para discovery.
   */
  zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN, "DNSSD");

  return () => {
    try {
      zeroconf.stop("DNSSD");
    } catch (error) {
      console.log("Error deteniendo discovery:", error);
    }

    zeroconf.removeDeviceListeners();
  };
}

/**
 * Fuerza un nuevo ciclo de consultas mDNS en vez de esperar al backoff
 * natural del protocolo. Útil para el botón "Buscar dispositivos":
 * sin esto, apretar el botón solo limpiaba la lista pero nunca le
 * pedía a la red que vuelva a contestar, por eso tardaba tanto.
 */
export function rescan() {
  try {
    zeroconf.stop("DNSSD");
  } catch (error) {
    console.log("Error deteniendo escaneo previo:", error);
  }

  zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN, "DNSSD");
}

/**
 * Detiene todo Zeroconf.
 */
export function stopDiscovery() {
  try {
    zeroconf.stop("DNSSD");
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
    zeroconf.unpublishService(DEVICE_NAME, "DNSSD");
  } catch (error) {
    console.log("Error deteniendo publicación:", error);
  }
}