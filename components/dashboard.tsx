export type Metric = { label: string; value: string; detail: string; tone?: "accent" | "good" | "warning" };

export function DashboardHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="live-indicator"><span />Live data</div></header>;
}

export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return <section className="metric-grid" aria-label="Key metrics">
    {metrics.map((metric) => <article className="metric-card" key={metric.label}>
      <div className="metric-top"><span>{metric.label}</span><span className={`metric-dot ${metric.tone || ""}`} /></div>
      <strong>{metric.value}</strong><small>{metric.detail}</small>
    </article>)}
  </section>;
}

export function DataPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="data-panel"><div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>{children}</section>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">↗</span><strong>{title}</strong><p>{message}</p></div>;
}
