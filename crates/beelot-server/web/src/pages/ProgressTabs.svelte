<script lang="ts">
  import { t } from "$lib/i18n/i18n.svelte";
  let { current }: { current: "stats" | "leaderboard" } = $props();
</script>

<nav class="sub" aria-label={t("Progress")}>
  <a href="/stats" aria-current={current === "stats" ? "page" : undefined}>{t("My statistics")}</a>
  <a href="/leaderboard" aria-current={current === "leaderboard" ? "page" : undefined}>{t("Leaderboard")}</a>
</nav>

<style>
  .sub {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.3rem;
    border-radius: 99px;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.08);
  }
  /* The account button is fixed at the top right of every page: on a narrow screen the tabs start below it. */
  @media (max-width: 30rem) {
    .sub {
      margin-top: 2.5rem;
    }
  }
  a {
    padding: 0.75rem 1rem;
    border-radius: 99px;
    color: var(--color-muted);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
  }
  a[aria-current="page"] {
    color: #1b1203;
    background: var(--color-honey-400);
  }
</style>
