import { SupportWorkspace } from "../ui/SupportWorkspace";
import { isLiveData } from "../live/realData";
import { LiveSupport } from "../live/LiveSupport";

/** Live: the server's tickets with their answers (contract v0.9.0); demo: the demo support desk. */
export function SupportPage() {
  return isLiveData() ? <LiveSupport /> : <SupportWorkspace />;
}
