import { useSyncExternalStore } from "react";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { listCountText } from "./listPages";
import { listQueryOf, subscribeLists, type LiveListName } from "./liveLists";

/**
 * v0.18.78 (L78-A, owner item 109 "50 of N · Load more"): "{loaded} of {total}" next to a server list's Load more,
 * also when every row is loaded ("56 of 56"). Shown only when the server counted the list (total on the first page);
 * absent = not counted, nothing shows (as before). Live builds only.
 */
export function ListCount({ list }: { list: LiveListName }) {
  const live = useLiveSessionMaybe();
  const query = useSyncExternalStore(subscribeLists, () => listQueryOf(list), () => listQueryOf(list));
  if (!live || query.total === undefined || query.loaded === undefined) return null;
  return <small className="live-list-count" data-testid={`list-count-${list}`}>{listCountText(query.loaded, query.total)}</small>;
}
