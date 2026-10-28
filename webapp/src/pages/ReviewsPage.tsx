import { useDirtyWarning } from "../ui/useDirtyWarning";
import { isLiveData } from "../live/realData";
import { NotConnected } from "../live/NotConnected";
import { RATING_TAGS, ratingTagLabel } from "../live/ratingTags";
import { tr, trn } from "../i18n";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, EyeOff, Search, ShieldAlert } from "lucide-react";
import { emptyGrowth, moderateGrowth, growthReviews, useRecords, useSlice, type GrowthBook } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { Card, Num, Row, Switch } from "../dispatch/fields";
import { REVIEW_OPS_KEY, emptyReviewOps, liveReviewsOf, normalizeReviewOps, people, reviewsOf, rulesError, visibility, type Review, type ReviewOps, type ReviewRules } from "../growth/reviews";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards } from "../reports/ui";
import { CommandButton } from "../ui/CommandButton";
import { PeopleView, Stars } from "../growth/PeopleView";

type Tab = "reviews" | "people" | "rules";


export function ReviewsPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (["people", "rules"].includes(params.get("tab") ?? "") ? params.get("tab") : "reviews") as Tab;
  const scope = useMarketScope();
  const country = scope.market.id;
  const store = useSlice<GrowthBook>("growthOps", emptyGrowth());
  const rulesSlice = useSlice<ReviewOps>(REVIEW_OPS_KEY, emptyReviewOps());
  const ops = normalizeReviewOps(rulesSlice.value);
  const trips = useRecords("trips");
  const drivers = useRecords("drivers");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [from, setFrom] = useState<"all" | "rider" | "driver">("all");
  const [stars, setStars] = useState<"all" | "low" | "mid" | "high">("all");
  const [query, setQuery] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [limit, setLimit] = useState(30);
  const editable = Boolean(agent && can(agent.role, "settings.publish"));
  const selectTab = (id: Tab) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    if (id === "reviews") next.delete("tab");
    else next.set("tab", id);
    return next;
  }, { replace: true });

  const now = useMemo(() => Date.now(), []);
  // Live (contract v0.9.0): the server's ratings with its hidden flag; demo: the demo reviews and the word list.
  const liveData = isLiveData();
  const liveRatings = useRecords("ratings");
  const liveRows = useMemo(() => (liveData ? liveReviewsOf(liveRatings.data ?? []) : []), [liveData, liveRatings.data]);
  const all = useMemo(() => (liveData ? liveRows : reviewsOf(trips.data ?? [], drivers.data ?? [], ops, now)), [liveData, liveRows, trips.data, drivers.data, ops, now]);
  const records = useMemo(() => new Map(growthReviews(trips.data ?? []).map((row) => [row.id, row.text])), [trips.data]);
  const here = all.filter((review) => review.country === country && (!scope.zones.length || scope.zones.includes(review.zone)));
  const rules = ops.rules[country];
  const withState = here.map((review) => ({ review, state: liveData ? { hidden: Boolean((review as { hidden?: boolean }).hidden), auto: false, last: null } : visibility(review, store.value.moderation, rules) }));
  const q = query.trim().toLowerCase();
  const shown = withState.filter(({ review, state }) =>
    (from === "all" || review.from === from)
    && (stars === "all" || (stars === "low" ? review.stars <= 2 : stars === "mid" ? review.stars === 3 : review.stars >= 4))
    && (!onlyHidden || state.hidden)
    && (!q || `${review.tripId} ${review.byName} ${review.aboutName} ${review.text}`.toLowerCase().includes(q)),
  ).sort((a, b) => b.review.at.localeCompare(a.review.at));
  const avg = (rows: readonly Review[]) => (rows.length ? Math.round((rows.reduce((sum, row) => sum + row.stars, 0) / rows.length) * 100) / 100 : 0);
  const aboutDrivers = here.filter((row) => row.from === "rider");
  const aboutRiders = here.filter((row) => row.from === "driver");
  const visible = withState.filter((row) => !row.state.hidden).map((row) => row.review);
  const persons = useMemo(() => people(here, (id) => ops.rules[id]), [here, ops]);

  return (
    <div className="dx-page gr-page">
      <header className="dx-head">
        <button data-command="admin.review.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
        <div className="dx-head-text">
          <h2>{tr("Reviews")}</h2>
          <p>{liveData ? tr("Ratings riders and drivers give each other, from the server. A hidden rating does not count in the average.") : <>{trn("Ratings riders and drivers give each other in {0}. Hiding keeps the original. Review text is demo text until the apps send real reviews.", scope.market.name)}</>}</p>
        </div>
      </header>
      <div className="dash-tabs dx-views" role="tablist" aria-label={tr("Review sections")}>
        {([["reviews", "Reviews"], ["people", "Ratings per person"], ["rules", "Rules"]] as const).map(([id, label]) => <button data-command="admin.review.view" key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : undefined} onClick={() => selectTab(id)}>{label}</button>)}
      </div>
      <p role="status" className="gr-status">{notice}</p>

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (format === "pct" ? `${value}%` : String(value))}
        cards={[
          { id: "all", label: "Reviews", value: here.length, previous: null, format: "count", info: "Every review in this country and zone choice." },
          { id: "drivers", label: "Drivers' average", value: avg(aboutDrivers), previous: null, format: "count", info: "What riders give drivers, out of 5." },
          { id: "riders", label: "Riders' average", value: avg(aboutRiders), previous: null, format: "count", info: "What drivers give riders, out of 5." },
          { id: "visible", label: "Shown average", value: avg(visible), previous: null, format: "count", info: "The average of the reviews people can see." },
          { id: "low", label: "1 or 2 stars", value: here.filter((row) => row.stars <= 2).length, previous: null, format: "count", info: "Low reviews worth a look." },
          { id: "hidden", label: "Hidden", value: withState.filter((row) => row.state.hidden).length, previous: null, format: "count", info: "Hidden by an admin or by the word list." },
        ]}
      />

      {tab === "rules" && liveData ? <LiveRules /> : tab === "people" ? <PeopleView persons={persons} /> : tab === "rules" ? <RulesView ops={ops} country={country} editable={editable} onNotice={setNotice} /> : (
        <>
          <div className="gr-filters">
            <label className="gr-search"><Search size={13} aria-hidden="true" /><input aria-label={tr("Search reviews")} placeholder={tr("Trip, name or words")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <select aria-label={tr("Who wrote it")} value={from} onChange={(e) => setFrom(e.target.value as typeof from)}><option value="all">{tr("Everyone")}</option><option value="rider">{tr("Riders about drivers")}</option><option value="driver">{tr("Drivers about riders")}</option></select>
            <select aria-label={tr("Stars")} value={stars} onChange={(e) => setStars(e.target.value as typeof stars)}><option value="all">{tr("Any stars")}</option><option value="low">{tr("1–2 stars")}</option><option value="mid">{tr("3 stars")}</option><option value="high">{tr("4–5 stars")}</option></select>
            <label className="check-chip"><input type="checkbox" checked={onlyHidden} onChange={(e) => setOnlyHidden(e.target.checked)} />{tr("Only hidden")}</label>
          </div>
          <label className="gr-field gr-reason">{tr("Moderation reason")}<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Why you hide or restore a review")} /></label>
          {shown.length ? (
            <ul className="gr-reviews" aria-label={tr("Reviews")}>
              {shown.slice(0, limit).map(({ review, state }) => {
                const result = moderateGrowth(store.value, review.id, !state.hidden, reason, agent?.id ?? "");
                return (
                  <li key={review.id} className={state.hidden ? "gr-review hidden" : "gr-review"}>
                    <div className="gr-review-head">
                      <Stars value={review.stars} />
                      <span>{trn("{0} about {1} {2}", <b>{review.byName}</b>, <b>{review.aboutName}</b>, <small>{review.from === "rider" ? tr("rider → driver") : tr("driver → rider")}</small>)}</span>
                      <span className={state.hidden ? "gr-state paused" : "gr-state active"}>{state.hidden ? (state.auto ? tr("Hidden by word list") : tr("Hidden")) : tr("Visible")}</span>
                    </div>
                    {review.text ? <p className="gr-review-text">{review.text}</p> : <p className="gr-help">{tr("No comment.")}</p>}
                    {review.tags.length ? <p className="gr-tags">{review.tags.map((tag) => <span key={tag}>{liveData ? ratingTagLabel(tag) : tag}</span>)}</p> : null}
                    <p className="gr-help"><Link to={`/trips/${review.tripId}`}>{review.tripId}</Link> · {new Date(review.at).toLocaleString(scope.market.locale, { dateStyle: "medium", timeStyle: "short", timeZone: scope.market.timeZone })}{liveData ? null : <>{" "}{trn("· Saved record: {0}", records.get(review.id) ?? tr("none"))}</>}</p>
                    <div className="actions">
                      {liveData ? <CommandButton command="admin.growthOps.moderate" className="dash-btn small ghost" targetId={review.id} scope={review.zone} confirmTarget={false} before={state.hidden ? "hidden" : "shown"} after={state.hidden ? "shown" : "hidden"} disabled={!editable} onDone={() => { setNotice(state.hidden ? tr("Shown again: it counts in the average.") : tr("Hidden: it no longer counts in the average.")); void liveRatings.refetch(); }}>{state.hidden ? tr("Restore") : tr("Hide")}</CommandButton> : <CommandButton command="admin.growthOps.moderate" className="dash-btn small ghost" targetId={review.id} scope={review.zone} sliceKey="growthOps" value={result.book} expectedSliceRev={store.value.draftRev} confirmTarget={false} disabled={store.loading || Boolean(result.error)} title={result.error} onDone={() => setNotice(tr("Moderation saved; original retained."))}>{state.hidden ? tr("Restore") : tr("Hide")}</CommandButton>}
                    </div>
                    {store.value.moderation[review.id]?.length ? <ul className="gr-events">{store.value.moderation[review.id].map((m, i) => <li key={i}>{m.at} · {m.actor} · {m.hidden ? tr("hide") : tr("restore")} · {m.reason}</li>)}</ul> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="dx-calm">{tr("No reviews match.")}</p>}
          {shown.length > limit ? <button data-command="admin.review.view" type="button" className="dash-btn small ghost" onClick={() => setLimit(limit + 30)}>{trn("Show more ({0} left)", shown.length - limit)}</button> : null}
        </>
      )}
    </div>
  );
}

function RulesView({ ops, country, editable, onNotice }: { ops: ReviewOps; country: keyof ReviewOps["rules"]; editable: boolean; onNotice: (text: string) => void }) {
  const [draft, setDraft] = useState<ReviewRules | null>(null);
  useDirtyWarning(Boolean(draft));
  const value = draft ?? ops.rules[country];
  const error = rulesError(value);
  const patch = (next: Partial<ReviewRules>) => setDraft({ ...value, ...next });
  const line = (key: "warn" | "review" | "block", label: string, help: string) => (
    <Row label={label} help={help} on={value[key].on} onToggle={(on) => patch({ [key]: { ...value[key], on } })} disabled={!editable}>
      <Num label={tr("{0} below", [label])} before="Below" value={value[key].below} step={0.1} min={1} max={5} disabled={!editable || !value[key].on} onChange={(below) => patch({ [key]: { ...value[key], below } })} />
    </Row>
  );
  return (
    <div className="gr-two">
      <Card title={tr("Low ratings")} icon={<ShieldAlert size={15} />} tone="orange" help={tr("What happens when a person's average falls under a line.")}>
        {line("warn", "Send a warning", "The person gets a message to improve.")}
        {line("review", "Admin review", "The person shows up for an admin to look at.")}
        {line("block", "Block", "The person cannot use the app until an admin lets them back.")}
        <Row label={tr("Count after")} help={tr("Only people with at least this many reviews.")}><Num label={tr("Minimum reviews")} value={value.minReviews} min={1} unit="reviews" disabled={!editable} onChange={(minReviews) => patch({ minReviews })} /></Row>
      </Card>
      <Card title={tr("Words and tags")} icon={<EyeOff size={15} />} tone="purple" help={tr("Comments with these words are hidden by themselves. An admin can restore them.")}>
        <Row label={tr("Hide bad words")}><Switch label={tr("Hide bad words")} on={value.badWords.on} disabled={!editable} onChange={(on) => patch({ badWords: { ...value.badWords, on } })} /></Row>
        <label className="gr-field"><span>{tr("Words, one per line")}</span><textarea aria-label={tr("Bad words")} value={value.badWords.words.join("\n")} disabled={!editable || !value.badWords.on} onChange={(e) => patch({ badWords: { ...value.badWords, words: e.target.value.split("\n") } })} /></label>
        <label className="gr-field"><span>{tr("Tags riders can give drivers, comma between")}</span><input aria-label={tr("Driver tags")} value={value.driverTags.join(", ")} disabled={!editable} onChange={(e) => patch({ driverTags: e.target.value.split(",").map((tag) => tag.trimStart()) })} /></label>
        <label className="gr-field"><span>{tr("Tags drivers can give riders, comma between")}</span><input aria-label={tr("Rider tags")} value={value.riderTags.join(", ")} disabled={!editable} onChange={(e) => patch({ riderTags: e.target.value.split(",").map((tag) => tag.trimStart()) })} /></label>
      </Card>
      <div className="gr-save">
        {error ? <p role="alert" className="gr-warn">{error}</p> : null}
        <CommandButton command="admin.review.rules" confirmTarget={false} className="dash-btn small" sliceKey={REVIEW_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, rules: { ...ops.rules, [country]: { ...value, badWords: { ...value.badWords, words: value.badWords.words.map((word) => word.trim()).filter(Boolean) }, driverTags: value.driverTags.map((tag) => tag.trim()).filter(Boolean), riderTags: value.riderTags.map((tag) => tag.trim()).filter(Boolean) } } }} expectedSliceRev={ops.draftRev} targetId={country} disabled={!editable || !draft || Boolean(error)} onDone={() => { setDraft(null); onNotice(tr("Review rules saved.")); }}>{tr("Save review rules")}</CommandButton>
        {draft ? <button data-command="admin.review.view" type="button" className="dash-btn small ghost" onClick={() => setDraft(null)}>{tr("Undo changes")}</button> : null}
      </div>
    </div>
  );
}

/** Live: the tag lists are fixed in the contract (contract.json#ratings.tags); the warning lines have no server source yet. */
function LiveRules() {
  return (
    <div className="gr-two" data-testid="live-review-rules">
      <Card title={tr("Low ratings")} icon={<ShieldAlert size={15} />} tone="orange" help={tr("What happens when a person's average falls under a line.")}>
        <NotConnected block />
      </Card>
      <Card title={tr("Words and tags")} icon={<EyeOff size={15} />} tone="purple" help={tr("The same tags in every country, set in the contract. Each app shows them in its own words.")}>
        <p className="gr-help">{tr("Tags riders can give drivers")}</p>
        <p className="gr-tags">{RATING_TAGS.aboutDriver.map((tag) => <span key={tag}>{ratingTagLabel(tag)}</span>)}</p>
        <p className="gr-help">{tr("Tags drivers can give riders")}</p>
        <p className="gr-tags">{RATING_TAGS.aboutRider.map((tag) => <span key={tag}>{ratingTagLabel(tag)}</span>)}</p>
        <p className="gr-help">{tr("Bad words list")}: <NotConnected /></p>
      </Card>
    </div>
  );
}
