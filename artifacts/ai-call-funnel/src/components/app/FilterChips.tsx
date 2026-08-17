export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = "Filtros",
}: {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="app-chip-row" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            type="button"
            key={option.value}
            disabled={option.disabled}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`app-filter-chip${selected ? " is-selected" : ""}`}
            data-testid={`button-filter-${option.value}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}