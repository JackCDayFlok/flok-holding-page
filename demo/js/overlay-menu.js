// overlay-menu.js (accessible + robust)

const mobileToggle = document.getElementById('mobileMenuToggle');
const overlay = document.getElementById('mobileOverlay');
const closeBtn = document.getElementById('closeOverlay');
const body = document.body;

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'area[href]',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

let lastFocusedEl = null;

function isOpen() {
  return overlay.classList.contains('open');
}

function getFocusable(root) {
  const list = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
  // Only keep visible, focusable elements
  return list.filter(el => {
    const styles = window.getComputedStyle(el);
    const rects = el.getClientRects();
    return styles.visibility !== 'hidden' &&
      styles.display !== 'none' &&
      rects.length > 0;
  });
}

function focusFirstInOverlay() {
  const auto = overlay.querySelector('[data-autofocus]');
  if (auto) {
    auto.focus();
    return;
  }
  const focusables = getFocusable(overlay);
  if (focusables.length) {
    focusables[0].focus();
  } else if (closeBtn) {
    closeBtn.focus();
  }
}

// Prevent page jump when locking scroll
function lockScroll() {
  const y = window.scrollY || window.pageYOffset || 0;
  body.dataset.scrollY = String(y);
  body.classList.add('menu-open');
  body.style.top = `-${y}px`;
}

function unlockScroll() {
  const y = parseInt(body.dataset.scrollY || '0', 10);
  body.classList.remove('menu-open');
  body.style.top = '';
  delete body.dataset.scrollY;
  window.scrollTo(0, y);
}

function openMenu() {
  if (isOpen()) return;

  lastFocusedEl = document.activeElement || mobileToggle;

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  mobileToggle.setAttribute('aria-expanded', 'true');

  lockScroll();
  focusFirstInOverlay();

  document.addEventListener('keydown', onKeydown, true);
}

function closeMenu() {
  if (!isOpen()) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  mobileToggle.setAttribute('aria-expanded', 'false');

  document.removeEventListener('keydown', onKeydown, true);
  unlockScroll();

  // Return focus to the trigger
  if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
    lastFocusedEl.focus();
  }
}

function onKeydown(e) {
  if (!isOpen()) return;

  // ESC closes
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault();
    closeMenu();
    return;
  }

  // Trap focus with TAB
  if (e.key === 'Tab') {
    const focusables = getFocusable(overlay);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      // SHIFT+TAB backwards from first -> go to last
      if (active === first || !overlay.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // TAB forwards from last -> go to first
      if (active === last || !overlay.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Space/Enter on toggle button opens (for completeness)
  if (e.target === mobileToggle && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    openMenu();
  }
}

// Click outside overlay content closes
function onOverlayClick(e) {
  if (e.target === overlay) {
    closeMenu();
  }
}

// Wire up once elements exist
if (mobileToggle && overlay && closeBtn) {
  // Open/close via buttons
  mobileToggle.addEventListener('click', openMenu);
  // Prefer keydown over deprecated keypress
  mobileToggle.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      openMenu();
    }
  });

  closeBtn.addEventListener('click', closeMenu);

  // Click on the dimmed backdrop closes
  overlay.addEventListener('click', onOverlayClick);

  // Close when resizing to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768 && isOpen()) {
      closeMenu();
    }
  });
}
