export type TabItem = {
  id: string
  label: string
}

export function ReportTabs({ tabs, active, onChange, className = '' }: { tabs: TabItem[]; active: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={`report-tabs ${className}`}>
      {tabs.map((tab) => (
        <button
          type="button"
          className={active === tab.id ? 'report-tab active' : 'report-tab'}
          key={tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
