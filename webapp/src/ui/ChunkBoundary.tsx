import { Component, type ReactNode } from "react";
import { tr, trn } from "../i18n";
import { isChunkLoadError } from "./chunkError";

/**
 * Admin lazy-load job (2026-11-16): around every place that waits for a lazily loaded file (a page, the live client,
 * the sign-in screen). While the file loads, the Suspense next to it shows "Loading."; if the file cannot be loaded this
 * shows one error line with Reload. Errors that are not loading errors are thrown on, exactly as before.
 * Give it a `key` (the page) so moving to another page tries again.
 */
export class ChunkBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (!isChunkLoadError(error)) throw error;
    return (
      <p className="state-line" role="alert" data-testid="chunk-error">
        {trn("Could not load. {0}", <button data-command="admin.ui.retry" type="button" className="link-action" onClick={() => window.location.reload()}>{tr("Reload")}</button>)}
      </p>
    );
  }
}
