/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USER_POOL_ID?: string;
  readonly VITE_USER_POOL_CLIENT_ID?: string;
  readonly VITE_SHOW_DEV?: string;
  /** Feature toggles a apagar en este build, separados por comas. */
  readonly VITE_FEATURES_OFF?: string;
}
