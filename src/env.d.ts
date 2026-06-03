/// <reference types="astro/client" />

declare module "*.astro" {
  const component: unknown;
  export default component;
}
