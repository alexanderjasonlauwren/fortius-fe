/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Add more env variables as needed
  readonly VITE_APP_TITLE?: string;
  readonly VITE_DEV?: boolean;
  /** Base tile URL for the distribution map. Unset falls back to the public
   * OSM tile server, which is fine for a demo with internet access but not
   * for an on-premise deployment with no route to the internet. */
  readonly VITE_MAP_TILE_URL?: string;
  /** Attribution shown for VITE_MAP_TILE_URL. Only meaningful alongside it —
   * hardcoding OSM's own attribution on someone else's tiles would be a
   * licensing claim this console has no basis for. */
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
  /** OSRM-compatible router base URL for snapping rounds to real roads.
   * Defaults to empty, which means straight legs between stops — not a
   * fallback, the deliberate default. See snapToRoads.ts. */
  readonly VITE_ROUTER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
