<script lang="ts">
  // The account button at the top right of every page (US-200). A guest sees a "Sign in" pill that opens the sign-in panel of
  // the Me tab; a signed-in player sees a round icon named after the account. Nothing shows until the account has loaded.
  import { CircleUserRound } from "@lucide/svelte";
  import { t } from "$lib/i18n/i18n.svelte";
  import { account, signInRequest } from "$lib/stores/account.svelte";

  function askForSignIn() {
    signInRequest.open = true;
    signInRequest.signUp = false;
  }
</script>

{#if account.loaded}
  {#if account.signedIn}
    <a class="account round" href="/settings" aria-label={t("Signed in as {0}", account.name ?? t("Player"))} title={account.name ?? ""}>
      <CircleUserRound size={22} strokeWidth={2.2} aria-hidden="true" />
    </a>
  {:else}
    <a class="account pill" href="/settings" onclick={askForSignIn}>
      <CircleUserRound size={20} strokeWidth={2} aria-hidden="true" />
      <span>{t("Sign in")}</span>
    </a>
  {/if}
{/if}

<style>
  .account {
    position: fixed;
    z-index: 40;
    top: max(0.75rem, env(safe-area-inset-top));
    right: 0.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 2.5rem;
    border-radius: 99px;
    text-decoration: none;
    color: var(--color-ink);
    background: linear-gradient(180deg, rgb(32 28 62 / 0.78), rgb(16 14 32 / 0.86));
    border: 1px solid rgb(255 255 255 / 0.12);
    box-shadow: 0 10px 24px -10px rgb(0 0 0 / 0.8);
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
    transition: transform 0.3s var(--ease-spring);
  }
  .account:active {
    transform: scale(0.94);
  }
  .round {
    width: 2.5rem;
    color: var(--color-honey-300);
  }
  .pill {
    padding: 0 0.9rem 0 0.7rem;
    color: var(--color-honey-200);
    border-color: rgb(255 194 46 / 0.55);
    background: linear-gradient(180deg, rgb(255 194 46 / 0.22), rgb(255 159 28 / 0.1));
    font-size: 0.85rem;
    font-weight: 700;
  }
  .pill span {
    white-space: nowrap;
  }
  .account:focus-visible {
    outline: 2px solid var(--color-honey-300);
    outline-offset: 3px;
  }
  @media (min-width: 1024px) {
    .account {
      top: 1rem;
      right: 1.25rem;
    }
  }
</style>
