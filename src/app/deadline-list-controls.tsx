import type { ReceptionInformationType } from "@/domain/deadline";
import type { AppearanceFilters } from "@/lib/appearance-filters";
import { createDeadlineListViewHref, createDeadlineTypeHref, type DeadlineListView } from "@/lib/reception-presentation";

const views: Array<{ value: DeadlineListView; label: string }> = [
  { value: "active", label: "未終了" },
  { value: "ending", label: "締切・販売終了" },
  { value: "starting", label: "開始予定" },
  { value: "finished", label: "終了・完売・中止" },
  { value: "all", label: "すべて" },
];
const types: Array<{ value: ReceptionInformationType | null; label: string }> = [
  { value: null, label: "すべての種別" },
  { value: "online_sale", label: "通常通販" },
  { value: "ticket_application", label: "チケット申込" },
];

export function DeadlineListControls({ view, filters, currentSearchParams }: {
  view: DeadlineListView;
  filters: AppearanceFilters;
  currentSearchParams: string;
}) {
  return <div className="deadline-list-controls">
    <nav className="deadline-list-controls__row" aria-label="受付・販売の目的別表示">
      {views.map(option => <a key={option.value} className="deadline-filter-chip" href={createDeadlineListViewHref(currentSearchParams, option.value)} aria-current={view === option.value ? "page" : undefined}>{option.label}</a>)}
    </nav>
    <nav className="deadline-list-controls__row deadline-list-controls__row--types" aria-label="受付・販売の種別">
      <span className="deadline-list-controls__label">種別</span>
      {types.map(option => <a key={option.value ?? "all"} className="deadline-filter-chip" href={createDeadlineTypeHref(currentSearchParams, option.value)} aria-current={(filters.receptionType ?? null) === option.value ? "page" : undefined}>{option.label}</a>)}
      <span className="deadline-list-controls__hint">その他の種別は詳しく絞るから選べます</span>
    </nav>
  </div>;
}
