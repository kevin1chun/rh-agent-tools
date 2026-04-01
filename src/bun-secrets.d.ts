declare module "bun" {
  interface SecretsOptions {
    service: string;
    name: string;
  }

  interface Secrets {
    get(service: string, name: string): Promise<string | null>;
    get(options: SecretsOptions): Promise<string | null>;
    set(service: string, name: string, value: string): Promise<void>;
    delete(options: SecretsOptions): Promise<boolean>;
  }

  const secrets: Secrets;
}
