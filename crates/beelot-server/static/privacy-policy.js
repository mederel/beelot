// The privacy policy page (US-129). The text lives in one file, /privacy-policy.json, in the three languages; the
// operator's own values (controller, contact, host, backups) come from the server and fill its {placeholders}.

const POLICY_PLACEHOLDERS = ["controller", "contact", "hosting", "hostingAgreement", "backupDays"];

// The text in `language`, English when that language has none.
function policyText(entry, language) {
  return entry[language] ?? entry.en;
}

// The values behind the placeholders: the policy's own numbers, its version, and the server's answer, where a value
// that is not set reads `notConfigured`.
function policyValues(policy, info, notConfigured) {
  const values = { ...policy.retention, version: policy.version };
  const given = {
    controller: info?.controller,
    contact: info?.contact,
    hosting: info?.hostingProvider,
    hostingAgreement: info?.hostingAgreement,
    backupDays: info?.backupRetentionDays
  };
  for (const name of POLICY_PLACEHOLDERS) values[name] = given[name] ?? notConfigured;
  return values;
}

function fillPolicy(text, values) {
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}

// The page as a list of blocks: { id, heading, paragraphs, items }, every text filled in.
function policyView(policy, info, language, notConfigured) {
  const values = policyValues(policy, info, notConfigured);
  const fill = (entry) => fillPolicy(policyText(entry, language), values);
  return {
    title: fill(policy.title),
    intro: fill(policy.intro),
    sections: policy.sections.map((section, index) => ({
      id: section.id,
      heading: `${index + 1}. ${fill(section.heading)}`,
      paragraphs: section.paragraphs.map(fill),
      items: section.items.map(fill)
    }))
  };
}

// Draws the blocks into `target`, replacing what was there. Text only: nothing from the answer becomes markup.
function renderPolicy(view, target, doc) {
  target.textContent = "";
  const intro = doc.createElement("p");
  intro.textContent = view.intro;
  target.append(intro);
  for (const block of view.sections) {
    const section = doc.createElement("section");
    section.id = `privacy-${block.id}`;
    const heading = doc.createElement("h2");
    heading.textContent = block.heading;
    section.append(heading);
    for (const text of block.paragraphs) {
      const paragraph = doc.createElement("p");
      paragraph.textContent = text;
      section.append(paragraph);
    }
    if (block.items.length) {
      const list = doc.createElement("ul");
      for (const text of block.items) {
        const item = doc.createElement("li");
        item.textContent = text;
        list.append(item);
      }
      section.append(list);
    }
    target.append(section);
  }
}

if (typeof module !== "undefined") module.exports = { policyText, policyValues, fillPolicy, policyView, renderPolicy };
