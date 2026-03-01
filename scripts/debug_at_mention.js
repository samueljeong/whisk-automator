(async function() {
  var log = [];
  function p(s) { log.push(s); console.log(s); }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  p("=== Flow @ asset select debug v3 ===");

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

  function describeEditor() {
    var nodes = editor.querySelectorAll("*");
    var desc = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var tag = n.tagName;
      var ce = n.getAttribute("contenteditable");
      var dv = n.getAttribute("data-slate-void");
      var img = n.querySelector("img");
      var r = n.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        var info = tag;
        if (ce === "false") info += "[ce=false]";
        if (dv) info += "[void]";
        if (img) info += "[has-img src=" + img.src.slice(0, 60) + "]";
        info += " " + Math.round(r.width) + "x" + Math.round(r.height);
        info += " text=" + (n.textContent || "").slice(0, 40);
        desc.push(info);
      }
    }
    return desc;
  }

  // === STEP 1: type @ and open panel ===
  p("\n--- STEP 1: type @ ---");
  clearEditor();
  await sleep(200);
  editor.focus();
  typeAt();
  await sleep(800);

  var panel = getPanel();
  if (!panel) { p("ERROR: panel not found"); return; }
  p("panel open: " + Math.round(panel.getBoundingClientRect().width) + "x" + Math.round(panel.getBoundingClientRect().height));

  // === STEP 2: examine panel structure ===
  p("\n--- STEP 2: panel structure ---");

  var searchInput = panel.querySelector("input");
  if (searchInput) {
    p("search input found: placeholder=" + (searchInput.placeholder || "none") + " type=" + (searchInput.type || "text"));
  } else {
    p("no search input in panel");
  }

  var allDivs = panel.querySelectorAll("div");
  var assetItems = [];
  for (var i = 0; i < allDivs.length; i++) {
    var r = allDivs[i].getBoundingClientRect();
    var t = (allDivs[i].textContent || "").trim();
    if (r.width > 200 && r.width < 300 && r.height > 40 && r.height < 80 && t.length > 0) {
      assetItems.push({ el: allDivs[i], text: t, cls: (allDivs[i].className || "").toString().slice(0, 60) });
    }
  }
  p("asset items found: " + assetItems.length);
  for (var i = 0; i < Math.min(assetItems.length, 5); i++) {
    p("  [" + i + "] " + assetItems[i].text.slice(0, 50) + " cls=" + assetItems[i].cls.slice(0, 40));
  }

  var sections = panel.querySelectorAll("button, [role='tab'], [role='button'], h2, h3, label");
  p("controls: " + sections.length);
  for (var i = 0; i < sections.length; i++) {
    var sr = sections[i].getBoundingClientRect();
    if (sr.width > 0) {
      p("  " + sections[i].tagName + " " + Math.round(sr.width) + "x" + Math.round(sr.height) + " text=" + (sections[i].textContent || "").slice(0, 40));
    }
  }

  // === STEP 3: try search input ===
  p("\n--- STEP 3: search for yonga ---");
  if (searchInput) {
    p("typing in search input...");
    searchInput.focus();
    searchInput.value = "";
    for (var ci = 0; ci < "yonga".length; ci++) {
      var ch = "yonga"[ci];
      searchInput.value += ch;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(100);
    }
    await sleep(500);
    p("search value: " + searchInput.value);

    var afterItems = [];
    var allDivs2 = panel.querySelectorAll("div");
    for (var i = 0; i < allDivs2.length; i++) {
      var r2 = allDivs2[i].getBoundingClientRect();
      var t2 = (allDivs2[i].textContent || "").trim();
      if (r2.width > 200 && r2.width < 300 && r2.height > 40 && r2.height < 80 && t2.length > 0) {
        afterItems.push({ el: allDivs2[i], text: t2 });
      }
    }
    p("items after search: " + afterItems.length);
    for (var i = 0; i < Math.min(afterItems.length, 5); i++) {
      p("  [" + i + "] " + afterItems[i].text.slice(0, 50));
    }
  } else {
    p("no search input, trying keyboard filter...");
    var filterChars = "yonga";
    for (var ci = 0; ci < filterChars.length; ci++) {
      var ch = filterChars[ci];
      var ko = { key: ch, code: "Key" + ch.toUpperCase(), bubbles: true, cancelable: true };
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", ko));
      document.activeElement.dispatchEvent(new KeyboardEvent("keypress", ko));
      document.execCommand("insertText", false, ch);
      document.activeElement.dispatchEvent(new KeyboardEvent("keyup", ko));
      await sleep(100);
    }
    await sleep(500);
    p("editor text after filter: " + (editor.textContent || "").slice(0, 50));
  }

  // === STEP 4: try ArrowDown + Enter to select ===
  p("\n--- STEP 4: keyboard select ---");
  var beforeNodes = describeEditor();
  p("editor nodes before select: " + beforeNodes.length);

  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  await sleep(200);
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  await sleep(200);

  var highlighted = panel.querySelector("[data-highlighted], [aria-selected='true'], [class*='highlight'], [class*='active'], [class*='selected']");
  if (highlighted) {
    p("highlighted item: " + (highlighted.textContent || "").slice(0, 50));
  } else {
    p("no highlighted item found");
    var style = document.querySelectorAll("[style*='background']");
    for (var si = 0; si < style.length; si++) {
      var sr = style[si].getBoundingClientRect();
      if (sr.width > 200 && sr.width < 300 && sr.height > 40 && sr.height < 80) {
        p("  bg-styled item: " + (style[si].textContent || "").slice(0, 50) + " bg=" + style[si].style.background);
      }
    }
  }

  p("pressing Enter...");
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(800);

  // === STEP 5: check what was inserted ===
  p("\n--- STEP 5: result after Enter ---");
  var panelAfter = getPanel();
  p("panel still open: " + (panelAfter ? "YES " + Math.round(panelAfter.getBoundingClientRect().width) + "x" + Math.round(panelAfter.getBoundingClientRect().height) : "NO (closed)"));

  var afterNodes = describeEditor();
  p("editor nodes after select: " + afterNodes.length);
  for (var i = 0; i < afterNodes.length; i++) {
    p("  " + afterNodes[i]);
  }

  p("editor innerHTML (first 500): " + editor.innerHTML.slice(0, 500));
  p("editor textContent: " + (editor.textContent || "").slice(0, 100));

  var voids = editor.querySelectorAll("[data-slate-void], [contenteditable='false']");
  p("void/non-editable nodes: " + voids.length);
  for (var vi = 0; vi < voids.length; vi++) {
    var vr = voids[vi].getBoundingClientRect();
    var vimg = voids[vi].querySelector("img");
    p("  void[" + vi + "] " + voids[vi].tagName + " " + Math.round(vr.width) + "x" + Math.round(vr.height) + (vimg ? " img=" + vimg.src.slice(0, 60) : "") + " text=" + (voids[vi].textContent || "").slice(0, 40));
  }

  // === STEP 6: try typing text after asset ===
  p("\n--- STEP 6: type text after asset ---");
  document.execCommand("insertText", false, " test prompt text");
  await sleep(300);
  p("final editor text: " + (editor.textContent || "").slice(0, 150));
  p("final editor HTML (500): " + editor.innerHTML.slice(0, 500));

  clearEditor();
  p("\n=== DONE ===");
  var fullLog = log.join("\n");
  console.log("\n" + fullLog);
  try { await navigator.clipboard.writeText(fullLog); p("copied!"); } catch(e) { p("copy failed"); }
})();
