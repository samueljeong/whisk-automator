# Flow 카드 DOM 진단

아래를 복사해서 Flow 탭 콘솔에 붙여넣기:

```js
(function(){var imgs=document.querySelectorAll('img');var g=[];for(var i=0;i<imgs.length;i++){if(imgs[i].src&&imgs[i].src.includes('getMediaUrlRedirect')){g.push(imgs[i])}}console.log('=== 생성 이미지 '+g.length+'개 ===');for(var gi=0;gi<Math.min(3,g.length);gi++){var img=g[gi];console.log('\n--- 이미지 #'+(gi+1)+' ---');console.log('src:',img.src.substring(0,80));console.log('size:',img.width+'x'+img.height);var el=img;for(var d=0;d<15;d++){el=el.parentElement;if(!el||el===document.body)break;var text=(el.textContent||'').trim();var tag=el.tagName.toLowerCase();var cls=el.className?(typeof el.className==='string'?el.className:''):'';var rect=el.getBoundingClientRect();console.log('depth='+d+' <'+tag+'> class="'+cls.substring(0,60)+'" size='+Math.round(rect.width)+'x'+Math.round(rect.height)+' textLen='+text.length+(text.length>0&&text.length<500?' text="'+text.substring(0,150)+'"':''));if(text.length>50&&text.length<5000){console.log('  전체:',text.substring(0,300));var ch=el.children;for(var ci=0;ci<ch.length;ci++){var c=ch[ci];console.log('  자식['+ci+'] <'+c.tagName.toLowerCase()+'> text="'+(c.textContent||'').trim().substring(0,100)+'"')}}}}console.log('\n=== 완료 ===')})();
```
