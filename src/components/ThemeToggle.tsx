import { Moon, Sun } from "lucide-react";
import { useTheme } from "../state/theme";
import { Button } from "./ui";

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const nextLabel = theme === "light" ? "Dark mode" : "Light mode";
  const Icon = theme === "light" ? Moon : Sun;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="w-full justify-start"
      aria-label={`Switch to ${nextLabel}`}
      title={`Switch to ${nextLabel}`}
    >
      <Icon className="w-4 h-4" />
      {nextLabel}
    </Button>
  );
}
