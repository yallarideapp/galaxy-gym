for (const panel of document.querySelectorAll("[data-whatsapp-draft]")) {
  const controls = panel.querySelector("[data-draft-controls]");
  const greeting = panel.querySelector("[data-draft-greeting]").textContent;
  const request = panel.querySelector("[data-draft-request]").textContent;
  const preview = panel.querySelector("[data-draft-preferences]");
  const link = panel.querySelector("[data-draft-link]");

  function updateDraft() {
    const preferences = [];
    for (const field of controls.querySelectorAll("input:checked, select")) {
      if (!field.value) continue;
      const label = field.dataset.draftLabel ?? field.closest("fieldset").querySelector("legend").textContent;
      preferences.push(`${label} — ${field.value}`);
    }

    preview.textContent = preferences.join("\n");
    preview.hidden = preferences.length === 0;
    const url = new URL(link.href);
    url.searchParams.set("text", [greeting, ...preferences, request].join("\n"));
    link.href = url.href;
  }

  controls.addEventListener("change", updateDraft);
  controls.hidden = false;
  updateDraft();
}
