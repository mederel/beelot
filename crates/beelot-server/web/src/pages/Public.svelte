<script lang="ts">
  // Find a game (US-021): pick a variant and the server seats the player at an open table; bots take the empty seats after
  // a minute. A seat still held from an earlier visit is given up first.
  import { ArrowRight, Radar } from "@lucide/svelte";
  import { api, forgetTableSession, getPrivateSession, setPrivateSession } from "$lib/api/client";
  import { t } from "$lib/i18n/i18n.svelte";
  import { account, defaultPlayerName } from "$lib/stores/account.svelte";
  import { navigate } from "$lib/stores/router.svelte";
  import { notices } from "$lib/stores/notices.svelte";
  import Button from "$lib/ui/Button.svelte";
  import { keepInView } from "$lib/ui/keepInView";
  import Segmented from "$lib/ui/Segmented.svelte";

  let name = $state(defaultPlayerName());
  let variant = $state<"CLASSIC" | "CONTREE" | "BELA" | "BULGARIAN" | "KLABERJASS">("CLASSIC");
  let busy = $state(false);
  let message = $state(notices.take("/online/public"));

  $effect(() => {
    if (account.name && (name === "" || name === t("Player"))) name = account.name;
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    message = "";
    try {
      const previous = getPrivateSession();
      if (previous) {
        await api.act(previous.tableId, { type: "leave" }).catch(() => {});
        forgetTableSession(previous.tableId);
        setPrivateSession(null);
      }
      const access = await api.quickMatch(variant, name);
      setPrivateSession(access);
      navigate(`/online/public/table/${access.tableId}`);
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="page public">
  <header class="head">
    <p class="eyebrow">{t("Strangers welcome")}</p>
    <h1 class="page-title">{t("Find a game.")}</h1>
    <p class="lead">{t("Pick a variant and we'll seat you at an open table. If it isn't full within a minute, bots take the empty seats.")}</p>
  </header>

  <form class="card glass" onsubmit={submit} use:keepInView>
    <div class="radar" aria-hidden="true"><span></span><span></span><span></span><Radar size={34} /></div>
    <h2>{t("Quick match")}</h2>
    <label>
      <span class="label">{t("Your name")}</span>
      <input class="field" autocomplete="name" maxlength="30" name="playerName" required bind:value={name} />
    </label>
    <Segmented name="public-variant" label={t("Game variant")} bind:value={variant} options={[{ value: "CLASSIC", label: t("Classic Belote") }, { value: "CONTREE", label: t("Contrée") }, { value: "BELA", label: t("Bela") }, { value: "BULGARIAN", label: t("Bulgarian Belot") }, { value: "KLABERJASS", label: t("Klaberjass") }]} />
    <p class="message" role="alert">{message}</p>
    <Button type="submit" size="lg" block {busy}>{t("Find a game")} <ArrowRight size={18} aria-hidden="true" /></Button>
  </form>
</div>

<style>
  .public {
    display: grid;
    gap: 1.25rem;
    max-width: 40rem;
  }
  .head {
    display: grid;
    gap: 0.6rem;
  }
  .lead {
    color: var(--color-muted);
  }
  .card {
    position: relative;
    display: grid;
    gap: 1rem;
    padding: 1.5rem 1.25rem;
    border-radius: 1.6rem;
    overflow: hidden;
  }
  h2 {
    font-size: 1.35rem;
    font-weight: 700;
  }
  .radar {
    position: relative;
    display: grid;
    place-items: center;
    width: 4.5rem;
    height: 4.5rem;
    color: var(--color-violet-300);
  }
  .radar span {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid rgb(164 139 255 / 0.5);
    opacity: 0;
  }
  :global([data-effects="full"]) .radar span {
    animation: ping 2.4s ease-out infinite;
  }
  .radar span:nth-child(2) {
    animation-delay: 0.8s;
  }
  .radar span:nth-child(3) {
    animation-delay: 1.6s;
  }
  @keyframes ping {
    0% { scale: 0.4; opacity: 0.9; }
    100% { scale: 1.6; opacity: 0; }
  }
</style>
