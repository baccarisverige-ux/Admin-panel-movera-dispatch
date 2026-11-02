import type { GeoJSONSource } from "maplibre-gl";

/** What each map source last got, as text: the same data again is not sent (a setData repaints the whole map). */
const last = new WeakMap<object, string>();

/**
 * Root cause of the frozen Handle panel (fix/radar-e2e-flake): the live Dispatch page re-renders on every poll (the
 * open panel reads its trip every second) and each render built new arrays for the map, so every map source got
 * setData again with the same features and the map repainted several times a second. Without a GPU (software
 * WebGL) a repaint takes 100-400 ms, so the main thread never rested: clicks on Send / Stop and typed money waited
 * for seconds, and the panel's reads came late. Only a real change of the data reaches the map now.
 */
export function setDataIfChanged(source: Pick<GeoJSONSource, "setData"> | undefined | null, data: GeoJSON.GeoJSON): boolean {
  if (!source) return false;
  const text = JSON.stringify(data);
  if (last.get(source) === text) return false;
  last.set(source, text);
  source.setData(data);
  return true;
}
