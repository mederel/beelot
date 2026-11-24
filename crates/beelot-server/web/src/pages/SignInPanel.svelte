<script lang="ts">
  // Signing in with a passkey, or creating an account with one (US-084), after the warning that there is no recovery.
  import { Fingerprint, KeyRound, ShieldAlert } from "@lucide/svelte";
  import { slide } from "svelte/transition";
  import { t } from "$lib/i18n/i18n.svelte";
  import { ceremonyFailure, loadAccount, passkeysSupported, signInWithPasskey, signUpWithPasskey } from "$lib/stores/account.svelte";
  import Button from "$lib/ui/Button.svelte";

  let { warning = $bindable(false), ondone }: { warning?: boolean; ondone?: () => void } = $props();
  let status = $state("");
  let busy = $state(false);

  async function run(ceremony: () => Promise<void>) {
    status = "";
    busy = true;
    try {
      await ceremony();
    } catch (error) {
      status = t(ceremonyFailure(error));
      return;
    } finally {
      busy = false;
    }
    await loadAccount();
    ondone?.();
  }
</script>

<div class="panel">
  {#if passkeysSupported}
    <div class="buttons">
      <Button onclick={() => run(signInWithPasskey)} disabled={busy}><Fingerprint size={18} aria-hidden="true" />{t("Sign in with a passkey")}</Button>
      <Button variant="secondary" onclick={() => (warning = !warning)} disabled={busy} aria-expanded={warning} aria-controls="passkey-warning"><KeyRound size={18} aria-hidden="true" />{t("Create an account")}</Button>
    </div>
    {#if warning}
      <div class="warning" id="passkey-warning" transition:slide={{ duration: 220 }}>
        <ShieldAlert size={20} aria-hidden="true" />
        <div>
          <p>{t("Your passkey is the only way to sign in. If you lose it, you lose your account: there is no recovery.")}</p>
          <Button size="sm" onclick={() => run(signUpWithPasskey)} disabled={busy}>{t("I understand, create my passkey")}</Button>
        </div>
      </div>
    {/if}
  {:else}
    <p class="status">{t("Your browser does not support passkeys. You can still play as a guest.")}</p>
  {/if}
  <p class="status" role="status">{status}</p>
  <p class="privacy"><a class="link" href="/privacy">{t("How we handle your data")}</a></p>
</div>

<style>
  .panel {
    display: grid;
    gap: 0.75rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .warning {
    display: flex;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border-radius: 1rem;
    color: var(--color-honey-200);
    background: rgb(255 159 28 / 0.1);
    border: 1px solid rgb(255 159 28 / 0.3);
  }
  .warning p {
    margin-bottom: 0.6rem;
    font-size: 0.9rem;
  }
  .status {
    color: var(--color-muted);
    font-size: 0.9rem;
  }
  .status:empty {
    display: none;
  }
  .privacy {
    font-size: 0.85rem;
  }
  .privacy .link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
  }
</style>
