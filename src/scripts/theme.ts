/**
 * The theme switch: system, light or dark. The choice is remembered per browser; "system" removes it. The pressed
 * button is styled from the root's data-theme in CSS, so it is right before this script runs; this keeps aria-pressed
 * in step and lets Escape dismiss a tooltip.
 */

type Choice = 'system' | 'light' | 'dark';

function isChoice(value: string | undefined): value is Choice {
  return value === 'system' || value === 'light' || value === 'dark';
}

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

function render(buttons: HTMLButtonElement[], choice: Choice): void {
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button.dataset.choice === choice));
  }
}

export function setupThemeToggle(): void {
  const group = document.getElementById('theme-switch');
  if (group === null) {
    return;
  }
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[data-choice]')];

  render(buttons, current());
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const choice = button.dataset.choice;
      if (isChoice(choice)) {
        apply(choice);
        render(buttons, choice);
      }
    });
    for (const leave of ['pointerleave', 'blur']) {
      button.addEventListener(leave, () => delete button.dataset.tooltipHidden);
    }
  }
  // Escape hides an open tooltip, hovered or focused, until the pointer or focus leaves its button.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      for (const button of buttons) {
        button.dataset.tooltipHidden = '';
      }
    }
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
