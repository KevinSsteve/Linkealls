import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface EditorSectionProps {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
  status?: ReactNode;
}

/**
 * A deliberately quiet section primitive for owner configuration screens.
 * It keeps the heading/action relationship consistent without adding a card
 * around every small control.
 */
export function EditorSection({
  id,
  title,
  description,
  action,
  children,
  open,
  onToggle,
  collapsible: collapsibleProp = false,
  defaultOpen = true,
  status,
}: EditorSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const collapsible = Boolean(onToggle || collapsibleProp);
  const isOpen = open ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((value) => !value));

  return (
    <section
      className="overflow-hidden border-b border-[var(--border-soft)] bg-[var(--surface)]"
      data-testid={`editor-section-${id}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3 px-5 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {collapsible ? (
              <button
                type="button"
                onClick={toggle}
                className="flex min-w-0 items-center gap-2 text-left"
                aria-expanded={isOpen}
                aria-controls={`editor-section-content-${id}`}
                data-testid={`toggle-editor-section-${id}`}
              >
                <ChevronDown
                  size={17}
                  className={`shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                  style={{ color: "var(--ink-faint)" }}
                />
                <span className="min-w-0 break-words text-[16px] font-semibold leading-tight text-[var(--ink)]">
                  {title}
                </span>
              </button>
            ) : (
              <h2 className="min-w-0 break-words text-[16px] font-semibold leading-tight text-[var(--ink)]">
                {title}
              </h2>
            )}
            {status}
          </div>
          {description && (
            <p className="mt-1.5 max-w-[34rem] break-words text-[13px] leading-relaxed text-[var(--ink-soft)]">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {isOpen && (
        <div id={`editor-section-content-${id}`} className="px-5 pb-5">
          {children}
        </div>
      )}
    </section>
  );
}