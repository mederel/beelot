// The running version in the footer, linked to its release notes (US-131). A build outside a release (`dev`) is shown
// as text, with no link.
export function versionView(info: any): { text: string; href: string | null } | null {
  const version = typeof info?.version === "string" ? info.version.trim() : "";
  if (!version) return null;
  const text = version === "dev" ? "Beelot dev" : `Beelot v${version}`;
  const href = typeof info.releaseUrl === "string" && /^https?:\/\//.test(info.releaseUrl) ? info.releaseUrl : null;
  return { text, href };
}
