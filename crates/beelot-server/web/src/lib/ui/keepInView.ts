// A form stays in view when the on-screen keyboard opens (US-206). The keyboard takes about 45% of a phone's height; the browser
// scrolls the focused field into view, but not always the button that submits it. When the viewport shrinks while a field of the
// form has the focus, the form is scrolled into view as a whole if it fits, and from its top if it does not.
import type { Action } from "svelte/action";

export const keepInView: Action<HTMLElement> = (form) => {
  let timer: number | undefined;
  // After the browser's own scroll to the field, which comes with the resize or just after it.
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(reveal, 100);
  };
  const reveal = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !form.contains(active)) return;
    const view = window.visualViewport?.height ?? window.innerHeight;
    form.scrollIntoView({ block: form.getBoundingClientRect().height <= view ? "nearest" : "start", inline: "nearest" });
  };
  window.addEventListener("resize", later);
  window.visualViewport?.addEventListener("resize", later);
  return {
    destroy() {
      window.clearTimeout(timer);
      window.removeEventListener("resize", later);
      window.visualViewport?.removeEventListener("resize", later);
    }
  };
};
