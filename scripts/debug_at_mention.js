(async function() {
  var log = [];
  function p(s) { log.push(s); console.log(s); }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  p("=== Flow @ asset v6 - clean single path ===");

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

  async function insertAsset(name) {
    typeAt();
    await sleep(800);
    var panel = getPanel();
    if (!panel) { p("  panel not found"); return false; }
    var searchInput = panel.querySelector("input");
    if (!searchInput) { p("  search not found"); return false; }
    searchInput.focus();
    setReactInput(searchInput, name);
    await sleep(500);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await sleep(200);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(800);
    return !getPanel();
  }

  // ============================
  // TEST 1: single asset + text
  // ============================
  p("\n=== TEST 1: @yonga + text ===");
  clearEditor();
  await sleep(300);

  var v0 = editor.querySelectorAll("[data-slate-void]").length;
  p("voids start: " + v0);

  var ok1 = await insertAsset("yonga");
  p("insert result: " + (ok1 ? "panel closed" : "panel still open"));

  var v1 = editor.querySelectorAll("[data-slate-void]").length;
  p("voids after: " + v1);

  var voids1 = editor.querySelectorAll("[data-slate-void]");
  for (var i = 0; i < voids1.length; i++) {
    p("  void: " + (voids1[i].textContent || "").trim().slice(0, 50));
  }

  // type text after
  p("typing text after asset...");
  editor.focus();
  await sleep(100);

  // move cursor to end
  var sel = window.getSelection();
  var range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  document.execCommand("insertText", false, " Dark room with candle");
  await sleep(200);
  p("editor text: " + (editor.textContent || "").replace(/\u200B/g, "").replace(/\uFEFF/g, "").trim());

  // ============================
  // TEST 2: text + @asset + text
  // ============================
  p("\n=== TEST 2: text + @yonga + text ===");
  clearEditor();
  await sleep(300);

  editor.focus();
  document.execCommand("insertText", false, "A warrior named ");
  await sleep(200);

  var ok2 = await insertAsset("yonga");
  p("insert result: " + (ok2 ? "panel closed" : "panel still open"));

  // cursor to end
  editor.focus();
  sel = window.getSelection();
  range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  document.execCommand("insertText", false, " stands on a cliff");
  await sleep(200);

  p("editor text: " + (editor.textContent || "").replace(/\u200B/g, "").replace(/\uFEFF/g, "").trim());

  var voids2 = editor.querySelectorAll("[data-slate-void]");
  p("voids: " + voids2.length);
  for (var i = 0; i < voids2.length; i++) {
    p("  void: " + (voids2[i].textContent || "").trim().slice(0, 50));
  }

  // ============================
  // TEST 3: two assets
  // ============================
  p("\n=== TEST 3: @yonga fights @soyeon ===");
  clearEditor();
  await sleep(300);

  editor.focus();
  var ok3a = await insertAsset("yonga");
  p("yonga insert: " + (ok3a ? "OK" : "FAIL"));

  editor.focus();
  sel = window.getSelection();
  range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertText", false, " fights ");
  await sleep(200);

  var ok3b = await insertAsset("soyeon");
  p("soyeon insert: " + (ok3b ? "OK" : "FAIL"));

  editor.focus();
  sel = window.getSelection();
  range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertText", false, " in the rain");
  await sleep(200);

  p("editor text: " + (editor.textContent || "").replace(/\u200B/g, "").replace(/\uFEFF/g, "").trim());

  var voids3 = editor.querySelectorAll("[data-slate-void]");
  p("voids: " + voids3.length);
  for (var i = 0; i < voids3.length; i++) {
    p("  void: " + (voids3[i].textContent || "").trim().slice(0, 50));
  }

  p("final HTML (300): " + editor.innerHTML.slice(0, 300));

  clearEditor();
  p("\n=== ALL TESTS DONE ===");
  var fullLog = log.join("\n");
  console.log("\n" + fullLog);
  try { await navigator.clipboard.writeText(fullLog); p("copied!"); } catch(e) { p("copy failed"); }
})();
