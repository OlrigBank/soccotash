/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminUser: import('./lib/admin/auth').AdminUser | null;
  }
}

interface Window {
  olrigAnalytics?: {
    track(name: string, data?: Record<string, string | number | boolean>): void;
    ready(): void;
  };
  umami?: {
    track(
      event:
        | string
        | ((properties: Record<string, unknown>) => Record<string, unknown>),
      data?: Record<string, string | number | boolean>,
    ): void;
  };
}
