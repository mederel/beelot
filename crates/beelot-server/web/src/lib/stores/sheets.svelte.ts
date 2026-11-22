// The help sheet (US-123) opens from a route (/rules), from the table's menu and from the setup sheet; it offers the hint
// when the table has one. The setup sheet is opened by its routes (US-118).
export const help = $state({
  open: false,
  routed: false,
  hint: null as null | (() => void),
  onClose: null as null | ((reason: string) => void)
});

export function openHelp({ hint = null, onClose = null }: { hint?: (() => void) | null; onClose?: ((reason: string) => void) | null } = {}): void {
  help.hint = hint;
  help.onClose = onClose;
  help.routed = false;
  help.open = true;
}
