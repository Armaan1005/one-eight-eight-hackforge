import * as signalR from "@microsoft/signalr";
import { API_BASE_URL } from "./api";

const connection = new signalR.HubConnectionBuilder()
  .withUrl(`${API_BASE_URL}/hubs/jobs`)
  .withAutomaticReconnect([0, 2000, 5000, 10000])
  .configureLogging(signalR.LogLevel.Warning)
  .build();

export type HubStatus = "live" | "connecting" | "offline";

let status: HubStatus = "connecting";
const statusListeners = new Set<(s: HubStatus) => void>();

function setStatus(next: HubStatus) {
  status = next;
  statusListeners.forEach((l) => l(next));
}

connection.onreconnecting(() => setStatus("connecting"));
connection.onreconnected(() => setStatus("live"));
connection.onclose(() => {
  setStatus("offline");
  startPromise = null;
  // Automatic reconnect gives up after its schedule; keep trying slowly so the pill recovers
  // when the backend comes back.
  setTimeout(() => ensureJobsHubStarted().catch(() => {}), 5000);
});

let startPromise: Promise<void> | null = null;

/** Idempotent - safe to call from every page/component that mounts. */
export function ensureJobsHubStarted(): Promise<void> {
  if (connection.state === signalR.HubConnectionState.Connected) {
    return Promise.resolve();
  }
  if (!startPromise) {
    setStatus("connecting");
    startPromise = connection
      .start()
      .then(() => setStatus("live"))
      .catch((err) => {
        startPromise = null;
        setStatus("offline");
        setTimeout(() => ensureJobsHubStarted().catch(() => {}), 5000);
        throw err;
      });
  }
  return startPromise;
}

export function getJobsHubConnection(): signalR.HubConnection {
  return connection;
}

export function getHubStatus(): HubStatus {
  return status;
}

export function subscribeHubStatus(listener: (s: HubStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}
