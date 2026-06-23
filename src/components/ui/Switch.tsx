export default function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`tap-scale relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-foreground" : "bg-border"
      }`}
    >
      <span
        className="absolute left-1 top-1 h-5 w-5 rounded-full bg-background shadow-soft transition-transform"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}
