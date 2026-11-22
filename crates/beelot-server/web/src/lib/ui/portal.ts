// Moves an element to the end of <body>, outside <main>, so that a full-screen overlay can make the page behind it inert
// without becoming inert itself.
export function portal(node: HTMLElement) {
  document.body.append(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
