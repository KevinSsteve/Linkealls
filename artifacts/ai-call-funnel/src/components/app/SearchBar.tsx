import { Search, X } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  placeholder = "Pesquisar...",
  ariaLabel = "Pesquisar",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="app-search">
      <Search size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-testid="input-search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="app-search-clear"
          aria-label="Limpar pesquisa"
          data-testid="button-clear-search"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}