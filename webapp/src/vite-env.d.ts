/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_SHA?: string;
  readonly VITE_GOOGLE_MAPS_KEY?: string;
  readonly VITE_DATA?: string;
  readonly VITE_ADMIN_API?: string;
  /** B7 app preview: the rider / driver web build framed in the phone (default: the live builds). */
  readonly VITE_RIDER_APP_URL?: string;
  readonly VITE_DRIVER_APP_URL?: string;
  /** Replaces every admin's country default language (en, fr or sv); the e2e suite sets en. */
  readonly VITE_ADMIN_LANGUAGE?: string;
}

interface MoveraMapHandle {
  project: (lat: number, lng: number) => { x: number; y: number };
  generation: number;
}

interface Window {
  __moveraMap?: MoveraMapHandle;
}
