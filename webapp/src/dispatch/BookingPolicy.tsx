import { useMemo, useState } from "react";
import { AlertTriangle, ScrollText, Undo2 } from "lucide-react";
import { emptyReservationBook, normalizeReservationBook, saveReservationPolicy, useSlice, type ReservationBook, type ReservationPolicy } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { CommandButton } from "../ui/CommandButton";
import { Card, Num, Row } from "./fields";

const RESERVATION_OPS_KEY = "reservationOps";

/**
 * The reservation policy for every zone: how far ahead riders can book, when a ride without a driver needs attention,
 * and included waiting. Rider free cancel and cancel fees are in Rides & stops › Rider cancel fees. Each save is a new version; booked rides keep the version they were booked with.
 */
export function BookingPolicyCard() {
  const { agent } = useSession();
  const store = useSlice<ReservationBook>(RESERVATION_OPS_KEY, emptyReservationBook());
  const book = useMemo(() => normalizeReservationBook(store.value), [store.value]);
  const [draft, setDraft] = useState<ReservationPolicy | null>(null);
  const [notice, setNotice] = useState("");
  const policy = draft ?? book.currentPolicy;
  const canEdit = Boolean(agent && can(agent.role, "trips.intervene"));
  const off = !canEdit || store.loading;
  const prepared = agent ? saveReservationPolicy(book, policy) : { book, error: "Sign in again." };
  const patch = (next: Partial<ReservationPolicy>) => setDraft({ ...policy, ...next });
  const nextVersion = prepared.error ? null : prepared.book.currentPolicy.version;
  return (
    <div data-testid="reservation-policy">
      <Card title={`Reservation policy · all zones · ${book.currentPolicy.version}`} tone="green" icon={<ScrollText size={18} />} help="Saved on its own as a new version. Rides already booked keep the version they were booked with.">
        <Row label="Book up to" help="How far ahead a rider can book.">
          <Num label="Booking horizon" value={policy.bookingHorizonDays} unit="days ahead" min={1} max={30} disabled={off} onChange={(bookingHorizonDays) => patch({ bookingHorizonDays })} />
        </Row>
        <Row label="Assignment lead" help="A ride with no driver this close to pickup needs attention.">
          <Num label="Assignment lead" value={policy.assignmentLeadMinutes} unit="min before" min={5} max={240} disabled={off} onChange={(assignmentLeadMinutes) => patch({ assignmentLeadMinutes })} />
        </Row>
        <Row label="Give-up time" help="Still no driver this close to pickup: the ride is given up.">
          <Num label="Give-up time" value={policy.giveUpMinutes} unit="min before" min={1} max={60} disabled={off} onChange={(giveUpMinutes) => patch({ giveUpMinutes })} />
        </Row>
        <Row label="Included waiting" help="Free waiting at the pickup for a booked ride.">
          <Num label="Included waiting" value={policy.includedWaitingMinutes} unit="min" min={0} max={60} disabled={off} onChange={(includedWaitingMinutes) => patch({ includedWaitingMinutes })} />
        </Row>
        {draft && prepared.error ? <p className="dx-issues" role="alert"><AlertTriangle size={13} aria-hidden="true" /> {prepared.error}</p> : null}
        {notice ? <p className="dx-note" role="status">{notice}</p> : null}
        {!canEdit ? <p className="dx-note">You can view the policy. Only roles that handle trips can change it.</p> : null}
        <div className="dx-modal-actions">
          {draft ? <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" onClick={() => setDraft(null)}><Undo2 size={13} aria-hidden="true" /> Discard policy changes</button> : null}
          <CommandButton
            command="admin.reservation.savePolicy"
            className="dash-btn small"
            type="button"
            targetId="reservation-policy"
            confirmTarget={false}
            scope="all"
            before={book.currentPolicy.version}
            after={nextVersion ?? "invalid"}
            expectedSliceRev={book.draftRev}
            sliceKey={RESERVATION_OPS_KEY}
            value={prepared.book}
            disabled={!canEdit || !draft || Boolean(prepared.error)}
            title={prepared.error ?? (!draft ? "No unsaved policy change." : undefined)}
            onDone={() => {
              setDraft(null);
              setNotice(`Reservation policy saved as ${nextVersion}. Rides already booked keep their own version.`);
            }}
          >
            Save reservation policy
          </CommandButton>
        </div>
      </Card>
    </div>
  );
}
