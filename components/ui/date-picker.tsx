import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function DatePicker({
  id,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label?: string }) {
  return (
    <div className="grid gap-1.5">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Input id={id} type="date" {...props} />
    </div>
  );
}
