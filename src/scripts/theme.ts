/**
 * The theme toggle: system → light → dark → system. The choice is remembered per browser; "system" removes it.
 */

type Choice = 'system' | 'light' | 'dark';

const ORDER: Choice[] = ['system', 'light', 'dark'];
const LABELS: Record<Choice, string> = { system: 'system', light: 'light', dark: 'dark' };

function current(): Choice {
  const theme = document.documentElement.dataset.theme;

  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

function apply(choice: Choice): void {
  if (choice === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = choice;
  }

  try {
    if (choice === 'system') {
      localStorage.removeItem('theme');
    } else {
      localStorage.setItem('theme', choice);
    }
  } catch {
    // Not remembered, still applied.
  }
}

function render(button: HTMLButtonElement, choice: Choice): void {
  const label = button.querySelector('[data-theme-label]');
  if (label !== null) {
    label.textContent = `Theme: ${LABELS[choice]}`;
  }
  button.setAttribute(
    'aria-label',
    choice === 'system' ? 'Colour theme: follows the system' : `Colour theme: ${LABELS[choice]}`,
  );
}

export function setupThemeToggle(): void {
  const button = document.getElementById('theme-toggle');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  render(button, current());
  button.addEventListener('click', () => {
    const next = ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length] ?? 'system';
    apply(next);
    render(button, next);
  });
}

/** Calls back whenever the effective theme may have changed: a toggle or a change of the system setting. */
export function onThemeChange(callback: () => void): void {
  new MutationObserver(callback).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback);
}
