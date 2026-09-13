(() => {
  if (window.__hermesUiFeedback) {
    window.__hermesUiFeedback.toggle();
    return;
  }

  const state = {
    visible: true,
    annotating: false,
    notes: [],
    hovered: null,
    draft: null,
    busy: false,
    submitted: false,
    result: "",
    resultUrl: "",
    error: "",
  };

  const host = document.createElement("div");
  host.id = "hermes-ui-feedback-root";
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.append(host);
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; color: #e5edf8; font: 24px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      button { font: inherit; }
      button { cursor: pointer; }
      .hidden { display: none !important; }
      .target { position: fixed; border: 4px solid #38bdf8; background: rgb(56 189 248 / 9%); box-shadow: 0 0 0 3px rgb(2 8 23 / 75%); pointer-events: none; transition: inset 60ms linear; }
      .pin { position: fixed; display: grid; place-items: center; width: 48px; height: 48px; border: 4px solid #f8fafc; border-radius: 999px; background: #0284c7; color: white; box-shadow: 0 3px 12px rgb(2 8 23 / 55%); font-weight: 800; pointer-events: none; transform: translate(-50%, -50%); }
      .panel button { min-height: 60px; padding: 13px 21px; border: 1px solid #334155; border-radius: 8px; background: #172033; color: #dbeafe; }
      .panel button:hover { border-color: #64748b; background: #22304a; }
      .panel button:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
      .active, .primary { border-color: #38bdf8 !important; background: #0369a1 !important; color: white !important; }
      .panel { position: fixed; top: 16px; right: 16px; width: min(620px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; border: 1px solid #334155; border-radius: 12px; background: #0b1220; box-shadow: 0 12px 36px rgb(2 8 23 / 55%); pointer-events: auto; }
      .panel.collapsed { width: auto; }
      .panel.collapsed > :not(.panel-header) { display: none; }
      .panel-header { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 21px; padding: 24px 27px; border-bottom: 1px solid #263247; background: #0b1220; cursor: grab; touch-action: none; user-select: none; }
      .panel-header:active { cursor: grabbing; }
      .panel-head-actions { display: flex; align-items: center; gap: 15px; }
      .panel-toggle, .panel-close { min-width: 57px; min-height: 54px !important; padding: 5px 14px !important; color: #94a3b8 !important; font-size: 30px; line-height: 1; }
      h2 { margin: 0; color: #f8fafc; font: 700 24px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .04em; text-transform: uppercase; }
      .notes { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; background: #263247; }
      .note { display: grid; grid-template-columns: 51px 1fr auto; gap: 18px; padding: 24px 27px; background: #0f1828; }
      .note-index { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 999px; background: #0369a1; color: white; font-weight: 800; }
      .note-message { margin: 0 0 9px; color: #e5edf8; white-space: pre-wrap; overflow-wrap: anywhere; }
      .note-context { color: #8291a8; font-size: 21px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .remove { align-self: start; min-height: 54px !important; padding: 6px 15px !important; color: #94a3b8 !important; font-size: 27px; }
      .draft { padding: 24px 27px; border-bottom: 1px solid #263247; background: #0f1828; }
      .draft-label { display: block; margin-bottom: 15px; color: #94a3b8; font-size: 21px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .note-frame { display: block; width: 100%; height: 195px; border: 0; border-radius: 8px; background: #111c2e; }
      .draft-actions { display: flex; justify-content: flex-end; gap: 15px; margin-top: 18px; }
      .panel-actions { display: flex; align-items: center; gap: 15px; padding: 21px 27px; border-top: 1px solid #263247; }
      .add { flex: 0 0 66px; width: 66px; margin-right: auto; padding: 0 !important; font-size: 42px; line-height: 1; }
      .error { margin: 0; padding: 21px 27px; border-top: 1px solid #7f1d1d; background: #2a1118; color: #fecaca; white-space: pre-wrap; }
      .result { display: flex; align-items: center; gap: 18px; margin: 0; padding: 21px 27px; border-top: 1px solid #14532d; background: #0c1f19; color: #bbf7d0; font-size: 21px; white-space: pre-wrap; }
      .sent-check { display: grid; flex: 0 0 45px; place-items: center; width: 45px; height: 45px; border-radius: 999px; background: #16a34a; color: white; font-weight: 900; }
      .result:not(.hidden) .sent-check { animation: sent-pop 300ms ease-out; }
      .result-link { display: inline-block; margin-top: 5px; color: #7dd3fc; font-weight: 700; text-decoration: underline; }
      @keyframes sent-pop { from { opacity: 0; transform: scale(.5); } 70% { transform: scale(1.12); } }
      @media (prefers-reduced-motion: reduce) { .sent-check { animation: none; } }
      @media (max-width: 620px) {
        .panel { top: 8px; right: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
        .panel-header { flex-wrap: wrap; }
        .panel-head-actions { margin-left: auto; }
        .draft-actions { flex-wrap: wrap; }
        .draft-actions button { flex: 1 1 120px; }
        .panel-actions { flex-wrap: wrap; }
        .add { margin-right: 0; }
        .send { flex: 1 1 160px; }
      }
    </style>
    <div class="layer">
      <div class="target hidden"></div>
      <div class="pins"></div>
      <section class="panel" aria-label="Hermes UI feedback">
        <div class="panel-header" title="Drag to move"><h2>Hermes feedback</h2><span class="panel-head-actions"><span class="count-label" aria-live="polite"></span><button class="panel-toggle" type="button" aria-expanded="true" aria-label="Collapse feedback panel">▾</button><button class="panel-close" type="button" aria-label="Hide Hermes feedback">×</button></span></div>
        <div class="draft hidden" role="group" aria-label="Add UI feedback">
          <span class="draft-label"></span>
          <iframe class="note-frame" title="Feedback note"></iframe>
          <div class="draft-actions"><button class="cancel" type="button">Cancel</button><button class="save primary" type="button">Add note</button></div>
        </div>
        <div class="notes-wrap"></div>
        <p class="error hidden" role="alert"></p>
        <div class="result hidden"><span class="sent-check" aria-hidden="true">✓</span><span><span class="result-text"></span><br><a class="result-link" target="_blank" rel="noreferrer">Open Discord thread</a></span></div>
        <div class="panel-actions">
          <button class="add" type="button" aria-label="Annotate or add a page note" aria-pressed="false" title="Click page to annotate, click again for a page note">+</button>
          <button class="clear" type="button">Clear</button>
          <button class="send primary" type="button">Send to Hermes</button>
        </div>
      </section>
    </div>`;

  const $ = (selector) => shadow.querySelector(selector);
  const layer = $(".layer");
  const panel = $(".panel");
  const panelHeader = $(".panel-header");
  const panelToggle = $(".panel-toggle");
  const targetBox = $(".target");
  const pins = $(".pins");
  const notesWrap = $(".notes-wrap");
  const addButton = $(".add");
  const sendButton = $(".send");
  const clearButton = $(".clear");
  const countLabel = $(".count-label");
  const errorBox = $(".error");
  const resultBox = $(".result");
  const resultText = $(".result-text");
  const resultLink = $(".result-link");
  const draftBox = $(".draft");
  const draftLabel = $(".draft-label");
  const noteFrame = $(".note-frame");
  const noteDocument = noteFrame.contentDocument;
  const noteStyle = noteDocument.createElement("style");
  noteStyle.textContent = `
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; background: #111c2e; }
    textarea { display: block; width: 100%; height: 100%; resize: none; padding: 18px 20px; border: 2px solid #475569; border-radius: 8px; outline: 0; background: #111c2e; color: #f8fafc; font: 24px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    textarea:focus-visible { border-color: #38bdf8; outline: 2px solid #38bdf8; outline-offset: -2px; }
  `;
  const textarea = noteDocument.createElement("textarea");
  textarea.placeholder = "What should change?";
  textarea.setAttribute("aria-label", "What should change?");
  noteDocument.head.append(noteStyle);
  noteDocument.body.append(textarea);
  let drag;

  function movePanel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    panel.style.left = `${Math.max(0, Math.min(innerWidth - panel.offsetWidth, event.clientX - drag.x))}px`;
    panel.style.top = `${Math.max(0, Math.min(innerHeight - panel.offsetHeight, event.clientY - drag.y))}px`;
  }

  function clampPanel() {
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(0, Math.min(innerWidth - rect.width, rect.left))}px`;
    panel.style.top = `${Math.max(0, Math.min(innerHeight - rect.height, rect.top))}px`;
    panel.style.right = "auto";
  }

  panelHeader.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    drag = { pointerId: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    panel.style.right = "auto";
    panelHeader.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  panelHeader.addEventListener("pointermove", movePanel);
  panelHeader.addEventListener("pointerup", () => { drag = null; });
  panelHeader.addEventListener("pointercancel", () => { drag = null; });
  function setPanelCollapsed(collapsed) {
    panel.classList.toggle("collapsed", collapsed);
    panelToggle.textContent = collapsed ? "▸" : "▾";
    panelToggle.setAttribute("aria-expanded", String(!collapsed));
    panelToggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} feedback panel`);
    clampPanel();
  }
  panelToggle.addEventListener("click", () => setPanelCollapsed(!panel.classList.contains("collapsed")));

  function toggle() {
    state.visible = !state.visible;
    layer.classList.toggle("hidden", !state.visible);
    if (!state.visible) {
      setAnnotating(false);
      cancelDraft();
    }
    document.documentElement.style.cursor = state.visible && state.annotating ? "crosshair" : "";
    renderTarget();
  }

  function setAnnotating(value) {
    state.annotating = value;
    addButton.classList.toggle("active", value);
    addButton.setAttribute("aria-pressed", String(value));
    document.documentElement.style.cursor = value ? "crosshair" : "";
    if (!value) state.hovered = null;
    render();
  }

  function overlayEvent(event) {
    return event.composedPath().includes(host);
  }

  function normalizeTarget(element) {
    if (!(element instanceof Element)) return null;
    if (["path", "svg", "use"].includes(element.localName)) {
      return element.closest("button, a, [role], input, select, textarea") ?? element;
    }
    return element;
  }

  function handlePointerMove(event) {
    if (!state.visible || !state.annotating || (state.draft && state.draft.context.kind !== "note") || overlayEvent(event)) return;
    state.hovered = normalizeTarget(event.target);
    renderTarget();
  }

  function handleClick(event) {
    if (!state.visible || overlayEvent(event)) return;
    if (state.draft && state.draft.context.kind !== "note") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelDraft();
      setAnnotating(true);
      return;
    }
    if (!state.annotating) return;
    const element = normalizeTarget(event.target);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDraft(element, state.draft?.context.kind === "note" ? textarea.value : "");
  }

  function openDraft(element, message = "") {
    state.draft = { element, context: elementContext(element) };
    setAnnotating(false);
    setPanelCollapsed(false);
    draftLabel.textContent = state.draft.context.component || state.draft.context.label;
    draftBox.classList.remove("hidden");
    textarea.value = message;
    textarea.focus();
    render();
  }

  function openGeneralDraft() {
    state.draft = {
      element: null,
      context: { kind: "note", url: location.href, selector: "", component: "", label: "General note", html: "", rect: {} },
    };
    setPanelCollapsed(false);
    draftLabel.textContent = "General note";
    draftBox.classList.remove("hidden");
    textarea.value = "";
    textarea.focus();
    render();
  }

  function cancelDraft() {
    const wasComponent = Boolean(state.draft && state.draft.context.kind !== "note");
    openGeneralDraft();
    textarea.value = "";
    if (wasComponent) state.annotating = false;
    render();
  }

  function saveDraft() {
    const message = textarea.value.trim();
    if (!message || !state.draft) return false;
    const keepOpen = state.draft.context.kind === "note";
    state.notes.push({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      message: message.slice(0, 2000),
      ...state.draft.context,
    });
    markDirty();
    persist();
    if (keepOpen) {
      textarea.value = "";
      setAnnotating(true);
      render();
      textarea.focus();
      return true;
    }
    cancelDraft();
    setAnnotating(true);
    return true;
  }

  function removeNote(id) {
    state.notes = state.notes.filter((note) => note.id !== id);
    markDirty();
    persist();
    render();
  }

  function clearNotes() {
    if (state.busy) return;
    state.notes = [];
    openGeneralDraft();
    markDirty();
    persist();
    setAnnotating(true);
  }

  async function send() {
    if (state.busy || state.submitted) return;
    if (state.draft && textarea.value.trim()) saveDraft();
    else if (state.draft) cancelDraft();
    if (!state.notes.length) return;
    state.busy = true;
    state.error = "";
    state.result = "";
    state.resultUrl = "";
    render();

    let response;
    try {
      host.style.display = "none";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      response = await chrome.runtime.sendMessage({
        type: "submit",
        payload: {
          page: { url: location.href, title: document.title },
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
          annotations: state.notes,
        },
      });
    } catch (error) {
      response = { error: error instanceof Error ? error.message : String(error) };
    } finally {
      host.style.display = "";
    }

    if (response?.error) {
      state.busy = false;
      state.error = response.error;
      render();
      return;
    }
    state.busy = false;
    state.submitted = true;
    state.notes = [];
    cancelDraft();
    persist();
    state.resultUrl = response.permalink;
    state.result = response.routedTo === "preview-thread"
      ? "Sent to the existing preview thread."
      : "Sent to Discord. Hermes V2 is opening a new thread.";
    setAnnotating(false);
    render();
  }

  function markDirty() {
    state.submitted = false;
    state.result = "";
    state.resultUrl = "";
    state.error = "";
  }

  function render() {
    const hasDraftMessage = Boolean(state.draft && textarea.value.trim());
    countLabel.textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
    addButton.disabled = state.busy;
    sendButton.disabled = state.busy || state.submitted || (!state.notes.length && !hasDraftMessage);
    sendButton.textContent = state.busy ? "Sending…" : state.submitted ? "Sent" : "Send to Hermes";
    clearButton.disabled = state.busy || (!state.notes.length && !state.draft && !state.submitted && !state.error);
    notesWrap.replaceChildren();
    notesWrap.classList.toggle("hidden", Boolean(state.draft) && !state.notes.length);
    if (state.notes.length) {
      const list = document.createElement("ol");
      list.className = "notes";
      state.notes.forEach((note, index) => {
        const item = document.createElement("li");
        item.className = "note";
        const marker = document.createElement("span");
        marker.className = "note-index";
        marker.textContent = String(index + 1);
        const body = document.createElement("div");
        const message = document.createElement("p");
        message.className = "note-message";
        message.textContent = note.message;
        const context = document.createElement("div");
        context.className = "note-context";
        context.textContent = note.component || note.selector || "General note";
        const remove = document.createElement("button");
        remove.className = "remove";
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove note ${index + 1}`);
        remove.textContent = "×";
        remove.addEventListener("click", () => removeNote(note.id));
        body.append(message, context);
        item.append(marker, body, remove);
        list.append(item);
      });
      notesWrap.append(list);
    }

    errorBox.textContent = state.error;
    errorBox.classList.toggle("hidden", !state.error);
    resultText.textContent = state.result;
    resultLink.href = state.resultUrl;
    resultLink.classList.toggle("hidden", !state.resultUrl);
    resultBox.classList.toggle("hidden", !state.result);
    renderPins();
    renderTarget();
  }

  function renderTarget() {
    const element = state.draft?.element ?? state.hovered;
    if (!state.visible || (!state.annotating && !state.draft) || !element?.isConnected) {
      targetBox.classList.add("hidden");
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(targetBox.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    targetBox.classList.remove("hidden");
  }

  function renderPins() {
    pins.replaceChildren();
    state.notes.forEach((note, index) => {
      if (note.url !== location.href) return;
      let element;
      try { element = document.querySelector(note.selector); } catch { return; }
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return;
      const pin = document.createElement("span");
      pin.className = "pin";
      pin.textContent = String(index + 1);
      pin.title = note.message;
      pin.style.left = `${Math.max(13, Math.min(innerWidth - 13, rect.left))}px`;
      pin.style.top = `${Math.max(13, Math.min(innerHeight - 13, rect.top))}px`;
      pins.append(pin);
    });
  }

  function elementContext(element) {
    const rect = element.getBoundingClientRect();
    return {
      url: location.href,
      selector: selectorFor(element),
      component: componentFor(element),
      label: labelFor(element),
      html: safeOuterHtml(element),
      rect: {
        x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
        documentX: Math.round(rect.x + scrollX), documentY: Math.round(rect.y + scrollY),
      },
    };
  }

  function safeOuterHtml(element) {
    const clone = element.cloneNode(true);
    for (const node of [clone, ...clone.querySelectorAll("*")]) {
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name) || /^(value|srcdoc|nonce)$/i.test(attribute.name)) {
          node.removeAttribute(attribute.name);
        }
      }
    }
    return clone.outerHTML.slice(0, 4000);
  }

  function selectorFor(element) {
    const escape = CSS.escape;
    for (const attribute of ["data-feedback-id", "data-testid", "data-component"]) {
      const value = element.getAttribute(attribute);
      if (value) return `[${attribute}="${escape(value)}"]`;
    }
    if (element.id && document.querySelectorAll(`#${escape(element.id)}`).length === 1) {
      return `#${escape(element.id)}`;
    }

    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 6) {
      let part = current.localName;
      const stableClass = [...current.classList].find((name) =>
        /^[a-z][\w-]{2,}$/.test(name) && !/^(active|open|selected|hover|focus|svelte-)/.test(name),
      );
      if (stableClass) part += `.${escape(stableClass)}`;
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter((child) => child.localName === current.localName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (document.querySelectorAll(candidate).length === 1) return candidate;
      current = current.parentElement;
    }
    return parts.join(" > ") || element.localName;
  }

  function componentFor(element) {
    const named = element.closest("[data-component], [data-feedback-id], [data-testid]");
    if (named) {
      for (const key of ["data-component", "data-feedback-id", "data-testid"]) {
        if (named.getAttribute(key)) return named.getAttribute(key);
      }
    }
    if (element.localName.includes("-")) return element.localName;
    try {
      const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
      let fiber = fiberKey ? element[fiberKey] : null;
      for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
        const name = fiber.elementType?.displayName || fiber.elementType?.name || fiber.type?.displayName || fiber.type?.name;
        if (name && !/^(Fragment|Suspense)$/.test(name)) return name;
      }
      let vue = element.__vueParentComponent;
      for (let depth = 0; vue && depth < 12; depth += 1, vue = vue.parent) {
        const name = vue.type?.name || vue.type?.__name;
        if (name) return name;
      }
    } catch {}
    return "";
  }

  function labelFor(element) {
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.getAttribute("title") ||
      element.innerText?.replace(/\s+/g, " ").trim().slice(0, 180) ||
      `<${element.localName}>`
    );
  }

  async function persist() {
    await chrome.runtime.sendMessage({ type: "save-notes", notes: state.notes });
  }

  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", (event) => {
    if (!state.visible || overlayEvent(event)) return;
    if (event.key === "Escape") {
      if (state.draft) cancelDraft();
      else setAnnotating(false);
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      if (!state.draft) setAnnotating(!state.annotating);
    }
  }, true);
  addEventListener("scroll", () => { renderTarget(); renderPins(); }, true);
  addEventListener("resize", () => { clampPanel(); renderTarget(); renderPins(); });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "toggle") toggle();
  });

  addButton.addEventListener("click", () => {
    if (state.draft?.context.kind !== "note") cancelDraft();
    setAnnotating(!state.annotating);
    if (state.annotating) textarea.focus();
  });
  $(".panel-close").addEventListener("click", toggle);
  $(".cancel").addEventListener("click", cancelDraft);
  $(".save").addEventListener("click", saveDraft);
  textarea.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancelDraft();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      saveDraft();
    }
  });
  textarea.addEventListener("input", render);
  clearButton.addEventListener("click", clearNotes);
  sendButton.addEventListener("click", send);

  window.__hermesUiFeedback = { toggle };
  chrome.runtime.sendMessage({ type: "load-notes" }).then((saved) => {
    state.notes = Array.isArray(saved?.notes) ? saved.notes : [];
    render();
  });
  openGeneralDraft();
  setAnnotating(true);
})();
