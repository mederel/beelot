<script lang="ts">
  // The back of a card: a honeycomb in the table theme's colours with the bee in a hexagon. The size comes from `--cw`.
</script>

<div class="back" aria-hidden="true">
  <span class="emblem">
    <svg viewBox="0 0 40 40">
      <path class="hexagon" d="M20 2l15.6 9v18L20 38 4.4 29V11z" />
      <ellipse class="wing" cx="14" cy="15" rx="5" ry="7" transform="rotate(-30 14 15)" />
      <ellipse class="wing" cx="26" cy="15" rx="5" ry="7" transform="rotate(30 26 15)" />
      <ellipse class="body" cx="20" cy="23" rx="7" ry="8.5" />
      <path class="stripe" d="M13.4 21h13.2M13.6 26h12.8" />
    </svg>
  </span>
</div>

<style>
  .back {
    position: relative;
    width: var(--cw, 4.5rem);
    aspect-ratio: 5 / 7;
    container-type: inline-size;
    border-radius: calc(var(--cw, 4.5rem) * 0.1);
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='24.25' viewBox='0 0 28 48.5'%3E%3Cpath d='M14 0l14 8.1v16.2L14 32.3 0 24.3V8.1zM14 32.3v16.2' fill='none' stroke='%23fff' stroke-opacity='.16' stroke-width='1.6'/%3E%3C/svg%3E") center / calc(var(--cw, 4.5rem) * 0.22) auto,
      radial-gradient(90% 70% at 50% 40%, var(--back-a), var(--back-b));
    box-shadow:
      inset 0 0 0 calc(var(--cw, 4.5rem) * 0.035) rgb(255 255 255 / 0.92),
      inset 0 0 0 calc(var(--cw, 4.5rem) * 0.035 + 1.5px) var(--back-line),
      var(--shadow-card);
  }
  .emblem {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  svg {
    width: 50cqw;
    filter: drop-shadow(0 2cqw 3cqw rgb(0 0 0 / 0.35));
  }
  .hexagon {
    fill: var(--back-b);
    stroke: var(--back-line);
    stroke-width: 2;
  }
  .wing {
    fill: rgb(255 255 255 / 0.85);
  }
  .body {
    fill: #ffc22e;
  }
  .stripe {
    stroke: #241a05;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
</style>
