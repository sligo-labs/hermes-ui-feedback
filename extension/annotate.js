(() => {
  if (window.__hermesUiFeedback) {
    window.__hermesUiFeedback.toggle();
    return;
  }

  const state = {
    visible: true,
    annotating: true,
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
      .layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; color: #e5edf8; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      button, textarea { font: inherit; }
      button { cursor: pointer; }
      .hidden { display: none !important; }
      .target { position: fixed; border: 2px solid #38bdf8; background: rgb(56 189 248 / 9%); box-shadow: 0 0 0 2px rgb(2 8 23 / 75%); pointer-events: none; transition: inset 60ms linear; }
      .pin { position: fixed; width: 26px; height: 26px; padding: 0; border: 2px solid #f8fafc; border-radius: 999px; background: #0284c7; color: white; box-shadow: 0 3px 12px rgb(2 8 23 / 55%); font-weight: 800; pointer-events: auto; transform: translate(-50%, -50%); }
      .toolbar { position: fixed; left: 50%; bottom: 18px; display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 6px; border: 1px solid #334155; border-radius: 8px; background: #0b1220; box-shadow: 0 12px 36px rgb(2 8 23 / 55%); pointer-events: auto; transform: translateX(-50%); }
      .toolbar button, .panel button, .composer button { min-height: 32px; padding: 6px 10px; border: 1px solid #334155; border-radius: 5px; background: #172033; color: #dbeafe; }
      .toolbar button:hover, .panel button:hover, .composer button:hover { border-color: #64748b; background: #22304a; }
      .toolbar button:focus-visible, .panel button:focus-visible, .composer button:focus-visible, textarea:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
      .toolbar .active, .primary { border-color: #38bdf8 !important; background: #0369a1 !important; color: white !important; }
      .toolbar .close { padding-inline: 9px; color: #94a3b8; }
      .count { min-width: 24px; padding: 0 5px; color: #94a3b8; text-align: center; }
      .panel { position: fixed; top: 16px; right: 16px; width: min(370px, calc(100vw - 32px)); max-height: calc(100vh - 92px); overflow: auto; border: 1px solid #334155; border-radius: 8px; background: #0b1220; box-shadow: 0 12px 36px rgb(2 8 23 / 55%); pointer-events: auto; }
      .panel-header { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #263247; background: #0b1220; }
      h2 { margin: 0; color: #f8fafc; font: 700 13px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .04em; text-transform: uppercase; }
      .notes { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; background: #263247; }
      .note { display: grid; grid-template-columns: 26px 1fr auto; gap: 9px; padding: 11px 12px; background: #0f1828; }
      .note-index { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 999px; background: #0369a1; color: white; font-weight: 800; }
      .note-message { margin: 0 0 4px; color: #e5edf8; white-space: pre-wrap; overflow-wrap: anywhere; }
      .note-context { color: #8291a8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .remove { align-self: start; min-height: 24px !important; padding: 2px 7px !important; color: #94a3b8 !important; }
      .empty { margin: 0; padding: 18px 14px; color: #94a3b8; }
      .panel-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; padding: 10px 12px; border-top: 1px solid #263247; }
      .status { flex: 1; color: #94a3b8; font-size: 11px; }
      .error { margin: 0; padding: 10px 12px; border-top: 1px solid #7f1d1d; background: #2a1118; color: #fecaca; white-space: pre-wrap; }
      .result { margin: 0; padding: 11px 12px; border-top: 1px solid #14532d; background: #0c1f19; color: #bbf7d0; font-size: 12px; white-space: pre-wrap; }
      .result-link { display: inline-block; margin-top: 5px; color: #7dd3fc; font-weight: 700; text-decoration: underline; }
      .composer { position: fixed; width: min(350px, calc(100vw - 24px)); padding: 10px; border: 1px solid #38bdf8; border-radius: 7px; background: #0b1220; box-shadow: 0 14px 40px rgb(2 8 23 / 65%); pointer-events: auto; }
      .composer-label { display: block; margin-bottom: 7px; color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      textarea { display: block; width: 100%; min-height: 92px; resize: vertical; padding: 9px 10px; border: 1px solid #475569; border-radius: 5px; background: #111c2e; color: #f8fafc; }
      .composer-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 8px; }
      @media (max-width: 620px) { .panel { top: 8px; right: 8px; width: calc(100vw - 16px); max-height: 52vh; } .toolbar { bottom: 8px; } }
    </style>
    <div class="layer">
      <div class="target hidden"></div>
      <div class="pins"></div>
      <section class="panel" aria-label="Hermes UI feedback">
        <div class="panel-header"><h2>Hermes feedback</h2><span class="count-label"></span></div>
        <div class="notes-wrap"></div>
        <p class="error hidden" role="alert"></p>
        <div class="result hidden"><span class="result-text"></span><br><a class="result-link" target="_blank" rel="noreferrer">Open Discord thread</a></div>
        <div class="panel-actions">
          <span class="status">Click Annotate, then choose an element.</span>
          <button class="clear" type="button">Clear</button>
          <button class="send primary" type="button">Send to Hermes</button>
        </div>
      </section>
      <div class="composer hidden" role="dialog" aria-label="Add UI feedback">
        <span class="composer-label"></span>
        <textarea placeholder="What should change?"></textarea>
        <div class="composer-actions"><button class="cancel" type="button">Cancel</button><button class="save primary" type="button">Add note</button></div>
      </div>
      <div class="toolbar" aria-label="Annotation controls">
        <button class="annotate active" type="button">Annotate</button>
        <span class="count" aria-live="polite">0</span>
        <button class="close" type="button" aria-label="Hide Hermes feedback">Close</button>
      </div>
    </div>`;

  const $ = (selector) => shadow.querySelector(selector);
  const layer = $(".layer");
  const targetBox = $(".target");
  const pins = $(".pins");
  const notesWrap = $(".notes-wrap");
  const annotateButton = $(".annotate");
  const sendButton = $(".send");
  const clearButton = $(".clear");
  const count = $(".count");
  const countLabel = $(".count-label");
  const status = $(".status");
  const errorBox = $(".error");
  const resultBox = $(".result");
  const resultText = $(".result-text");
  const resultLink = $(".result-link");
  const composer = $(".composer");
  const composerLabel = $(".composer-label");
  const textarea = $("textarea");

  function toggle() {
    state.visible = !state.visible;
    layer.classList.toggle("hidden", !state.visible);
    if (!state.visible) cancelDraft();
    document.documentElement.style.cursor = state.visible && state.annotating ? "crosshair" : "";
    renderTarget();
  }

  function setAnnotating(value) {
    state.annotating = value;
    annotateButton.classList.toggle("active", value);
    annotateButton.textContent = value ? "Annotating…" : "Annotate";
    document.documentElement.style.cursor = value ? "crosshair" : "";
    if (!value) state.hovered = null;
    renderTarget();
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
    if (!state.visible || !state.annotating || state.draft || overlayEvent(event)) return;
    state.hovered = normalizeTarget(event.target);
    renderTarget();
  }

  function handleClick(event) {
    if (!state.visible || !state.annotating || state.draft || overlayEvent(event)) return;
    const element = normalizeTarget(event.target);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDraft(element, event.clientX, event.clientY);
  }

  function openDraft(element, x, y) {
    state.draft = { element, context: elementContext(element) };
    composerLabel.textContent = state.draft.context.component || state.draft.context.label;
    composer.style.left = `${Math.max(12, Math.min(x + 12, innerWidth - 362))}px`;
    composer.style.top = `${Math.max(12, Math.min(y + 12, innerHeight - 180))}px`;
    composer.classList.remove("hidden");
    textarea.value = "";
    textarea.focus();
    renderTarget();
  }

  function cancelDraft() {
    state.draft = null;
    composer.classList.add("hidden");
    textarea.value = "";
    renderTarget();
  }

  function saveDraft() {
    const message = textarea.value.trim();
    if (!message || !state.draft) return;
    state.notes.push({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      message: message.slice(0, 2000),
      ...state.draft.context,
    });
    markDirty();
    cancelDraft();
    persist();
    render();
  }

  function removeNote(id) {
    state.notes = state.notes.filter((note) => note.id !== id);
    markDirty();
    persist();
    render();
  }

  function clearNotes() {
    if (state.busy || !state.notes.length) return;
    state.notes = [];
    markDirty();
    persist();
    render();
  }

  async function send() {
    if (state.busy || state.submitted || !state.notes.length) return;
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
    count.textContent = String(state.notes.length);
    countLabel.textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
    sendButton.disabled = state.busy || state.submitted || !state.notes.length;
    sendButton.textContent = state.busy ? "Sending…" : state.submitted ? "Sent" : "Send to Hermes";
    clearButton.disabled = state.busy || !state.notes.length;
    status.textContent = state.busy
      ? "Posting the batch to Discord…"
      : state.submitted
        ? "Hermes V2 was mentioned in Discord."
        : state.notes.length
          ? "Review the batch, then send once."
          : "Click Annotate, then choose an element.";

    notesWrap.replaceChildren();
    if (!state.notes.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No notes yet. Your next click targets the page, not the toolbar.";
      notesWrap.append(empty);
    } else {
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
        context.textContent = note.component || note.selector;
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
  }

  function renderTarget() {
    const element = state.draft?.element ?? state.hovered;
    if (!state.visible || !state.annotating || !element?.isConnected) {
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
      const pin = document.createElement("button");
      pin.className = "pin";
      pin.type = "button";
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
    if (!state.visible) return;
    if (event.key === "Escape") {
      if (state.draft) cancelDraft();
      else setAnnotating(false);
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setAnnotating(!state.annotating);
    }
  }, true);
  addEventListener("scroll", () => { renderTarget(); renderPins(); }, true);
  addEventListener("resize", () => { renderTarget(); renderPins(); });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "toggle") toggle();
  });

  annotateButton.addEventListener("click", () => setAnnotating(!state.annotating));
  $(".close").addEventListener("click", toggle);
  $(".cancel").addEventListener("click", cancelDraft);
  $(".save").addEventListener("click", saveDraft);
  textarea.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveDraft();
  });
  clearButton.addEventListener("click", clearNotes);
  sendButton.addEventListener("click", send);

  window.__hermesUiFeedback = { toggle };
  chrome.runtime.sendMessage({ type: "load-notes" }).then((saved) => {
    state.notes = Array.isArray(saved?.notes) ? saved.notes : [];
    render();
  });
  render();
})();
