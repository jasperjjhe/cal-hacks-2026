import "./RoleSwitch.css";
import type { Role } from "./role.ts";

const options: { role: Role; label: string }[] = [
  { role: "buyer", label: "Buyer" },
  { role: "seller", label: "Seller" },
];

export default function RoleSwitch({
  role,
  onChange,
}: {
  role: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <div
      className={`role-switch is-${role}`}
      role="radiogroup"
      aria-label="Switch between buyer and seller views"
    >
      {options.map((option) => (
        <button
          key={option.role}
          type="button"
          role="radio"
          aria-checked={role === option.role}
          className={role === option.role ? "is-active" : undefined}
          onClick={() => onChange(option.role)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
