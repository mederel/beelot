// Moves an element to the end of <body>, outside the app's root, so that a full-screen overlay can make the page behind it inert
// without becoming inert itself.
export function portal(node: HTMLElement) {
  document.body.append(node);
  return {
    destroy() {
      node.remove();
    }
  };
}

/**
 * Makes the whole page behind a full-screen overlay inert: the navigation and the skip link as well as <main>, so that Tab
 * cannot reach a control that the overlay covers (WCAG 2.4.3). Returns the function that gives the page back.
 */
export function inertPage(): () => void {
  const root = document.getElementById("app");
  if (!root) return () => {};
  const was = root.inert;
  root.inert = true;
  return () => {
    root.inert = was;
  };
}
