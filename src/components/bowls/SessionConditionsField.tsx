import { Label } from "@/components/ui/label";

export const CONDITION_OPTIONS = [
  "Indoor",
  "Dry",
  "Wet",
  "Light wind",
  "Strong wind",
  "Blustery wind",
] as const;

export const GREEN_TYPE_OPTIONS = ["Grass", "Artificial"] as const;
export type GreenType = (typeof GREEN_TYPE_OPTIONS)[number];

type Props = {
  conditions: string[];
  onConditionsChange: (next: string[]) => void;
  greenType: GreenType | "";
  onGreenTypeChange: (next: GreenType | "") => void;
};

export function SessionConditionsField({
  conditions,
  onConditionsChange,
  greenType,
  onGreenTypeChange,
}: Props) {
  function toggle(opt: string) {
    if (conditions.includes(opt)) onConditionsChange(conditions.filter((c) => c !== opt));
    else onConditionsChange([...conditions, opt]);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Conditions (select all that apply)</Label>
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_OPTIONS.map((opt) => {
            const active = conditions.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  active
                    ? "bt-gradient-primary text-white bt-shadow-card"
                    : "bg-secondary text-charcoal"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Green type</Label>
        <div className="grid grid-cols-2 gap-2">
          {GREEN_TYPE_OPTIONS.map((opt) => {
            const active = greenType === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onGreenTypeChange(active ? "" : opt)}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                  active
                    ? "bt-gradient-primary text-white bt-shadow-card"
                    : "bg-secondary text-charcoal"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
