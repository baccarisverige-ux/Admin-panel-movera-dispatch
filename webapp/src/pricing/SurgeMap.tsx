import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../ui/maplibreWorker";
import { baseMapStyle } from "../ui/mapStyle";
import type { Market } from "../markets/markets";
import type { ZoneSurge } from "./surge";
import type { SurgeStyle } from "./surgeGeo";
import { installSurgeLayers, surgePitch, updateSurgeLayers } from "./surgeLayers";
import { SurgeControls, SurgeLegend } from "./SurgeControls";
import { tr } from "../i18n";

const STYLE = baseMapStyle();

type Props = {
  market: Market;
  rows: ZoneSurge[];
  selectedId: string | null;
  onSelect: (zoneId: string) => void;
  shown: boolean;
  style: SurgeStyle;
  onShown: (shown: boolean) => void;
  onStyle: (style: SurgeStyle) => void;
};

/** The Pricing surge map: every zone of the country with its surge, in the style the admin picks. */
export function SurgeMap({ market, rows, selectedId, onSelect, shown, style, onShown, onStyle }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;
  const latestRows = useRef(rows);
  latestRows.current = rows;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: node, style: STYLE, center: [market.center[1], market.center[0]], zoom: market.zoom - 0.3, attributionControl: { compact: true } });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    // "style.load", not "load": "load" also waits for the base map's TileJSON (tiles.openfreemap.org), so a slow or
    // unreachable tile server kept this map empty. Same as DriversMap.
    map.on("style.load", () => {
      installSurgeLayers(map, (zoneId) => select.current(zoneId));
      setReady(true);
    });
    map.on("error", () => undefined);
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [market]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    updateSurgeLayers(map, rows, style, shown, selectedId, (zoneId) => select.current(zoneId));
  }, [rows, style, shown, selectedId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) surgePitch(map, style, shown);
  }, [style, shown, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const row = latestRows.current.find((item) => item.zoneId === selectedId);
    if (!map || !ready || !row) return;
    const bounds = map.getBounds();
    if (!bounds.contains([row.center[1], row.center[0]])) map.easeTo({ center: [row.center[1], row.center[0]], duration: 700 });
  }, [selectedId, ready]);

  if (failed) {
    return (
      <div className="map-fallback">
        <p>{tr("The map needs WebGL, which this browser has turned off. Surge by zone:")}</p>
        <ul>{rows.map((row) => <li key={row.zoneId}>{row.name} · {row.multiplier > 1 ? `×${row.multiplier.toFixed(1)} (${row.source})` : tr("no surge")}</li>)}</ul>
      </div>
    );
  }

  return (
    <div className="surge-map">
      <div ref={host} className="surge-map-canvas" data-testid="surge-map" />
      <div className="surge-map-top">
        <SurgeControls shown={shown} style={style} onShown={onShown} onStyle={onStyle} />
      </div>
      {shown ? <SurgeLegend /> : null}
    </div>
  );
}
