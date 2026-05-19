// Type declarations and structural property names MUST NOT trigger.
// No literal values are present here.
export interface ScaleDevice {
  id: string;
  deviceCode: string;
  apiTokenHash: string;
  apiToken?: string;
}

export interface AdminLoginInput {
  email: string;
  password: string;
}
