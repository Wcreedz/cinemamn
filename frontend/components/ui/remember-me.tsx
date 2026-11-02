export function RememberMe({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
      <input type="checkbox" className="size-4 cursor-pointer accent-ring" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Намайг сана
    </label>
  );
}
