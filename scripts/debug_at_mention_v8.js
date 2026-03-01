(async function(){
  var log=[];
  function p(s){log.push(s);console.log(s)}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}

  p("=== v8: search input + click asset ===");
  var editor=document.querySelector('[role="textbox"][contenteditable="true"]');
  if(!editor){p("ERROR: no editor");return}

  editor.focus();
  document.execCommand("selectAll",false,null);
  document.execCommand("delete",false,null);
  await sleep(300);

  editor.focus();
  var o={key:"@",code:"Digit2",keyCode:50,which:50,shiftKey:true,bubbles:true,cancelable:true};
  editor.dispatchEvent(new KeyboardEvent("keydown",o));
  editor.dispatchEvent(new KeyboardEvent("keypress",o));
  editor.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data:"@",bubbles:true,cancelable:true,composed:true}));
  document.execCommand("insertText",false,"@");
  editor.dispatchEvent(new KeyboardEvent("keyup",o));
  p("@ typed");
  await sleep(800);

  var panel=document.querySelector("[data-radix-popper-content-wrapper]");
  if(!panel){p("ERROR: no panel");return}
  p("panel found");

  var searchInput=panel.querySelector("input");
  if(!searchInput){p("ERROR: no search input");return}
  p("search input found");

  p("\n--- STEP 1: filter to yonga ---");
  searchInput.focus();
  await sleep(200);
  var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
  setter.call(searchInput,"yonga");
  searchInput.dispatchEvent(new Event("input",{bubbles:true}));
  await sleep(800);

  var itemsAfter=panel.querySelectorAll("img");
  p("images after filter: "+itemsAfter.length);

  var targetItem=null;
  var allDivs=panel.querySelectorAll("div");
  for(var i=0;i<allDivs.length;i++){
    var d=allDivs[i];
    var txt=(d.textContent||"").trim();
    var r=d.getBoundingClientRect();
    if(txt==="#yonga.png"&&r.width>200&&r.height>40&&r.height<80){
      p("target: "+Math.round(r.width)+"x"+Math.round(r.height)+" onclick="+(d.onclick?"YES":"no"));
      if(!targetItem)targetItem=d;
    }
  }

  if(!targetItem){
    p("trying broader search...");
    for(var i=0;i<allDivs.length;i++){
      var d2=allDivs[i];
      var txt2=(d2.textContent||"").trim();
      if(txt2==="#yonga.png"&&d2.onclick){
        targetItem=d2;
        var r2=d2.getBoundingClientRect();
        p("found onclick item: "+Math.round(r2.width)+"x"+Math.round(r2.height));
      }
    }
  }

  if(!targetItem){p("ERROR: no target");return}
  var tr=targetItem.getBoundingClientRect();
  var cx=tr.left+tr.width/2;
  var cy=tr.top+tr.height/2;
  p("target at ("+Math.round(cx)+","+Math.round(cy)+")");

  function checkResult(label){
    var pnl=document.querySelector("[data-radix-popper-content-wrapper]");
    var voids=editor.querySelectorAll("[data-slate-void]");
    p("  "+label+": panel="+(pnl?"open":"CLOSED")+" voids="+voids.length);
    return !pnl&&voids.length>0;
  }

  p("\n--- STEP 2: click methods ---");

  p("\nM1: .click()");
  targetItem.click();
  await sleep(500);
  if(checkResult("click()")){p("SUCCESS!");} else {

  p("\nM2: mousedown+mouseup+click");
  var mOpts={bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:0};
  targetItem.dispatchEvent(new MouseEvent("mousedown",mOpts));
  await sleep(50);
  targetItem.dispatchEvent(new MouseEvent("mouseup",mOpts));
  await sleep(50);
  targetItem.dispatchEvent(new MouseEvent("click",mOpts));
  await sleep(500);
  if(checkResult("mouse events")){p("SUCCESS!");} else {

  p("\nM3: pointer+mouse full");
  targetItem.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:1,pointerType:"mouse"}));
  await sleep(30);
  targetItem.dispatchEvent(new MouseEvent("mousedown",mOpts));
  await sleep(30);
  targetItem.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:1,pointerType:"mouse"}));
  await sleep(30);
  targetItem.dispatchEvent(new MouseEvent("mouseup",mOpts));
  await sleep(30);
  targetItem.dispatchEvent(new MouseEvent("click",mOpts));
  await sleep(500);
  if(checkResult("pointer+mouse")){p("SUCCESS!");} else {

  p("\nM4: child elements");
  var img=targetItem.querySelector("img");
  if(img){
    img.click();
    await sleep(500);
    checkResult("img click");
  }
  var childDiv=targetItem.querySelector("div");
  if(childDiv){
    childDiv.click();
    await sleep(500);
    checkResult("child div click");
  }

  p("\nM5: focus+Enter");
  targetItem.setAttribute("tabindex","0");
  targetItem.focus();
  await sleep(100);
  targetItem.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
  await sleep(500);
  checkResult("focus+Enter");

  }}}

  p("\n--- FINAL STATE ---");
  var voids=editor.querySelectorAll("[data-slate-void]");
  p("void nodes: "+voids.length);
  for(var i=0;i<voids.length;i++){
    p("  void "+i+": "+(voids[i].textContent||"").trim().slice(0,50));
  }
  p("editor text: "+(editor.textContent||"").replace(/\u200B/g,"").replace(/\uFEFF/g,"").trim().slice(0,150));

  p("\n=== v8 DONE ===");
  var fullLog=log.join("\n");
  console.log("\n"+fullLog);
  try{await navigator.clipboard.writeText(fullLog);p("copied!")}catch(e){p("copy failed")}
})();
