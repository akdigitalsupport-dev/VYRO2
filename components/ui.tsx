import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`button button-${variant} ${className}`.trim()} type={type} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-select ${className}`.trim()} {...props}>{children}</select>;
}

export function Card({ title, description, action, children, className = "" }: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`data-panel ${className}`.trim()}>
      {(title || description || action) && <div className="panel-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warning" | "danger" }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

export function Alert({ children, tone = "notice", role }: { children: ReactNode; tone?: "notice" | "error" | "success"; role?: "status" | "alert" }) {
  return <p className={`ui-alert ui-alert-${tone}`} role={role ?? (tone === "error" ? "alert" : "status")}>{children}</p>;
}

export function DropdownMenu({ label, children }: { label: string; children: ReactNode }) {
  return <details className="ui-dropdown"><summary>{label}<span aria-hidden="true">⌄</span></summary><div className="ui-dropdown-panel">{children}</div></details>;
}

export function Skeleton({ className = "", label = "Loading" }: { className?: string; label?: string }) {
  return <span className={`ui-skeleton ${className}`.trim()} role="status" aria-label={label} />;
}

export function ErrorState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section className="error-state" role="alert"><span className="eyebrow">Something went wrong</span><h1>{title}</h1><p>{message}</p>{action}</section>;
}
