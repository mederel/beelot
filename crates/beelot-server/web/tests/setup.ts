// Shared by every test file. A browser marks the promise of a cancelled animation as handled; happy-dom does not, and unmounting
// a component cancels its animations, so the rejection would be reported as an unhandled error of the test run.
const animate = Element.prototype.animate;
Element.prototype.animate = function (...args: Parameters<typeof animate>) {
  const animation = animate.apply(this, args);
  animation.finished.catch(() => {});
  return animation;
};
