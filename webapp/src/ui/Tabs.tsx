import type { ReactNode } from "react";
import { tr, trx } from "../i18n";

export type TabItem = {
  id: string;
  label: string;
};

type TabsProps = {
  tabs: readonly TabItem[] | readonly string[];
  activeId: string;
  onChange: (id: string) => void;
};

export function tabIdFromLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

function asItems(tabs: TabsProps["tabs"]): TabItem[] {
  return tabs.map((tab) =>
    typeof tab === "string" ? { id: tabIdFromLabel(tab), label: tab } : tab,
  );
}

export function Tabs({ tabs, activeId, onChange }: TabsProps) {
  const items = asItems(tabs);

  function selectTab(id: string) {
    onChange(id);
  }

  return (
    <div className="tabs" role="tablist" aria-label={tr("Record sections")}>
      {items.map((tab) => (
        <button
          data-command="admin.tabs.select"
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          tabIndex={tab.id === activeId ? 0 : -1}
          aria-selected={tab.id === activeId}
          onKeyDown={(event) => {
            const index=items.findIndex(x=>x.id===tab.id);
            const next=event.key==="ArrowRight"?(index+1)%items.length:event.key==="ArrowLeft"?(index+items.length-1)%items.length:event.key==="Home"?0:event.key==="End"?items.length-1:-1;
            if(next<0)return;event.preventDefault();selectTab(items[next].id);document.getElementById(`tab-${items[next].id}`)?.focus();
          }}
          aria-controls={`tabpanel-${tab.id}`}
          className={tab.id === activeId ? "active" : undefined}
          data-tab={tab.id}
          onClick={() => selectTab(tab.id)}
        >
          {trx(tab.label)}
        </button>
      ))}
    </div>
  );
}

type TabPanelProps = {
  id: string;
  activeId: string;
  children: ReactNode;
};

export function TabPanel({ id, activeId, children }: TabPanelProps) {
  const active = id === activeId;
  return (
    <div
      className={active ? "tab-panel active" : "tab-panel"}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      data-tab-panel={id}
      id={`tabpanel-${id}`}
      hidden={!active}
    >
      {children}
    </div>
  );
}
