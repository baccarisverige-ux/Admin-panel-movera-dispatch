import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

// maplibre-gl 6 starts its worker from `new URL("./maplibre-gl-worker.mjs", import.meta.url)`. Once Vite has bundled
// maplibre into an app chunk that file is not next to it, so every map failed with "Worker failed to load" and never
// fired "load". The worker is self-contained; Vite emits it as an asset and this hands its URL to maplibre.
// Every module that creates a maplibre map imports this file first.
setWorkerUrl(workerUrl);
