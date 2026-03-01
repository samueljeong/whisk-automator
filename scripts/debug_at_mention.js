(async function() {
  var log = [];
  function p(s) { log.push(s); console.log(s); }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  p("=== Flow @ asset select debug v4 ===");

  var editor = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!editor) { p("ERROR: no editor"); return; }
  editor.focus();
  await sleep(300);

  function clearEditor() {
    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
  }

  function typeAt() {
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

  function setReactInput(input, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // === STEP 1: open panel ===
  p("--- STEP 1: open panel ---");
  clearEditor();
  await sleep(200);
  editor.focus();
  typeAt();
  await sleep(800);

  var panel = getPanel();
  if (!panel) { p("ERROR: panel not found"); return; }
  p("panel open OK");

  var searchInput = panel.querySelector("input");
  if (!searchInput) { p("ERROR: no search input"); return; }
  p("search input found");

  var itemsBefore = getAssetItems(panel);
  p("items before search: " + itemsBefore.length);

  // === STEP 2: React search - Method A ===
  p("\n--- STEP 2A: React nativeInputValueSetter ---");
  searchInput.focus();
  setReactInput(searchInput, "yonga");
  await sleep(500);

  var itemsA = getAssetItems(panel);
  p("items after React set: " + itemsA.length);
  for (var i = 0; i < Math.min(itemsA.length, 5); i++) {
    p("  [" + i + "] " + itemsA[i].text.slice(0, 50));
  }

  // === STEP 2B: clear and try keyboard typing ===
  p("\n--- STEP 2B: clear + keyboard char by char ---");
  setReactInput(searchInput, "");
  await sleep(300);

  var itemsCleared = getAssetItems(panel);
  p("items after clear: " + itemsCleared.length);

  searchInput.focus();
  var word = "yonga";
  for (var ci = 0; ci < word.length; ci++) {
    var ch = word[ci];
    var ko = { key: ch, code: "Key" + ch.toUpperCase(), keyCode: ch.charCodeAt(0), bubbles: true, cancelable: true };
    searchInput.dispatchEvent(new KeyboardEvent("keydown", ko));
    searchInput.dispatchEvent(new KeyboardEvent("keypress", ko));
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(searchInput, searchInput.value + ch);
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keyup", ko));
    await sleep(100);
  }
  await sleep(500);

  var itemsB = getAssetItems(panel);
  p("items after keyboard: " + itemsB.length);
  for (var i = 0; i < Math.min(itemsB.length, 5); i++) {
    p("  [" + i + "] " + itemsB[i].text.slice(0, 50));
  }

  // === STEP 2C: try execCommand on search input ===
  p("\n--- STEP 2C: execCommand on search input ---");
  setReactInput(searchInput, "");
  await sleep(300);
  searchInput.focus();
  document.execCommand("insertText", false, "yonga");
  await sleep(500);

  p("search value: " + searchInput.value);
  var itemsC = getAssetItems(panel);
  p("items after execCommand: " + itemsC.length);
  for (var i = 0; i < Math.min(itemsC.length, 5); i++) {
    p("  [" + i + "] " + itemsC[i].text.slice(0, 50));
  }

  // === STEP 3: direct click on first yonga item ===
  p("\n--- STEP 3: direct click on #yonga item ---");
  setReactInput(searchInput, "");
  await sleep(300);

  var allItems = getAssetItems(panel);
  var yongaItem = null;
  for (var i = 0; i < allItems.length; i++) {
    if (allItems[i].text.indexOf("yonga") >= 0) {
      yongaItem = allItems[i];
      p("found yonga item: " + allItems[i].text);
      break;
    }
  }

  if (yongaItem) {
    editor.focus();
    await sleep(100);

    var voidsBefore = editor.querySelectorAll("[data-slate-void]").length;
    p("voids before click: " + voidsBefore);

    var rect = yongaItem.el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var clickOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 };

    yongaItem.el.dispatchEvent(new PointerEvent("pointerdown", clickOpts));
    yongaItem.el.dispatchEvent(new MouseEvent("mousedown", clickOpts));
    yongaItem.el.dispatchEvent(new PointerEvent("pointerup", clickOpts));
    yongaItem.el.dispatchEvent(new MouseEvent("mouseup", clickOpts));
    yongaItem.el.dispatchEvent(new MouseEvent("click", clickOpts));
    await sleep(800);

    var voidsAfter = editor.querySelectorAll("[data-slate-void]").length;
    p("voids after click: " + voidsAfter);
    p("panel still open: " + (getPanel() ? "YES" : "NO"));

    if (voidsAfter > voidsBefore) {
      p("SUCCESS: void node added by click!");
      var lastVoid = editor.querySelectorAll("[data-slate-void]")[voidsAfter - 1];
      p("inserted: " + (lastVoid.textContent || "").slice(0, 60));
    } else {
      p("click did not insert void node");

      // try .click() native
      p("trying native .click()...");
      yongaItem.el.click();
      await sleep(800);

      var voidsNative = editor.querySelectorAll("[data-slate-void]").length;
      p("voids after native click: " + voidsNative);
      p("panel still open: " + (getPanel() ? "YES" : "NO"));
    }
  } else {
    p("yonga item not found in panel");
  }

  // === STEP 4: check final editor state ===
  p("\n--- STEP 4: final state ---");
  var finalVoids = editor.querySelectorAll("[data-slate-void]");
  p("total void nodes: " + finalVoids.length);
  for (var vi = 0; vi < finalVoids.length; vi++) {
    p("  void[" + vi + "] " + (finalVoids[vi].textContent || "").slice(0, 60));
  }
  p("editor text: " + (editor.textContent || "").slice(0, 150));

  clearEditor();
  p("\n=== DONE ===");
  var fullLog = log.join("\n");
  console.log("\n" + fullLog);
  try { await navigator.clipboard.writeText(fullLog); p("copied!"); } catch(e) { p("copy failed"); }
})();
