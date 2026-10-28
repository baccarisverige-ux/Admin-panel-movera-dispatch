import { trn } from "../i18n";
export function ComingPage({ title, order }: { title: string; order: string }) {
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        <p>{trn("Coming in {0}. This screen is not the old demo page.", order)}</p>
      </div>
    </div>
  );
}
