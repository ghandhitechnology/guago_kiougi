/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `memory` selects the in-memory account API in dev builds. */
  readonly VITE_BACKEND?: string;
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
