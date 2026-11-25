// Run by Lighthouse CI before each page (the `puppeteerScript` option): the solo table of the third page is the player's own, so the
// browser is given the resume record that the page writes when a table is made, and the other pages are measured as a new visitor sees them.
module.exports = async (browser, { url }) => {
  const page = await browser.newPage();
  const origin = new URL(url).origin;
  await page.goto(`${origin}/privacy-policy.json`, { waitUntil: "domcontentloaded" });
  const table = process.env.BEELOT_LH_TABLE_ID && url.includes(`/bidding/${process.env.BEELOT_LH_TABLE_ID}`);
  const record = JSON.stringify({ tableId: process.env.BEELOT_LH_TABLE_ID, playerToken: process.env.BEELOT_LH_TABLE_TOKEN });
  await page.evaluate(
    (resume, withTable) => {
      localStorage.clear();
      localStorage.setItem("beelot.language", "en");
      if (withTable) localStorage.setItem("beelot.resume", resume);
    },
    record,
    Boolean(table)
  );
  await page.close();
};
