export function setupDevConsole({ consoleEl, inputEl, commands = {} }) {
  let open = false;
  let buffer = '';

  function openConsole() {
    open = true;
    buffer = '';
    inputEl.textContent = '';
    consoleEl.style.display = 'block';
  }

  function closeConsole() {
    open = false;
    buffer = '';
    inputEl.textContent = '';
    consoleEl.style.display = 'none';
  }

  function runCommand(raw) {
    const command = commands[raw.trim().toLowerCase()];
    if (command) command();
  }

  function onKeyDown(e) {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (open) closeConsole();
      else openConsole();
      return;
    }

    if (!open) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.code === 'Escape') {
      closeConsole();
      return;
    }

    if (e.code === 'Enter') {
      runCommand(buffer);
      closeConsole();
      return;
    }

    if (e.code === 'Backspace') {
      buffer = buffer.slice(0, -1);
      inputEl.textContent = buffer;
      return;
    }

    if (e.key && e.key.length === 1) {
      if (e.ctrlKey || e.metaKey) return;
      buffer += e.key;
      inputEl.textContent = buffer;
    }
  }

  addEventListener('keydown', onKeyDown, { capture: true });

  return {
    close: closeConsole,
    destroy() {
      removeEventListener('keydown', onKeyDown, { capture: true });
      closeConsole();
    },
  };
}
