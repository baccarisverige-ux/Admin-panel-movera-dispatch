import { useQuery } from "@tanstack/react-query";
import { tr, trn } from "../i18n";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { createDemoErrors, errorReportsPath, kindLabelKey, type ErrorGroup, type ErrorReport, type ErrorReportList } from "./errors";

/**
 * Contract v0.18.158 (contract.json#crashCatcher.admin.reports; owner 2026-11-24 "Add to admin all kind of crash"): the
 * detail of one crash group, its latest kept reports: native reason, device, OS, build, screen, stack and the last events
 * before the crash. Live: GET /admin/errors/{id}/reports; the demo build answers the same shape from example data.
 */
const demo = createDemoErrors();

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
const crumbType = (type: string) => ({ route: tr("Screen"), lifecycle: tr("App state"), platform: tr("Phone call failed"), network: tr("Network"), log: tr("Log") })[type] ?? type;

function Report({ report }: { report: ErrorReport }) {
  const facts: [string, string | undefined][] = [
    [tr("Reported"), when(report.at)],
    [tr("Kind"), tr(kindLabelKey(report.kind))],
    [tr("Version"), report.appVersion ? `${report.appVersion}${report.build ? ` (${report.build})` : ""}` : undefined],
    [tr("Device"), report.deviceModel],
    [tr("System"), report.osVersion],
    [tr("Screen"), report.screen],
    [tr("Trip"), report.tripId],
    [tr("Zone"), report.zoneId],
  ];
  return (
    <article className="errors-report" data-testid="error-report">
      <dl className="errors-facts">
        {facts.filter(([, value]) => value).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {report.nativeReason ? (
        <p className="errors-native">
          <strong>{tr("Native reason")}:</strong> {report.nativeReason.name}
          {report.nativeReason.reason ? ` — ${report.nativeReason.reason}` : ""}
        </p>
      ) : null}
      {typeof report.freezeMs === "number" ? <p className="errors-native">{trn("The screen froze for {0} s", Math.round(report.freezeMs / 100) / 10)}</p> : null}
      <h4>{tr("Last events before the crash")}</h4>
      {report.breadcrumbs.length ? (
        <ol className="errors-crumbs">
          {report.breadcrumbs.map((crumb, index) => (
            <li key={`${crumb.at}-${index}`}>
              <time>{new Date(crumb.at).toLocaleTimeString()}</time> <span className="errors-crumb-type">{crumbType(crumb.type)}</span> {crumb.message}
            </li>
          ))}
        </ol>
      ) : (
        <p className="dx-calm">{tr("No events kept.")}</p>
      )}
      {report.stack ? (
        <>
          <h4>{tr("Stack")}</h4>
          <pre className="errors-stack">{report.stack}</pre>
        </>
      ) : null}
    </article>
  );
}

export function ErrorReports({ group }: { group: ErrorGroup }) {
  const live = useLiveSessionMaybe();
  const reports = useQuery({
    queryKey: ["errors", "reports", live ? "live" : "demo", group.id],
    queryFn: async (): Promise<ErrorReportList> => (live ? live.client.json<ErrorReportList>(errorReportsPath(group.id)) : demo.reports(group.id)),
  });
  return (
    <div className="errors-detail" data-testid="error-detail">
      <h3>{tr("Latest reports")}</h3>
      {reports.isPending ? <p className="state-line">{tr("Loading.")}</p> : null}
      {reports.isError ? <p role="alert" className="dx-warn">{tr("Could not load the reports. Try again.")}</p> : null}
      {reports.isSuccess && reports.data.items.length === 0 ? <p className="dx-calm">{tr("No reports kept for this group.")}</p> : null}
      {reports.data?.items.map((report, index) => <Report key={`${report.at}-${index}`} report={report} />)}
    </div>
  );
}
