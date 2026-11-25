<script lang="ts">
  // The notes at the top of the page: offline (US-073), a slow or lost connection with "Reconnect now" (US-141, US-163),
  // the moves missed during a gap, and a friend's invitation with a one-tap join (US-070).
  import { WifiOff, RefreshCw, Mail } from "@lucide/svelte";
  import { fly } from "$lib/ui/motion";
  import { t } from "$lib/i18n/i18n.svelte";
  import { connection } from "$lib/stores/connection.svelte";
  import { friends, dismissInvite } from "$lib/stores/friends.svelte";

  let { onReconnect, onJoinInvite }: { onReconnect: () => void; onJoinInvite: (invite: { id: string; from: string; code: string }) => void } = $props();
</script>

<div class="banners">
  {#if friends.invite}
    {@const invite = friends.invite}
    <div class="banner invite glass" role="status" transition:fly={{ y: -24, duration: 300 }}>
      <Mail size={18} aria-hidden="true" />
      <span>{t("{0} invites you to a table.", invite.from)}</span>
      <span class="actions">
        <button class="pill strong" type="button" onclick={() => onJoinInvite(invite)}>{t("Join")}</button>
        <button class="pill" type="button" onclick={() => dismissInvite(invite)}>{t("Dismiss")}</button>
      </span>
    </div>
  {/if}
  {#if connection.offline}
    <p class="banner warn" role="status" transition:fly={{ y: -24, duration: 300 }}><WifiOff size={18} aria-hidden="true" /> {t("You are offline. Games need a connection; the rules and the tutorial still work.")}</p>
  {:else if connection.trouble}
    <p class="banner warn" role="status" transition:fly={{ y: -24, duration: 300 }}>
      <RefreshCw size={18} class="spin" aria-hidden="true" />
      <span>{t("The connection is slow or lost. Retrying…")}</span>
      {#if connection.reconnect.visible}
        <button class="pill strong" type="button" disabled={connection.reconnect.disabled} onclick={onReconnect}>{t("Reconnect now")}</button>
      {/if}
    </p>
  {/if}
  <p class="banner info" role="status" aria-live="polite" hidden={!connection.missed}>
    {connection.missed ? t(connection.missed.key).replace("{n}", String(connection.missed.n)) : ""}
  </p>
</div>

<style>
  .banners {
    position: fixed;
    z-index: 60;
    top: max(0.6rem, env(safe-area-inset-top));
    left: 50%;
    translate: -50% 0;
    display: grid;
    gap: 0.5rem;
    width: min(34rem, calc(100% - 1.5rem));
    pointer-events: none;
  }
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem;
    border-radius: 1.1rem;
    font-size: 0.9rem;
    font-weight: 500;
    pointer-events: auto;
    box-shadow: 0 14px 30px -12px rgb(0 0 0 / 0.8);
  }
  .warn {
    color: #2b1600;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
  }
  .info {
    color: var(--color-ink);
    background: rgb(109 77 255 / 0.9);
  }
  .invite {
    color: var(--color-ink);
  }
  .actions {
    display: inline-flex;
    gap: 0.4rem;
    margin-left: auto;
  }
  .pill {
    min-height: 2.25rem;
    padding: 0 0.9rem;
    border-radius: 99px;
    font-weight: 650;
    background: rgb(0 0 0 / 0.15);
  }
  .invite .pill {
    background: rgb(255 255 255 / 0.1);
  }
  .pill.strong {
    color: #1b1203;
    background: var(--color-honey-400);
  }
  .warn .pill.strong {
    color: var(--color-honey-200);
    background: #2b1600;
  }
  .banner :global(.spin) {
    animation: spin 1.4s linear infinite;
  }
</style>
