export {};

interface LocalSendDevice {
  id: string;
  name: string;
  address: string;
  host?: string;
  port: number;
  platform: string;
  version?: string;
}

interface LocalSendAPI {
  getDevices(): Promise<
    LocalSendDevice[]
  >;

  searchDevices(): Promise<
    LocalSendDevice[]
  >;

  getMyDevice(): Promise<
    LocalSendDevice
  >;

  connectDevice(
    device: LocalSendDevice
  ): Promise<{
    ok: boolean;
    status?: number;
    body?: string;
    error?: string;
  }>;

  onDeviceFound(
    callback: (
      device: LocalSendDevice
    ) => void
  ): () => void;

  onDeviceRemoved(
    callback: (
      id: string
    ) => void
  ): () => void;
}

declare global {
  interface Window {
    localSend: LocalSendAPI;
  }
}