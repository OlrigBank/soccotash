/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminUser: import('./lib/admin/auth').AdminUser | null;
  }
}
