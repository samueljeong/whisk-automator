(async function() {
  var log = [];
  function p(s) { log.push(s); console.log(s); }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  p("=== Flow @ asset select debug v5 ===");
  p("goal: search yonga + ArrowDown + Enter");

  var editor = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!editor) { p("ERROR: no editor"); return; }

  function clearEditor() {
    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
  }

  function typeAt() {
    editor.focus();
    var o = { key: "@", code: "Digit2", keyCode: 50, which: 50, shiftKey: true, bubbles: true, cancelable: true };
    editor.dispatchEvent(new KeyboardEvent("keydown", o));
    editor.dispatchEvent(new KeyboardEvent("keypress", o));
    editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "@", bubbles: true, cancelable: true, composed: true }));
    document.execCommand("insertText", false, "@");
    editor.dispatchEvent(new KeyboardEvent("keyup", o));
  }

  function getPanel() {
    var els = document.querySelectorAll("[data-radix-popper-content-wrapper]");
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width > 100 && r.height > 100) return els[i];
    }
    return null;
  }

  function setReactInput(input, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function getAssetItems(panel) {
    var allDivs = panel.querySelectorAll("div");
    var items = [];
    for (var i = 0; i < allDivs.length; i++) {
      var r = allDivs[i].getBoundingClientRect();
      var t = (allDivs[i].textContent || "").trim();
      if (r.width > 200 && r.width < 300 && r.height > 40 && r.height < 80 && t.length > 0) {
        items.push({ el: allDivs[i], text: t });
      }
    }
    return items;
  }

  // === TEST: full flow - @ + search + ArrowDown + Enter ===
  clearEditor();
  await sleep(300);

  p("\n--- 1. type @ ---");
  typeAt();
  await sleep(800);

  var panel = getPanel();
  if (!panel) { p("ERROR: no panel"); return; }
  p("panel open OK");

  p("\n--- 2. search yonga ---");
  var searchInput = panel.querySelector("input");
  if (!searchInput) { p("ERROR: no search"); return; }

  searchInput.focus();
  setReactInput(searchInput, "yonga");
  await sleep(500);

  var items = getAssetItems(panel);
  p("filtered items: " + items.length);
  for (var i = 0; i < items.length; i++) {
    p("  [" + i + "] " + items[i].text);
  }

  p("\n--- 3. ArrowDown + Enter ---");
  var voidsBefore = editor.querySelectorAll("[data-slate-void]").length;
  p("voids before: " + voidsBefore);

  searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  await sleep(200);
  searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(800);

  var panel2 = getPanel();
  p("panel closed: " + (panel2 ? "NO" : "YES"));

  var voidsAfter = editor.querySelectorAll("[data-slate-void]").length;
  p("voids after: " + voidsAfter);

  if (voidsAfter > voidsBefore) {
    p("SUCCESS via searchInput keyboard!");
    var voidNodes = editor.querySelectorAll("[data-slate-void]");
    for (var vi = 0; vi < voidNodes.length; vi++) {
      p("  void[" + vi + "] " + (voidNodes[vi].textContent || "").slice(0, 60));
    }
  } else {
    p("searchInput keyboard failed, trying from editor...");

    // reopen if closed
    if (!getPanel()) {
      editor.focus();
      await sleep(200);
      typeAt();
      await sleep(800);
      panel = getPanel();
      if (!panel) { p("ERROR: reopen failed"); return; }
      searchInput = panel.querySelector("input");
      searchInput.focus();
      setReactInput(searchInput, "yonga");
      await sleep(500);
    }

    // try dispatching from document
    p("trying ArrowDown+Enter from document...");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await sleep(200);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(800);

    var voidsDoc = editor.querySelectorAll("[data-slate-void]").length;
    p("voids after doc keyboard: " + voidsDoc);

    if (voidsDoc <= voidsBefore) {
      // try from panel itself
      if (!getPanel()) {
        editor.focus();
        await sleep(200);
        typeAt();
        await sleep(800);
        panel = getPanel();
        searchInput = panel.querySelector("input");
        searchInput.focus();
        setReactInput(searchInput, "yonga");
        await sleep(500);
      }

      p("trying ArrowDown+Enter from panel div...");
      panel = getPanel();
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      await sleep(200);
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await sleep(800);

      var voidsPanel = editor.querySelectorAll("[data-slate-void]").length;
      p("voids after panel keyboard: " + voidsPanel);
    }

    if (editor.querySelectorAll("[data-slate-void]").length <= voidsBefore) {
      // try Tab then Enter
      if (!getPanel()) {
        editor.focus();
        await sleep(200);
        typeAt();
        await sleep(800);
        panel = getPanel();
        searchInput = panel.querySelector("input");
        searchInput.focus();
        setReactInput(searchInput, "yonga");
        await sleep(500);
      }

      p("trying Tab+Enter from searchInput...");
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      await sleep(200);
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await sleep(800);

      var voidsTab = editor.querySelectorAll("[data-slate-void]").length;
      p("voids after Tab+Enter: " + voidsTab);
      p("active element: " + document.activeElement.tagName + " " + (document.activeElement.className || "").toString().slice(0, 40));
    }
  }

  // === FINAL STATE ===
  p("\n--- FINAL STATE ---");
  var finalVoids = editor.querySelectorAll("[data-slate-void]");
  p("total voids: " + finalVoids.length);
  for (var vi = 0; vi < finalVoids.length; vi++) {
    p("  void[" + vi + "] " + (finalVoids[vi].textContent || "").slice(0, 60));
  }
  p("editor text: " + (editor.textContent || "").slice(0, 150));

  // test typing after
  if (finalVoids.length > 0) {
    p("\n--- TYPE TEXT AFTER ---");
    editor.focus();
    await sleep(100);
    document.execCommand("insertText", false, " test after asset");
    await sleep(200);
    p("final text: " + (editor.textContent || "").slice(0, 200));
  }

  clearEditor();
  p("\n=== DONE ===");
  var fullLog = log.join("\n");
  console.log("\n" + fullLog);
  try { await navigator.clipboard.writeText(fullLog); p("copied!"); } catch(e) { p("copy failed"); }
})();
