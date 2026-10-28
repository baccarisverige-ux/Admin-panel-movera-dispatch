import { SupportWorkspace } from "../ui/SupportWorkspace";
import { isLiveData } from "../live/realData";
import { LiveChat } from "../live/LiveChat";

/** Live: the trip chats of the admin's zones (contract v0.13.0 §22, support.reply); demo: the demo chat desk. */
export function ChatPage() {
  return isLiveData() ? <LiveChat /> : <SupportWorkspace chat />;
}
