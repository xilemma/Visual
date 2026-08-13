// Custom hover/focus tooltip layer. Elements declare their help text via a
// `data-tooltip` attribute -- never the native `title` attribute, since
// browsers render their own tooltip for `title`, which used to show up
// alongside this one and made every tooltip appear twice. Native tooltips
// also have a long, inconsistent dwell delay and don't fire at all in some
// embedded browser contexts. Delegated at the document level so it works for
// every current and future element carrying `data-tooltip`, including ones
// built dynamically by controls.js.

const SHOW_DELAY_MS = 250;
const VIEWPORT_MARGIN = 8;

let tooltipEl = null;
let showTimer = null;
let activeTarget = null;

function ensureTooltipEl() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "app-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function closestTooltipTarget(node) {
  return node instanceof Element ? node.closest("[data-tooltip]") : null;
}

function positionTooltip(target) {
  const el = ensureTooltipEl();
  const rect = target.getBoundingClientRect();
  const ttRect = el.getBoundingClientRect();

  let left = rect.left;
  let top = rect.bottom + VIEWPORT_MARGIN;
  if (top + ttRect.height > window.innerHeight - VIEWPORT_MARGIN) {
    top = rect.top - ttRect.height - VIEWPORT_MARGIN;
  }
  if (left + ttRect.width > window.innerWidth - VIEWPORT_MARGIN) {
    left = window.innerWidth - ttRect.width - VIEWPORT_MARGIN;
  }
  left = Math.max(VIEWPORT_MARGIN, left);
  top = Math.max(VIEWPORT_MARGIN, top);

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function showTooltip(target) {
  const text = target.dataset.tooltip;
  if (!text) return;
  const el = ensureTooltipEl();
  el.textContent = text;
  el.classList.add("visible");
  activeTarget = target;
  positionTooltip(target);
}

function hideTooltip() {
  clearTimeout(showTimer);
  showTimer = null;
  activeTarget = null;
  if (tooltipEl) tooltipEl.classList.remove("visible");
}

function scheduleShow(target) {
  clearTimeout(showTimer);
  showTimer = setTimeout(() => showTooltip(target), SHOW_DELAY_MS);
}

export function initTooltips() {
  document.addEventListener("mouseover", (e) => {
    const target = closestTooltipTarget(e.target);
    if (!target || target === closestTooltipTarget(e.relatedTarget)) return;
    hideTooltip();
    scheduleShow(target);
  });

  document.addEventListener("mouseout", (e) => {
    const target = closestTooltipTarget(e.target);
    if (!target || target === closestTooltipTarget(e.relatedTarget)) return;
    hideTooltip();
  });

  document.addEventListener("focusin", (e) => {
    const target = closestTooltipTarget(e.target);
    if (!target) return;
    hideTooltip();
    showTooltip(target);
  });

  document.addEventListener("focusout", (e) => {
    if (closestTooltipTarget(e.target) === activeTarget) hideTooltip();
  });

  document.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
  window.addEventListener("blur", hideTooltip);
}
