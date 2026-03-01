(async function() {
  var log = [];
  function p(s) { log.push(s); console.log(s); }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  p("=== Flow @ autocomplete DOM debug ===");

  var editor = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!editor) { p("ERROR: no editor found"); return; }
  p("editor found: " + editor.tagName);
  editor.focus();
  await sleep(300);

  var domChanges = [];
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "childList") {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var node = m.addedNodes[j];
          if (node.nodeType === 1) {
            var tag = node.tagName;
            var cls = (node.className || "").toString().slice(0, 100);
            var role = node.getAttribute ? (node.getAttribute("role") || "") : "";
            var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
            var size = rect ? (Math.round(rect.width) + "x" + Math.round(rect.height)) : "?";
            var text = (node.textContent || "").slice(0, 80).replace(/\n/g, " ").trim();
            var html = (node.outerHTML || "").slice(0, 200);
            domChanges.push({ tag: tag, cls: cls, role: role, size: size, text: text, html: html });
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  p("observer ready");

  var ev = new InputEvent("beforeinput", {
    inputType: "insertText", data: "@",
    bubbles: true, cancelable: true, composed: true
  });
  editor.dispatchEvent(ev);
  await sleep(100);

  var hasAt = (editor.textContent || "").indexOf("@") >= 0;
  p("has @: " + hasAt);

  if (!hasAt) {
    p("trying selection range method...");
    var sel = window.getSelection();
    if (sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      var tn = document.createTextNode("@");
      range.insertNode(tn);
      range.setStartAfter(tn);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  await sleep(200);
  p("editor text: " + (editor.textContent || "").slice(0, 100));
  p("waiting for autocomplete...");

  var panelEl = null;
  var sels = ['[role="listbox"]', '[role="menu"]', '[role="option"]', '[data-radix-popper-content-wrapper]'];

  for (var i = 0; i < 10; i++) {
    await sleep(300);
    for (var si = 0; si < sels.length; si++) {
      var els = document.querySelectorAll(sels[si]);
      for (var ei = 0; ei < els.length; ei++) {
        var r = els[ei].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          p("FOUND: " + sels[si] + " " + els[ei].tagName + " " + Math.round(r.width) + "x" + Math.round(r.height));
          p("  text: " + (els[ei].textContent || "").slice(0, 100).replace(/\n/g, " "));
          if (!panelEl) panelEl = els[ei];
        }
      }
    }
    if (domChanges.length > 0 && i >= 2) break;
  }

  p("DOM changes: " + domChanges.length);
  for (var di = 0; di < domChanges.length; di++) {
    var c = domChanges[di];
    p("  " + c.tag + (c.role ? "[" + c.role + "]" : "") + " " + c.size + " " + c.text.slice(0, 60));
  }

  if (panelEl) {
    var items = panelEl.querySelectorAll('[role="option"], li, [data-radix-collection-item]');
    p("panel items: " + items.length);
    for (var ii = 0; ii < items.length; ii++) {
      var ir = items[ii].getBoundingClientRect();
      p("  [" + ii + "] " + items[ii].tagName + " " + Math.round(ir.width) + "x" + Math.round(ir.height) + " " + (items[ii].textContent || "").slice(0, 60));
    }
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await sleep(200);
    var f = panelEl.querySelector('[data-highlighted],[aria-selected="true"],:focus');
    p(f ? "focused: " + (f.textContent || "").slice(0, 60) : "no focus after ArrowDown");
  } else {
    p("NO autocomplete panel found");
  }

  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
  await sleep(100);
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
  observer.disconnect();

  p("=== DONE ===");
  var fullLog = log.join("\n");
  console.log("\n" + fullLog);
  try { await navigator.clipboard.writeText(fullLog); p("copied!"); } catch(e) { p("copy failed"); }
})();
