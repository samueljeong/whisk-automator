(async function() {
  var log = [];
  function p(s) { log.push(s); console.log(s); }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  p("=== Flow @ autocomplete debug v2 ===");
  p("trying 4 different input methods");

  var editor = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!editor) { p("ERROR: no editor found"); return; }
  editor.focus();
  await sleep(300);

  function clearEditor() {
    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
  }

  function watchDOM(duration) {
    var changes = [];
    var obs = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.nodeType === 1) {
              var r = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
              var size = r ? (Math.round(r.width) + "x" + Math.round(r.height)) : "?";
              var role = node.getAttribute ? (node.getAttribute("role") || "") : "";
              changes.push({
                tag: node.tagName,
                role: role,
                size: size,
                cls: (node.className || "").toString().slice(0, 60),
                text: (node.textContent || "").slice(0, 80).replace(/\n/g, " ").trim()
              });
            }
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return { changes: changes, stop: function() { obs.disconnect(); } };
  }

  async function checkAutocomplete(label) {
    await sleep(500);
    var found = false;
    var sels = [
      '[role="listbox"]', '[role="menu"]', '[role="option"]',
      '[data-radix-popper-content-wrapper]',
      '[data-radix-menu-content]',
      '[class*="mention"]', '[class*="Mention"]',
      '[class*="suggest"]', '[class*="Suggest"]',
      '[class*="autocomplete"]', '[class*="Autocomplete"]',
      '[class*="dropdown"]', '[class*="Dropdown"]',
      '[class*="popup"]', '[class*="Popup"]',
      '[class*="popover"]', '[class*="Popover"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      for (var j = 0; j < els.length; j++) {
        var r = els[j].getBoundingClientRect();
        if (r.width > 30 && r.height > 20) {
          p("  >> PANEL " + sels[i] + " " + Math.round(r.width) + "x" + Math.round(r.height) + " text=" + (els[j].textContent || "").slice(0, 60));
          found = true;
        }
      }
    }
    if (!found) p("  " + label + ": no autocomplete panel");
    return found;
  }

  // === METHOD 1: execCommand insertText ===
  p("\n--- Method 1: execCommand ---");
  clearEditor();
  await sleep(200);
  editor.focus();
  var w1 = watchDOM();
  document.execCommand("insertText", false, "@");
  await sleep(100);
  p("  editor: " + (editor.textContent || "").slice(0, 50));
  p("  DOM changes: " + w1.changes.length);
  for (var i = 0; i < w1.changes.length; i++) {
    p("    " + w1.changes[i].tag + (w1.changes[i].role ? "[" + w1.changes[i].role + "]" : "") + " " + w1.changes[i].size + " " + w1.changes[i].text.slice(0, 40));
  }
  var found1 = await checkAutocomplete("M1");
  w1.stop();

  // === METHOD 2: full keyboard sequence ===
  p("\n--- Method 2: KeyboardEvent sequence ---");
  clearEditor();
  await sleep(200);
  editor.focus();
  var w2 = watchDOM();
  var keyOpts = { key: "@", code: "Digit2", keyCode: 50, which: 50, shiftKey: true, bubbles: true, cancelable: true };
  editor.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
  editor.dispatchEvent(new KeyboardEvent("keypress", keyOpts));
  editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "@", bubbles: true, cancelable: true, composed: true }));
  document.execCommand("insertText", false, "@");
  editor.dispatchEvent(new KeyboardEvent("keyup", keyOpts));
  await sleep(100);
  p("  editor: " + (editor.textContent || "").slice(0, 50));
  p("  DOM changes: " + w2.changes.length);
  for (var i = 0; i < w2.changes.length; i++) {
    p("    " + w2.changes[i].tag + (w2.changes[i].role ? "[" + w2.changes[i].role + "]" : "") + " " + w2.changes[i].size + " " + w2.changes[i].text.slice(0, 40));
  }
  var found2 = await checkAutocomplete("M2");
  w2.stop();

  // === METHOD 3: DataTransfer paste ===
  p("\n--- Method 3: paste @ via DataTransfer ---");
  clearEditor();
  await sleep(200);
  editor.focus();
  var w3 = watchDOM();
  var dt = new DataTransfer();
  dt.setData("text/plain", "@");
  var pasteEv = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
  editor.dispatchEvent(pasteEv);
  await sleep(100);
  p("  editor: " + (editor.textContent || "").slice(0, 50));
  p("  DOM changes: " + w3.changes.length);
  for (var i = 0; i < w3.changes.length; i++) {
    p("    " + w3.changes[i].tag + (w3.changes[i].role ? "[" + w3.changes[i].role + "]" : "") + " " + w3.changes[i].size + " " + w3.changes[i].text.slice(0, 40));
  }
  var found3 = await checkAutocomplete("M3");
  w3.stop();

  // === METHOD 4: type @ then asset name char by char ===
  p("\n--- Method 4: execCommand @ then type asset name ---");
  clearEditor();
  await sleep(200);
  editor.focus();
  var w4 = watchDOM();
  document.execCommand("insertText", false, "@");
  await sleep(300);
  var chars = "yonga";
  for (var ci = 0; ci < chars.length; ci++) {
    var ch = chars[ci];
    var ko = { key: ch, code: "Key" + ch.toUpperCase(), bubbles: true, cancelable: true };
    editor.dispatchEvent(new KeyboardEvent("keydown", ko));
    document.execCommand("insertText", false, ch);
    editor.dispatchEvent(new KeyboardEvent("keyup", ko));
    await sleep(100);
  }
  p("  editor: " + (editor.textContent || "").slice(0, 50));
  p("  DOM changes: " + w4.changes.length);
  for (var i = 0; i < w4.changes.length; i++) {
    p("    " + w4.changes[i].tag + (w4.changes[i].role ? "[" + w4.changes[i].role + "]" : "") + " " + w4.changes[i].size + " " + w4.changes[i].text.slice(0, 40));
  }
  var found4 = await checkAutocomplete("M4");
  w4.stop();

  // === SUMMARY ===
  p("\n=== RESULTS ===");
  p("Method 1 (execCommand): " + (found1 ? "YES" : "NO"));
  p("Method 2 (keyboard seq): " + (found2 ? "YES" : "NO"));
  p("Method 3 (paste): " + (found3 ? "YES" : "NO"));
  p("Method 4 (@ + name): " + (found4 ? "YES" : "NO"));

  clearEditor();
  await sleep(100);

  p("=== DONE ===");
  var fullLog = log.join("\n");
  console.log("\n" + fullLog);
  try { await navigator.clipboard.writeText(fullLog); p("copied!"); } catch(e) { p("copy failed - select log above"); }
})();
