// The privacy policy page (US-129). The text lives in /privacy-policy.json, in the three languages; the operator's own
// values (controller, contact, host, backups) come from the server and fill its {placeholders}.
const POLICY_PLACEHOLDERS = ["controller", "contact", "hosting", "hostingAgreement", "backupDays"];

type Entry = Record<string, string>;

export function policyText(entry: Entry, language: string): string {
  return entry[language] ?? entry.en;
}

export function policyValues(policy: any, info: any, notConfigured: string): Record<string, unknown> {
  const values: Record<string, unknown> = { ...policy.retention, version: policy.version };
  const given: Record<string, unknown> = {
    controller: info?.controller,
    contact: info?.contact,
    hosting: info?.hostingProvider,
    hostingAgreement: info?.hostingAgreement,
    backupDays: info?.backupRetentionDays
  };
  for (const name of POLICY_PLACEHOLDERS) values[name] = given[name] ?? notConfigured;
  return values;
}

export function fillPolicy(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}

export interface PolicyView {
  title: string;
  intro: string;
  sections: { id: string; heading: string; paragraphs: string[]; items: string[] }[];
}

// The page as blocks, every text filled in. Text only: nothing from the answer becomes markup.
export function policyView(policy: any, info: any, language: string, notConfigured: string): PolicyView {
  const values = policyValues(policy, info, notConfigured);
  const fill = (entry: Entry) => fillPolicy(policyText(entry, language), values);
  return {
    title: fill(policy.title),
    intro: fill(policy.intro),
    sections: policy.sections.map((section: any, index: number) => ({
      id: section.id,
      heading: `${index + 1}. ${fill(section.heading)}`,
      paragraphs: section.paragraphs.map(fill),
      items: section.items.map(fill)
    }))
  };
}
