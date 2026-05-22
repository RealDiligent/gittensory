declare global {
  interface Env {
    GITHUB_WEBHOOK_SECRET: string;
    GITHUB_APP_PRIVATE_KEY: string;
  }
}

export {};
