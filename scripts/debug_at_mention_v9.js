(async function() {
  var log = [];
  function p(s) { log.push(s); console.log(s); }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  p("=== v9: full integration test ===");

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

  function setReactInput(input, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function moveCursorToEnd() {
    editor.focus();
    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function insertAsset(name) {
    p("  inserting @" + name + "...");
    typeAt();
    await sleep(800);

    var panel = document.querySelector("[data-radix-popper-content-wrapper]");
    if (!panel) { p("  ERROR: no panel after @"); return false; }

    var searchInput = panel.querySelector("input");
    if (!searchInput) { p("  ERROR: no search input"); return false; }

    searchInput.focus();
    setReactInput(searchInput, name);
    await sleep(800);

    // find onclick item matching #name.png
    var target = null;
    var allDivs = panel.querySelectorAll("div");
    for (var i = 0; i < allDivs.length; i++) {
      var d = allDivs[i];
      var txt = (d.textContent || "").trim();
      if (txt === "#" + name + ".png" && d.onclick) {
        target = d;
        break;
      }
    }

    if (!target) {
      p("  ERROR: no onclick item for #" + name + ".png");
      // try fallback: any onclick item containing the name
      for (var i = 0; i < allDivs.length; i++) {
        var d2 = allDivs[i];
        if (d2.onclick && (d2.textContent || "").indexOf(name) >= 0) {
          target = d2;
          p("  fallback found: " + (d2.textContent || "").trim().slice(0, 30));
          break;
        }
      }
    }

    if (!target) { p("  ERROR: no target at all"); return false; }

    // click to insert void
    target.click();
    await sleep(300);

    // close panel via img click
    var img = target.querySelector("img");
    if (img) {
      img.click();
      await sleep(300);
    }

    // if panel still open, try Escape
    if (document.querySelector("[data-radix-popper-content-wrapper]")) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(300);
    }

    var panelGone = !document.querySelector("[data-radix-popper-content-wrapper]");
    var voids = editor.querySelectorAll("[data-slate-void]").length;
    p("  result: panel=" + (panelGone ? "closed" : "OPEN") + " voids=" + voids);
    return panelGone;
  }

  function typeText(text) {
    editor.focus();
    moveCursorToEnd();
    document.execCommand("insertText", false, text);
  }

  function getEditorInfo() {
    var voids = editor.querySelectorAll("[data-slate-void]");
    var txt = (editor.textContent || "").replace(/\u200B/g, "").replace(/\uFEFF/g, "").trim();
    var names = [];
    for (var i = 0; i < voids.length; i++) {
      names.push((voids[i].textContent || "").trim().slice(0, 20));
    }
    return { voidCount: voids.length, voidNames: names, text: txt };
  }

  // ============================
  // TEST 1: @yonga + text
  // ============================
  p("\n========== TEST 1: @yonga + text ==========");
  clearEditor();
  await sleep(300);

  var ok1 = await insertAsset("yonga");
  if (!ok1) { p("TEST 1 FAILED at asset insert"); }

  await sleep(300);
  typeText(" Dark room with a single flickering candle");
  await sleep(300);

  var info1 = getEditorInfo();
  p("voids: " + info1.voidCount + " [" + info1.voidNames.join(", ") + "]");
  p("text: " + info1.text.slice(0, 100));
  p("TEST 1: " + (info1.voidCount === 1 && info1.text.indexOf("candle") >= 0 ? "PASS" : "FAIL"));

  // ============================
  // TEST 2: text + @yonga + text
  // ============================
  p("\n========== TEST 2: text + @yonga + text ==========");
  clearEditor();
  await sleep(300);

  typeText("A warrior named ");
  await sleep(300);

  var ok2 = await insertAsset("yonga");
  if (!ok2) { p("TEST 2 FAILED at asset insert"); }

  await sleep(300);
  typeText(" stands on a cliff");
  await sleep(300);

  var info2 = getEditorInfo();
  p("voids: " + info2.voidCount + " [" + info2.voidNames.join(", ") + "]");
  p("text: " + info2.text.slice(0, 100));
  p("TEST 2: " + (info2.voidCount === 1 && info2.text.indexOf("cliff") >= 0 ? "PASS" : "FAIL"));

  // ============================
  // TEST 3: @yonga + text + @soyeon + text
  // ============================
  p("\n========== TEST 3: @yonga + text + @soyeon + text ==========");
  clearEditor();
  await sleep(300);

  var ok3a = await insertAsset("yonga");
  if (!ok3a) { p("TEST 3 FAILED at yonga insert"); }

  await sleep(300);
  typeText(" fights ");
  await sleep(300);

  var ok3b = await insertAsset("soyeon");
  if (!ok3b) { p("TEST 3 FAILED at soyeon insert"); }

  await sleep(300);
  typeText(" in the rain");
  await sleep(300);

  var info3 = getEditorInfo();
  p("voids: " + info3.voidCount + " [" + info3.voidNames.join(", ") + "]");
  p("text: " + info3.text.slice(0, 150));
  p("TEST 3: " + (info3.voidCount === 2 && info3.text.indexOf("rain") >= 0 ? "PASS" : "FAIL"));

  // ============================
  // TEST 4: @yonga + text + @soyeon + text (longer prompt)
  // ============================
  p("\n========== TEST 4: realistic prompt ==========");
  clearEditor();
  await sleep(300);

  var ok4a = await insertAsset("yonga");
  await sleep(300);
  typeText(" A lone warrior standing at the edge of a cliff, wind blowing through his dark robes, ");
  await sleep(300);

  var ok4b = await insertAsset("soyeon");
  await sleep(300);
  typeText(" approaches from behind holding a lantern, night scene, cinematic lighting");
  await sleep(300);

  var info4 = getEditorInfo();
  p("voids: " + info4.voidCount + " [" + info4.voidNames.join(", ") + "]");
  p("text: " + info4.text.slice(0, 200));
  p("TEST 4: " + (info4.voidCount === 2 && info4.text.indexOf("lantern") >= 0 ? "PASS" : "FAIL"));

  // ============================
  // SUMMARY
  // ============================
  p("\n========== SUMMARY ==========");
  var t1 = info1.voidCount === 1 && info1.text.indexOf("candle") >= 0;
  var t2 = info2.voidCount === 1 && info2.text.indexOf("cliff") >= 0;
  var t3 = info3.voidCount === 2 && info3.text.indexOf("rain") >= 0;
  var t4 = info4.voidCount === 2 && info4.text.indexOf("lantern") >= 0;
  p("TEST 1 (asset+text): " + (t1 ? "PASS" : "FAIL"));
  p("TEST 2 (text+asset+text): " + (t2 ? "PASS" : "FAIL"));
  p("TEST 3 (2 assets+text): " + (t3 ? "PASS" : "FAIL"));
  p("TEST 4 (realistic prompt): " + (t4 ? "PASS" : "FAIL"));
  p("Result: " + (t1 && t2 && t3 && t4 ? "ALL PASS" : "SOME FAILED"));

  clearEditor();
  p("\n=== v9 DONE ===");
  var fullLog = log.join("\n");
  console.log("\n" + fullLog);
  try { await navigator.clipboard.writeText(fullLog); p("copied!"); } catch(e) { p("copy failed"); }
})();
