import { useLayoutEffect, useSyncExternalStore } from "react";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { listCountText } from "./listPages";
import { askListCount, listQueryOf, subscribeLists, type LiveListName } from "./liveLists";

/**
 * v0.18.78 (L78-A, owner item 109 "50 of N · Load more"): "{loaded} of {total}" next to a server list's Load more,
 * also when every row is loaded ("56 of 56"). Shown only when the server counted the list (total on the first page);
 * absent = not counted, nothing shows (as before). Live builds only.
 * A6 (v0.18.83 total.onlyWhenAsked): the list page opening asks the server to count once (a layout effect, so before
 * the page's read starts); every other read of the list sends total=false and this number stays.
 */
export function ListCount({ list }: { list: LiveListName }) {
  const live = useLiveSessionMaybe();
  const query = useSyncExternalStore(subscribeLists, () => listQueryOf(list), () => listQueryOf(list));
  useLayoutEffect(() => {
    if (live) askListCount(list);
  }, [live, list]);
  if (!live || query.total === undefined || query.loaded === undefined) return null;
  return <small className="live-list-count" data-testid={`list-count-${list}`}>{listCountText(query.loaded, query.total)}</small>;
}
