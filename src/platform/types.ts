export interface Credentials {
  cid: string;
  token: string;
}

export interface RegisterInput {
  name: string;
  webhook: string;
}

export interface BurstResponse {
  run_id: string;
  total: number;
  started_at: string;
}

export interface EnrichResponse {
  sku: string;
  price: number;
  stock: number;
}

export interface CallbackItem {
  seq: number;
  sku: string;
  price: number | null;
  stock: number | null;
}

export interface CallbackPayload {
  cid: string;
  run_id: string;
  result: CallbackItem[];
}

export interface PlatformClient {
  register(input: RegisterInput): Promise<Credentials>;
  requestBurst(credentials: Credentials): Promise<BurstResponse>;
  enrich(sku: string, credentials: Credentials): Promise<EnrichResponse>;
  sendCallback(payload: CallbackPayload, credentials: Credentials): Promise<unknown>;
}

export interface CredentialProvider {
  get(): Credentials | null;
  save(credentials: Credentials): Promise<void>;
}
