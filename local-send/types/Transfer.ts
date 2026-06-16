export interface Transfer {
  id: string;
  progress: number;
  status: "pending" | "sending" | "completed";
}