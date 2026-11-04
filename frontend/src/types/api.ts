export type Role = "technician" | "admin";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface Health {
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
  app: string;
  environment: string;
}

export interface IntegrationStatus {
  synthetic_data: { enabled: boolean; default: boolean };
  teamdynamix: { enabled: boolean; read_only: boolean; configured: boolean; note: string };
  external_llm: { enabled: boolean };
}
