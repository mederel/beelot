<script lang="ts">
  // Me (US-117): the account and its passkey (US-084), the display name (US-072), every setting of the device, the
  // leaderboard visibility, and "Your data": download it or delete the account (US-081, US-082).
  import { BarChart3, Download, LogOut, Trash2, Trophy, UserRound, Lock } from "@lucide/svelte";
  import { slide } from "$lib/ui/motion";
  import { apiResponse } from "$lib/api/client";
  import { sfx } from "$lib/audio/sfx";
  import { vibrationSupported } from "$lib/fx/haptics";
  import { LANGUAGES, language, setLanguage, t, type Language } from "$lib/i18n/i18n.svelte";
  import { checkDisplayName } from "$lib/models/small";
  import { ALL_THEMES, LOCKED_THEMES, THEME_NAMES } from "$lib/models/prefs";
  import { account, loadAccount, saveDisplayName, setBoardVisible, signInRequest, signInWithPasskey, ceremonyFailure, signOut } from "$lib/stores/account.svelte";
  import { navigate } from "$lib/stores/router.svelte";
  import { setBotComments, setEffects, setMusic, setMusicVolume, setPace, setReactions, setSound, setTheme, setVibrationSetting, settings } from "$lib/stores/settings.svelte";
  import Button from "$lib/ui/Button.svelte";
  import { keepInView } from "$lib/ui/keepInView";
  import Segmented from "$lib/ui/Segmented.svelte";
  import Switch from "$lib/ui/Switch.svelte";
  import CardBack from "$lib/cards/CardBack.svelte";
  import SignInPanel from "./SignInPanel.svelte";

  let signInOpen = $state(signInRequest.open);
  let signUpWarning = $state(signInRequest.signUp);
  signInRequest.open = false;
  signInRequest.signUp = false;

  let displayName = $state(account.name ?? "");
  let nameStatus = $state("");
  let exportMessage = $state("");
  let deleting = $state(false);
  let deleteWord = $state("");
  let deleteMessage = $state("");
  let deleteBusy = $state(false);

  $effect(() => {
    if (account.name) displayName = account.name;
  });

  const languageNames: Record<Language, string> = { en: "English", fr: "Français", nl: "Nederlands", hr: "Hrvatski", bg: "Български", hy: "Հայերեն" };

  async function saveName(event: SubmitEvent) {
    event.preventDefault();
    const checked = checkDisplayName(displayName);
    if (!checked.ok) {
      nameStatus = t(checked.message);
      return;
    }
    try {
      await saveDisplayName(checked.name);
      nameStatus = t("Name saved.");
    } catch (error) {
      nameStatus = (error as Error).message;
    }
  }

  function attachmentName(response: Response): string {
    const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
    return match ? match[1] : "beelot-data.json";
  }

  async function exportData(event: MouseEvent) {
    event.preventDefault();
    exportMessage = "";
    try {
      const response = await apiResponse("/api/account/export");
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        exportMessage = t("You can download your data again in {0} minutes.", body.minutesLeft ?? 60);
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachmentName(response);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      exportMessage = t("Something went wrong. Please try again.");
    }
  }

  async function deleteAccount() {
    deleteMessage = "";
    deleteBusy = true;
    try {
      const response = await apiResponse("/api/account", { method: "DELETE" });
      if (response.status === 204) {
        deleting = false;
        navigate("/");
        await loadAccount();
        account.notice = t("Your account has been deleted.");
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (response.status === 403 && body.reason === "reauthenticate") {
        deleteMessage = t("For your safety, sign in again to delete your account.");
        try {
          await signInWithPasskey();
        } catch (error) {
          deleteMessage = t(ceremonyFailure(error));
          return;
        }
        await loadAccount();
        deleteWord = "";
        return;
      }
      throw new Error(String(response.status));
    } catch {
      deleteMessage = t("Something went wrong. Please try again.");
    } finally {
      deleteBusy = false;
    }
  }

  const themeOptions = $derived(
    ALL_THEMES.map((theme) => {
      const locked = Object.hasOwn(LOCKED_THEMES, theme) && !settings.unlocked.includes(theme);
      return { value: theme, label: t(THEME_NAMES[theme]), disabled: locked, hint: locked ? t("Locked: {0}", t(LOCKED_THEMES[theme].hint)) : undefined };
    })
  );
</script>

<div class="page settings">
  <header class="head">
    <p class="eyebrow">{t("Preferences")}</p>
    <h1 class="page-title">{t("Settings")}</h1>
  </header>

  {#if account.notice}<p class="notice" role="status">{account.notice}</p>{/if}

  {#if account.loaded}
    <section class="card glass account">
      {#if account.signedIn}
        <div class="who">
          <span class="avatar"><UserRound size={24} aria-hidden="true" /></span>
          <div><strong>{t("Signed in as {0}", account.name ?? "")}</strong></div>
        </div>
        <form class="name-form" onsubmit={saveName} use:keepInView>
          <label>
            <span class="label">{t("Display name")}</span>
            <small class="hint">{t("The name other players see at tables, in your history and on the leaderboard.")}</small>
            <span class="name-row">
              <input class="field" maxlength="60" autocomplete="nickname" bind:value={displayName} />
              <Button type="submit" variant="secondary">{t("Save name")}</Button>
            </span>
          </label>
          <p class="hint" role="status">{nameStatus}</p>
        </form>
        <div class="links">
          <Button variant="secondary" size="sm" href="/stats"><BarChart3 size={16} aria-hidden="true" />{t("My statistics")}</Button>
          <Button variant="secondary" size="sm" href="/leaderboard"><Trophy size={16} aria-hidden="true" />{t("Leaderboard")}</Button>
          <Button variant="ghost" size="sm" onclick={signOut}><LogOut size={16} aria-hidden="true" />{t("Sign out")}</Button>
        </div>
      {:else}
        <div class="who">
          <span class="avatar guest"><UserRound size={24} aria-hidden="true" /></span>
          <div>
            <strong>{t("Sign in to keep track of your matches.")}</strong>
          </div>
          <Button variant="secondary" size="sm" onclick={() => (signInOpen = !signInOpen)} aria-expanded={signInOpen} aria-controls="sign-in-panel">{t("Sign in")}</Button>
        </div>
        {#if signInOpen}
          <div id="sign-in-panel" transition:slide={{ duration: 220 }}><SignInPanel bind:warning={signUpWarning} ondone={() => (signInOpen = false)} /></div>
        {/if}
      {/if}
    </section>
  {/if}

  <section class="card glass">
    <h2>{t("Look and feel")}</h2>
    <Segmented name="language" label={t("Language")} value={language()} onchange={(value) => setLanguage(value as Language)} options={LANGUAGES.map((lang) => ({ value: lang, label: languageNames[lang] }))} />
    <div class="themes">
      <span class="label" id="theme-label">{t("Table theme")}</span>
      <small class="hint">{t("Choose the colours of the table and the card back.")}</small>
      <div class="theme-grid" role="radiogroup" aria-labelledby="theme-label">
        {#each themeOptions as option (option.value)}
          <label class="theme" class:checked={settings.theme === option.value} class:locked={option.disabled} data-theme={option.value}>
            <input type="radio" name="theme" value={option.value} checked={settings.theme === option.value} disabled={option.disabled} onchange={() => { setTheme(option.value); sfx.play("tap"); }} />
            <span class="swatch"><CardBack /></span>
            <strong>{option.label}</strong>
            {#if option.hint}<small><Lock size={12} aria-hidden="true" /> {option.hint}</small>{/if}
          </label>
        {/each}
      </div>
    </div>
    <Segmented name="effects" label={t("Effects")} value={settings.effects} onchange={setEffects} options={[{ value: "full", label: t("Full") }, { value: "reduced", label: t("Reduced") }, { value: "off", label: t("No effects") }]} />
    <Segmented name="pace" label={t("Pace")} value={settings.pace} onchange={setPace} options={[{ value: "relaxed", label: t("Relaxed") }, { value: "normal", label: t("Normal") }, { value: "quick", label: t("Quick") }]} />
    <small class="hint">{t("Choose how fast the bots play and the table moves.")}</small>
  </section>

  <section class="card glass">
    <h2>{t("Sound")}</h2>
    <Switch label={t("Sound effects")} hint={t("Enable optional game sounds.")} checked={settings.sound} onchange={(on) => { setSound(on); if (on) sfx.play("bid"); }} />
    <Switch label={t("Music")} hint={t("Play a tune that matches the table theme while you play.")} checked={settings.music} onchange={setMusic} />
    {#if settings.music}
      <div transition:slide={{ duration: 200 }}>
        <Segmented name="music-volume" label={t("Music volume")} size="sm" value={settings.musicVolume} onchange={setMusicVolume} options={[{ value: "low", label: t("Low") }, { value: "medium", label: t("Medium") }, { value: "high", label: t("High") }]} />
      </div>
    {/if}
    {#if vibrationSupported}
      <Switch label={t("Vibration")} hint={t("A short buzz when a card is played or a trick is won.")} checked={settings.vibration} onchange={setVibrationSetting} />
    {/if}
  </section>

  <section class="card glass">
    <h2>{t("At the table")}</h2>
    <Switch label={t("Reactions")} hint={t("Send and see quick reactions at online tables.")} checked={settings.reactions} onchange={setReactions} />
    <Switch label={t("Bot comments")} hint={t("Bots comment on the game.")} checked={settings.botComments} onchange={setBotComments} />
    {#if account.signedIn && account.boardVisible !== null}
      <Switch label={t("Show me on the leaderboard")} hint={t("Other players can see your name, rating and rank.")} checked={account.boardVisible} onchange={setBoardVisible} />
    {/if}
    <p class="hint">{t("Cards always use both a suit symbol and colour. Controls support touch and keyboard use.")}</p>
  </section>

  {#if account.signedIn}
    <section class="card glass">
      <h2>{t("Your data")}</h2>
      <p class="hint">{t("Download a copy of what Beelot keeps about you, or delete your account.")}</p>
      <div class="links">
        <Button variant="secondary" href="/api/account/export" download onclick={exportData}><Download size={16} aria-hidden="true" />{t("Download my data")}</Button>
        <Button variant="ghost" onclick={() => { deleting = true; deleteWord = ""; deleteMessage = ""; }}><Trash2 size={16} aria-hidden="true" />{t("Delete my account")}</Button>
      </div>
      <p class="hint" role="status">{exportMessage}</p>
      {#if deleting}
        <div class="danger" transition:slide={{ duration: 220 }}>
          <p>{t("Your account, your passkey and your sign-in history will be deleted. Finished matches stay in other players' history, shown as “Deleted player”.")}</p>
          <label>
            <span>{t("Type this word to confirm:")} <strong>{t("DELETE")}</strong></span>
            <input class="field" autocapitalize="characters" autocomplete="off" spellcheck="false" bind:value={deleteWord} />
          </label>
          <div class="links">
            <Button variant="danger" disabled={deleteWord.trim().toLocaleUpperCase() !== t("DELETE")} busy={deleteBusy} onclick={deleteAccount}>{t("Delete my account for good")}</Button>
            <Button variant="ghost" onclick={() => (deleting = false)}>{t("Cancel")}</Button>
          </div>
        </div>
      {/if}
      <p class="message" role="alert">{deleteMessage}</p>
    </section>
  {/if}

  <p class="footer"><a class="link" href="/privacy">{t("Privacy policy")}</a></p>
</div>

<style>
  .settings {
    display: grid;
    gap: 1rem;
    max-width: 46rem;
  }
  .head {
    display: grid;
    gap: 0.6rem;
  }
  .notice {
    padding: 0.8rem 1rem;
    border-radius: 1rem;
    background: rgb(79 240 189 / 0.12);
    color: var(--color-mint-400);
    font-weight: 600;
  }
  .card {
    display: grid;
    gap: 1.1rem;
    padding: 1.25rem;
    border-radius: 1.5rem;
  }
  .card h2 {
    font-size: 1.15rem;
    font-weight: 700;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .who > div {
    flex: 1;
    /* the name has no space to break at and may be 30 characters long (US-204) */
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    color: #1b1203;
    background: linear-gradient(140deg, var(--color-honey-300), var(--color-honey-600));
  }
  .avatar.guest {
    color: var(--color-muted);
    background: rgb(255 255 255 / 0.08);
  }
  .hint {
    display: block;
    color: var(--color-faint);
    font-size: 0.84rem;
  }
  .hint:empty {
    display: none;
  }
  .name-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .name-row .field {
    flex: 1 1 10rem;
    min-width: 0;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
    gap: 0.6rem;
    margin-top: 0.6rem;
  }
  .theme {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.6rem 0.4rem;
    border-radius: 1rem;
    border: 1.5px solid rgb(255 255 255 / 0.08);
    background: rgb(255 255 255 / 0.03);
    cursor: pointer;
    text-align: center;
    transition: border-color 0.2s, transform 0.4s var(--ease-spring);
  }
  .theme:active {
    transform: scale(0.96);
  }
  .theme.checked {
    border-color: var(--color-honey-400);
    background: rgb(255 194 46 / 0.1);
  }
  .theme.locked {
    cursor: not-allowed;
  }
  .theme.locked .swatch {
    filter: grayscale(0.85) brightness(0.6);
  }
  .theme input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: inherit;
  }
  .theme:has(input:focus-visible) {
    outline: 3px solid var(--color-honey-400);
    outline-offset: 2px;
  }
  .swatch {
    --cw: 2.8rem;
  }
  .theme strong {
    font-size: 0.85rem;
  }
  .theme small {
    color: var(--color-faint);
    font-size: 0.68rem;
    line-height: 1.2;
  }
  .danger {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 1rem;
    background: rgb(255 92 122 / 0.08);
    border: 1px solid rgb(255 92 122 / 0.3);
  }
  .danger label span {
    display: block;
    margin-bottom: 0.4rem;
  }
  .footer {
    text-align: center;
  }
  .footer .link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
  }
</style>
