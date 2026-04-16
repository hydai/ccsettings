import { CATEGORY_META } from "../lib/categories";
import type { Category } from "../state/ui";

type Props = { category: Category };

export function CategoryHeader({ category }: Props) {
  const { label, description } = CATEGORY_META[category];
  return (
    <header className="mb-4">
      <h3 className="text-lg font-semibold">{label}</h3>
      <p className="text-sm text-muted mt-0.5 max-w-prose">{description}</p>
    </header>
  );
}
