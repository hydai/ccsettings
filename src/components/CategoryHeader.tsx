import { CATEGORY_META } from "../lib/categories";
import type { Category } from "../state/ui";
import { SectionLabel } from "./ui";

type Props = { category: Category };

export function CategoryHeader({ category }: Props) {
  const { label, description } = CATEGORY_META[category];
  return (
    <header className="flex items-end justify-between gap-10 mb-4">
      <div className="flex-1 min-w-0 space-y-2">
        <SectionLabel>§ {label.toUpperCase()}</SectionLabel>
        <h3 className="font-sans text-2xl font-semibold text-ink leading-tight">
          {label}
        </h3>
      </div>
      <p className="font-body text-sm leading-[1.55] text-body max-w-[480px] text-right">
        {description}
      </p>
    </header>
  );
}
