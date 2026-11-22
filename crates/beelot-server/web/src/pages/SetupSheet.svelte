<script lang="ts">
  // The setup sheet (US-118): one sheet for solo, pass-and-play and crew tables, opened by its routes over its tab's page.
  // It is filled with that mode's remembered choices (US-102) and the start button creates the game. Closing it puts the
  // address back on the page under it; nothing is sent until the player starts.
  import { ArrowRight, CircleHelp } from "@lucide/svelte";
  import { local } from "$lib/storage";
  import { slide } from "svelte/transition";
  import { api, setPrivateSession } from "$lib/api/client";
  import { t } from "$lib/i18n/i18n.svelte";
  import type { SetupMode } from "$lib/models/routes";
  import { createRequest, defaultTarget, loadSetup, saveSetup, setupBlocks, setupHome, setupPath, submitLabel, TARGETS, type Setup } from "$lib/models/setup-form";
  import { account, defaultPlayerName } from "$lib/stores/account.svelte";
  import { navigate, route } from "$lib/stores/router.svelte";
  import { openHelp } from "$lib/stores/sheets.svelte";
  import { formatNumber } from "$lib/i18n/i18n.svelte";
  import Avatar from "$lib/avatars/Avatar.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import Sheet from "$lib/ui/Sheet.svelte";

  let open = $state(false);
  let mode = $state<SetupMode>("solo");
  let setup = $state<Setup>(loadSetup(local, "solo"));
  let seats = $state(["", "", "", ""]);
  let owner = $state("");
  let message = $state("");
  let busy = $state(false);

  const blocks = $derived(setupBlocks(mode, setup.variant));

  // A route with the setup sheet opens it with that mode's remembered choices; already open, only the mode changes.
  $effect(() => {
    const current = route();
    if (current.sheet !== "setup") return;
    const wanted = current.params.mode ?? "solo";
    if (open) {
      mode = wanted;
      return;
    }
    mode = wanted;
    setup = loadSetup(local, wanted);
    owner = defaultPlayerName();
    message = "";
    open = true;
  });

  // The account's name fills an untouched name field once it is known (US-072).
  $effect(() => {
    if (account.name && (owner === "" || owner === t("Player"))) owner = account.name;
  });

  function changeMode(next: SetupMode) {
    history.replaceState({}, "", setupPath(next));
    mode = next;
    message = "";
  }

  function changeVariant(next: Setup["variant"]) {
    // A target still at the previous variant's default follows the new variant's default (US-130).
    if (setup.target === defaultTarget(setup.variant)) setup.target = defaultTarget(next);
    setup.variant = next;
  }

  function closed(reason: string) {
    if (reason === "closed" || reason === "back") navigate(setupHome(mode), { replace: true });
  }

  function whatIsThis() {
    open = false;
    openHelp({ onClose: () => (open = true) });
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = "";
    busy = true;
    const values = { ...setup, seats: [...seats], playerName: owner };
    try {
      const { variant, difficulty, announcements, allTrumps, target } = setup;
      saveSetup(local, mode, mode === "crew" ? { variant } : { variant, difficulty, announcements, allTrumps, target });
      const access = await api.createTable(createRequest(mode, values));
      if (mode === "crew") {
        setPrivateSession(access);
        navigate(`/online/private/table/${access.tableId}`);
      } else {
        navigate(`/play/bot/bidding/${access.tableId}`);
      }
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }

  const seatLabels = ["North", "East", "South", "West"];
  const onOff = $derived([
    { value: "on", label: t("On") },
    { value: "off", label: t("Off") }
  ]);
</script>

<Sheet bind:open labelledby="setup-title" onclose={closed}>
  <form class="setup" onsubmit={submit}>
    <header>
      <p class="eyebrow">{t("New game")}</p>
      <h2 id="setup-title">{t("Set up your table")}</h2>
    </header>

    <Segmented
      name="setup-mode"
      label={t("Mode")}
      bind:value={mode}
      onchange={changeMode}
      options={[
        { value: "solo", label: t("Solo") },
        { value: "pass", label: t("Pass and play") },
        { value: "crew", label: t("Crew") }
      ]}
    />

    <div class="variants" role="radiogroup" aria-label={t("Game variant")}>
      {#each [{ value: "CLASSIC", title: "Classic Belote", text: "Simple bid on the turned-up card" }, { value: "CONTREE", title: "Contrée", text: "Auction from 80 to 160, with coinche" }] as variant (variant.value)}
        <label class="variant" class:checked={setup.variant === variant.value}>
          <input type="radio" name="setup-variant" value={variant.value} checked={setup.variant === variant.value} onchange={() => changeVariant(variant.value as Setup["variant"])} />
          <strong>{t(variant.title)}</strong>
          <small>{t(variant.text)}</small>
        </label>
      {/each}
    </div>
    <button class="what" type="button" onclick={whatIsThis}><CircleHelp size={16} aria-hidden="true" />{t("Open the rules and card order")}</button>

    {#if blocks.seats}
      <fieldset class="seats" transition:slide={{ duration: 220 }}>
        <legend class="label">{t("Players")}</legend>
        <div class="seat-grid">
          {#each seatLabels as seat, index (seat)}
            <label class="seat">
              <span>{t(seat)}</span>
              <input class="field" autocomplete="off" maxlength="30" placeholder={t("Bot")} bind:value={seats[index]} name={seat.toLowerCase()} />
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

    {#if blocks.owner}
      <label class="owner" transition:slide={{ duration: 220 }}>
        <span class="label">{t("Your name")}</span>
        <input class="field" autocomplete="name" maxlength="30" required bind:value={owner} name="playerName" />
      </label>
    {/if}

    {#if blocks.bots}
      <div class="bots" role="radiogroup" aria-label={t("Bots")} transition:slide={{ duration: 220 }}>
        <span class="label">{t("Bots")}</span>
        <div class="bot-choices">
          {#each [{ value: "RELAXED", title: "Relaxed", text: "Play by the rules of thumb", faces: ["Camille", "Hugo"] }, { value: "CHALLENGING", title: "Challenging", text: "Think ahead before every card", faces: ["Manon", "Luc"] }] as level (level.value)}
            <label class="bot" class:checked={setup.difficulty === level.value}>
              <input type="radio" name="setup-difficulty" value={level.value} checked={setup.difficulty === level.value} onchange={() => (setup.difficulty = level.value as Setup["difficulty"])} />
              <span class="faces">{#each level.faces as face (face)}<Avatar name={face} size="2rem" expression={setup.difficulty === level.value ? "pleased" : "neutral"} />{/each}</span>
              <strong>{t(level.title)}</strong>
              <small>{t(level.text)}</small>
            </label>
          {/each}
        </div>
      </div>
    {/if}

    {#if blocks.rules}
      <details class="more" transition:slide={{ duration: 220 }}>
        <summary>{t("More rules")}</summary>
        <div class="more-body">
          <Segmented name="setup-target" label={t("Match target")} size="sm" bind:value={setup.target} options={TARGETS.map((value) => ({ value, label: formatNumber(value) }))} />
          <div>
            <Segmented name="setup-announcements" label={t("Announcements")} size="sm" value={setup.announcements ? "on" : "off"} onchange={(value) => (setup.announcements = value === "on")} options={onOff} />
            <p class="note">{t("Announcements are bonus combinations in your hand, such as tierce, cinquante, cent and carré, that score extra points when declared.")}</p>
          </div>
          {#if blocks.allTrumps}
            <Segmented name="setup-all-trumps" label={t("Tout-atout and sans-atout")} size="sm" value={setup.allTrumps ? "on" : "off"} onchange={(value) => (setup.allTrumps = value === "on")} options={onOff} />
          {/if}
        </div>
      </details>
    {/if}

    <p class="message" role="alert">{message}</p>
    <Button type="submit" size="lg" block {busy}>{t(submitLabel(mode))} <ArrowRight size={20} strokeWidth={2.6} aria-hidden="true" /></Button>
  </form>
</Sheet>

<style>
  .setup {
    display: grid;
    gap: 1.1rem;
  }
  header h2 {
    font-size: 1.75rem;
    font-weight: 750;
  }
  .variants,
  .bot-choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .variant,
  .bot {
    position: relative;
    display: grid;
    gap: 0.2rem;
    align-content: start;
    padding: 0.9rem;
    border-radius: 1.1rem;
    background: rgb(255 255 255 / 0.05);
    border: 1.5px solid rgb(255 255 255 / 0.1);
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s, transform 0.4s var(--ease-spring);
  }
  .variant:active,
  .bot:active {
    transform: scale(0.97);
  }
  .variant.checked,
  .bot.checked {
    background: rgb(255 194 46 / 0.12);
    border-color: var(--color-honey-400);
    box-shadow: 0 10px 30px -18px rgb(255 159 28 / 0.9);
  }
  .variant strong,
  .bot strong {
    font-family: var(--font-display);
    font-size: 1.05rem;
  }
  .variant small,
  .bot small {
    color: var(--color-muted);
    font-size: 0.8rem;
    line-height: 1.3;
  }
  .variant input,
  .bot input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .variant:has(input:focus-visible),
  .bot:has(input:focus-visible) {
    outline: 3px solid var(--color-honey-400);
    outline-offset: 2px;
  }
  .faces {
    display: flex;
    margin-bottom: 0.3rem;
  }
  .faces :global(svg + svg) {
    margin-left: -0.5rem;
  }
  .what {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    justify-self: start;
    margin-top: -0.5rem;
    color: var(--color-honey-300);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .seats {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .seat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .seat span {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-faint);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .more {
    border-radius: 1.1rem;
    background: rgb(255 255 255 / 0.04);
    border: 1px solid rgb(255 255 255 / 0.08);
  }
  .more summary {
    padding: 0.9rem 1rem;
    font-weight: 650;
    cursor: pointer;
    list-style-position: inside;
  }
  .more-body {
    display: grid;
    gap: 1rem;
    padding: 0 1rem 1rem;
  }
  .note {
    margin-top: 0.45rem;
    color: var(--color-faint);
    font-size: 0.8rem;
  }
</style>
