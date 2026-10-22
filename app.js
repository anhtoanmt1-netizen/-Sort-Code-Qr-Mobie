(() => {
'use strict';
const $ = id => document.getElementById(id);
const state = { data: [], entries: [], nextId: 1, scanner: null, scannerRowId: null, cameras: [], cameraIndex: 0, deferredInstall: null };
const STORAGE = 'spx_qr_data_entry_v1';
const normText = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi').replace(/\s+/g,' ').trim();
function cleanProvince(v){let s=String(v??'').trim().replace(/\s+/g,' ');s=s.replace(/^(tỉnh|tinh)\s+/i,'').trim();return s;}
function titleProvince(v){const s=cleanProvince(v);return s;}
function normHeader(v){return normText(v).replace(/[^a-z0-9]/g,'');}
function parseDataRows(matrix){
 if(!matrix || !matrix.length) throw new Error('Tệp không có dữ liệu.');
 const first=(matrix[0]||[]).map(normHeader);
 const find=(patterns,fallback)=>{for(let i=0;i<first.length;i++)if(patterns.some(p=>first[i]===p||first[i].includes(p)))return i;return fallback;};
 let ip=find(['tinh','province','thanhpho'],0), iw=find(['ward','phuongxa','commune'],1), ih=find(['delistation','hubname','hub'],2), is=find(['sortcode','sortcodenew'],3);
 const start=(first.some(x=>['tinh','province','ward','delistation','sortcode'].some(p=>x===p||x.includes(p))))?1:0;
 const out=[];
 for(let i=start;i<matrix.length;i++){
   const r=matrix[i]||[], province=titleProvince(r[ip]), ward=String(r[iw]??'').trim(), hub=String(r[ih]??'').trim(), sortCode=String(r[is]??'').trim();
   if(province||ward||hub||sortCode)out.push({province,ward,hub,sortCode});
 }
 if(!out.length) throw new Error('Không tìm thấy dòng dữ liệu hợp lệ. Kiểm tra tệp có đủ 4 cột.');
 return out;
}
async function loadInitialData(){
 try{
  const saved=localStorage.getItem('spx_qr_custom_data');
  if(saved){state.data=JSON.parse(saved);setDataStatus(`DATA tùy chỉnh · ${state.data.length} dòng`);}
  else {const res=await fetch('./data.json',{cache:'no-store'});if(!res.ok)throw new Error('Không tải được data.json');state.data=await res.json();setDataStatus(`DATA mặc định · ${state.data.length} dòng`);}
 }catch(e){state.data=[];setDataStatus('Chưa tải được DATA');toast('Không tải được DATA. Hãy mở ứng dụng qua GitHub Pages hoặc tải tệp DATA bằng nút ↑ DATA.',true);}
 populateProvinces(); renderAll();
}
function setDataStatus(t){$('dataStatus').textContent=t;}
function toast(msg,bad=false,good=false){const el=$('toast');el.textContent=msg;el.className='toast'+(bad?' bad':good?' good':'');el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),3000);}
function beep(ok=true){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type='sine';o.frequency.value=ok?880:220;g.gain.value=.07;o.start();g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.22);o.stop(c.currentTime+.23);o.onended=()=>c.close();}catch(e){}}
function uniqueProvinces(){const map=new Map();state.data.forEach(r=>{const p=titleProvince(r.province);if(p){const k=normText(p);if(!map.has(k))map.set(k,p);}});return [...map.values()].sort((a,b)=>a.localeCompare(b,'vi'));}
function populateProvinces(){const sel=$('province'),old=sel.value;sel.innerHTML='<option value="">Tất cả tỉnh</option>';uniqueProvinces().forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;sel.appendChild(o);});if([...sel.options].some(o=>o.value===old))sel.value=old;}
function dataForProvince(){const p=normText($('province').value);return state.data.filter(r=>!p||normText(titleProvince(r.province))===p);}
function createEntry(values={}){return {id:state.nextId++,tracking:values.tracking||'',ward:values.ward||'',hub:values.hub||'',sortCode:values.sortCode||'',message:'',kind:'',duplicate:false};}
function addEntry(values,focus=true){const e=createEntry(values);state.entries.push(e);renderAll();if(focus){const el=document.querySelector(`[data-id="${e.id}"] .tracking`);if(el){el.focus();el.scrollIntoView({behavior:'smooth',block:'center'});}}saveEntries();}
function renderAll(){renderEntries();updateStats();}
function renderEntries(){
 const root=$('entries');root.innerHTML='';
 state.entries.forEach((e,index)=>{
  const card=document.createElement('article');card.className='entry'+(e.duplicate?' duplicate':'');card.dataset.id=e.id;
  card.innerHTML=`<div class="entry-head"><span class="entry-num">HÀNG ${index+1}</span><div style="display:flex;gap:6px"><button class="soft small scan-btn-main" type="button">▦ Quét QR</button><button class="danger small delete-btn" type="button">✕ Xóa</button></div></div>
  <div class="entry-grid">
   <div class="field"><div class="field-title"><label>SPX TRACKING NUMBER *</label></div><input class="tracking" autocomplete="off" autocapitalize="characters" placeholder="Nhập hoặc quét QR" value="${escapeAttr(e.tracking)}"><div class="statusline ${e.kind} tracking-status">${escapeHtml(e.message)}</div></div>
   <div class="field ward-field"><div class="field-title"><label>WARD</label><button class="mic-btn" type="button" title="Nhập Ward bằng giọng nói tiếng Việt">🎙 Nói</button></div><div class="ward-wrap"><input class="ward" autocomplete="off" placeholder="Nhập tên Ward…" value="${escapeAttr(e.ward)}"><div class="suggestions hidden"></div></div><div class="statusline lookup-status">${e.hub? 'Đã tra cứu DATA':''}</div></div>
   <div class="field"><label>HUB NAME</label><input class="hub" readonly placeholder="Tự động điền" value="${escapeAttr(e.hub)}"></div>
   <div class="field"><label>SORT CODE NEW</label><input class="sort" readonly placeholder="Tự động điền" value="${escapeAttr(e.sortCode)}"></div>
  </div>`;
  root.appendChild(card);
  const tracking=card.querySelector('.tracking'),ward=card.querySelector('.ward');
  tracking.addEventListener('input',()=>{e.tracking=tracking.value.trim();checkDuplicate(e);updateStats();saveEntries();});
  tracking.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();const w=card.querySelector('.ward');w.focus();w.select();}});
  card.querySelector('.scan-btn-main').addEventListener('click',()=>startScanner(e.id));
  card.querySelector('.delete-btn').addEventListener('click',()=>{state.entries=state.entries.filter(x=>x.id!==e.id);if(!state.entries.length)addEntry({},false);renderAll();saveEntries();});
  ward.addEventListener('input',()=>{e.ward=ward.value;lookupWard(e,card,false);showSuggestions(e,card);saveEntries();});
  ward.addEventListener('focus',()=>{if(ward.value.trim())showSuggestions(e,card);});
  ward.addEventListener('keydown',ev=>{const box=card.querySelector('.suggestions');if(ev.key==='Escape')box.classList.add('hidden');if(ev.key==='Enter'){ev.preventDefault();const first=box.querySelector('.suggestion');if(first)first.click();else{box.classList.add('hidden');const next=card.querySelector('.tracking');next.focus();}}});
  card.querySelector('.mic-btn').addEventListener('click',()=>startVoice(e,card));
 });
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeAttr(s){return escapeHtml(s);}
function updateStats(){ $('rowCount').textContent=state.entries.length; $('validCount').textContent=state.entries.filter(e=>e.ward&&e.hub&&e.sortCode).length; $('duplicateCount').textContent=state.entries.filter(e=>e.duplicate).length;}
function checkDuplicate(e){
 const key=normText(e.tracking);const hits=key?state.entries.filter(x=>x.id!==e.id&&normText(x.tracking)===key):[];
 e.duplicate=hits.length>0;
 const card=document.querySelector(`[data-id="${e.id}"]`);if(!card)return;
 card.classList.toggle('duplicate',e.duplicate);
 const status=card.querySelector('.tracking-status');
 if(e.duplicate){e.message='⚠ MÃ VẬN ĐƠN BỊ TRÙNG';e.kind='error';status.textContent=e.message;status.className='statusline error';}
 else if(e.tracking){e.message='';e.kind='';status.textContent='';status.className='statusline';}
 updateStats();
}
function lookupWard(e,card,exact=false){
 const q=normText(e.ward), rows=dataForProvince();
 let match=null;
 if(q){match=rows.find(r=>normText(r.ward)===q)||null;if(!match&&!exact){const matches=rows.filter(r=>normText(r.ward).includes(q));if(matches.length===1)match=matches[0];}}
 if(match){e.ward=match.ward;e.hub=match.hub;e.sortCode=match.sortCode;card.querySelector('.ward').value=match.ward;card.querySelector('.hub').value=match.hub;card.querySelector('.sort').value=match.sortCode;card.querySelector('.lookup-status').textContent='✓ Đã khớp dữ liệu DATA';card.querySelector('.lookup-status').className='statusline ok';}
 else {e.hub='';e.sortCode='';card.querySelector('.hub').value='';card.querySelector('.sort').value='';card.querySelector('.lookup-status').textContent=q?'Chưa tìm thấy Ward phù hợp':'Nhập Ward để tra cứu';card.querySelector('.lookup-status').className='statusline'+(q?' error':'');}
 updateStats();
}
function showSuggestions(e,card){
 const box=card.querySelector('.suggestions'),q=normText(e.ward);
 if(!q){box.classList.add('hidden');box.innerHTML='';return;}
 const rows=dataForProvince(),seen=new Set();
 const opts=rows.filter(r=>{const k=normText(r.ward);if(!k||seen.has(k)||!k.includes(q))return false;seen.add(k);return true;}).slice(0,12);
 box.innerHTML='';
 opts.forEach(r=>{const item=document.createElement('div');item.className='suggestion';item.tabIndex=0;item.textContent=r.ward+'  ·  '+r.hub;const choose=()=>{e.ward=r.ward;e.hub=r.hub;e.sortCode=r.sortCode;card.querySelector('.ward').value=r.ward;card.querySelector('.hub').value=r.hub;card.querySelector('.sort').value=r.sortCode;card.querySelector('.lookup-status').textContent='✓ Đã khớp dữ liệu DATA';card.querySelector('.lookup-status').className='statusline ok';box.classList.add('hidden');saveEntries();updateStats();};item.addEventListener('click',choose);item.addEventListener('keydown',ev=>{if(ev.key==='Enter')choose();});box.appendChild(item);});
 box.classList.toggle('hidden',!opts.length);
}
function startVoice(e,card){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){toast('Trình duyệt này chưa hỗ trợ nhận dạng giọng nói. Hãy thử Chrome trên Android.',true);return;}
 const rec=new SR();rec.lang='vi-VN';rec.interimResults=false;rec.maxAlternatives=3;
 const btn=card.querySelector('.mic-btn');btn.textContent='🔴 Đang nghe…';btn.disabled=true;
 rec.onresult=ev=>{const text=ev.results?.[0]?.[0]?.transcript?.trim();if(text){e.ward=text;card.querySelector('.ward').value=text;lookupWard(e,card,false);showSuggestions(e,card);saveEntries();}};
 rec.onerror=ev=>toast('Không nhận được giọng nói: '+(ev.error||'hãy thử lại'),true);
 rec.onend=()=>{btn.textContent='🎙 Nói';btn.disabled=false;};
 try{rec.start();}catch(err){btn.textContent='🎙 Nói';btn.disabled=false;toast('Không thể khởi động micro. Kiểm tra quyền trình duyệt.',true);}
}
async function startScanner(id){
 if(!window.Html5Qrcode){toast('Không tải được thư viện quét QR. Kiểm tra kết nối Internet rồi tải lại trang.',true);return;}
 state.scannerRowId=id;$('scannerModal').classList.remove('hidden');$('scanMessage').textContent='Đang xin quyền camera…';
 try{
  if(!state.scanner)state.scanner=new Html5Qrcode('reader',{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false});
  const cams=await Html5Qrcode.getCameras();state.cameras=cams||[];
  if(!state.cameras.length)throw new Error('Không tìm thấy camera trên thiết bị.');
  let cam=state.cameras.find(c=>/back|rear|environment|sau/i.test(c.label))||state.cameras[state.cameras.length-1];state.cameraIndex=state.cameras.indexOf(cam);
  await runCamera(cam.id);
 }catch(err){$('scanMessage').textContent=err.message||'Không thể mở camera.';beep(false);toast('Quét QR thất bại. Hãy cấp quyền camera và dùng HTTPS.',true);}
}
async function runCamera(cameraId){
 try{
  if(state.scanner?.isScanning)await state.scanner.stop();
  $('reader').innerHTML='';
  await state.scanner.start({deviceId:{exact:cameraId}},{fps:12,qrbox:(w,h)=>({width:Math.min(260,w*.78),height:Math.min(190,h*.65)}),aspectRatio:1.2},
   decodedText=>{onScanSuccess(decodedText);},()=>{});
  $('scanMessage').textContent='Camera đang hoạt động · Đưa mã QR vào khung';
 }catch(err){$('scanMessage').textContent='Không khởi động được camera: '+(err.message||err);throw err;}
}
function onScanSuccess(text){
 const e=state.entries.find(x=>x.id===state.scannerRowId);if(!e)return;
 const val=String(text||'').trim();
 if(!val){beep(false);toast('QR không chứa văn bản hợp lệ.',true);return;}
 e.tracking=val;const card=document.querySelector(`[data-id="${e.id}"]`);if(card)card.querySelector('.tracking').value=val;
 checkDuplicate(e);
 if(e.duplicate){beep(false);toast('Quét được mã nhưng mã vận đơn đang bị trùng!',true);e.message='⚠ MÃ VẬN ĐƠN BỊ TRÙNG';e.kind='error';}
 else{beep(true);toast('Quét QR thành công.',false,true);e.message='✓ Quét QR thành công';e.kind='ok';if(card){const s=card.querySelector('.tracking-status');s.textContent=e.message;s.className='statusline ok';}}
 saveEntries();updateStats();stopScanner();setTimeout(()=>{const i=state.entries.findIndex(x=>x.id===e.id);if(i>=0){if(i===state.entries.length-1)addEntry({},false);const next=state.entries[i+1];if(next){const input=document.querySelector(`[data-id="${next.id}"] .tracking`);input?.focus();}}},180);
}
async function stopScanner(){try{if(state.scanner?.isScanning)await state.scanner.stop();}catch(e){}$('scannerModal').classList.add('hidden');}
async function switchCamera(){if(!state.cameras.length)return;state.cameraIndex=(state.cameraIndex+1)%state.cameras.length;try{await runCamera(state.cameras[state.cameraIndex].id);}catch(e){toast('Không đổi được camera.',true);}}
function saveEntries(){try{localStorage.setItem(STORAGE,JSON.stringify(state.entries.map(({id,tracking,ward,hub,sortCode})=>({id,tracking,ward,hub,sortCode}))));}catch(e){}}
function restoreEntries(){try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(saved)&&saved.length){saved.forEach(v=>{const e=createEntry(v);if(Number.isFinite(v.id))e.id=v.id;state.nextId=Math.max(state.nextId,e.id+1);state.entries.push(e);});}}catch(e){}if(!state.entries.length)state.entries.push(createEntry());}
function normalizeEntryData(){let problems=[];state.entries.forEach((e,i)=>{const key=normText(e.tracking);if(!key)problems.push(`Hàng ${i+1}: thiếu SPX Tracking Number`);if(!e.ward)problems.push(`Hàng ${i+1}: chưa chọn Ward`);if(e.ward&&(!e.hub||!e.sortCode))problems.push(`Hàng ${i+1}: Ward chưa khớp DATA`);});return problems;}
function exportWorkbook(){
 const problems=normalizeEntryData();if(problems.length){const preview=problems.slice(0,6).join('\n')+(problems.length>6?`\n… và ${problems.length-6} lỗi khác`: '');if(!confirm('Còn dữ liệu thiếu/chưa khớp:\n\n'+preview+'\n\nBạn vẫn muốn xuất Excel không?'))return;}
 const dupes=state.entries.filter(e=>e.duplicate);if(dupes.length&&!confirm(`Có ${dupes.length} dòng mã vận đơn trùng. Bạn vẫn muốn xuất Excel?`))return;
 if(!window.XLSX){toast('Không tải được thư viện Excel. Kiểm tra Internet.',true);return;}
 const out=[['SPX Tracking Number','Hub Name','Sort Code','Ward(Optional)']];
 state.entries.forEach(e=>{if(e.tracking.trim()||e.hub.trim()||e.sortCode.trim()||e.ward.trim())out.push([e.tracking.trim(),e.hub.trim(),e.sortCode.trim(),'']);});
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(out);ws['!cols']=[{wch:28},{wch:28},{wch:24},{wch:20}];XLSX.utils.book_append_sheet(wb,ws,'DATA');
 const d=new Date(),stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
 const filename=`order_pool_mass_update_template_vn_with_optional_ward_${stamp}.xlsx`;
 XLSX.writeFile(wb,filename);toast('Đã tạo file Excel: '+filename,false,true);
}
const pad=n=>String(n).padStart(2,'0');
async function shareOutput(){
 const out=[['SPX Tracking Number','Hub Name','Sort Code','Ward(Optional)']];
 state.entries.forEach(e=>{if(e.tracking.trim()||e.hub.trim()||e.sortCode.trim()||e.ward.trim())out.push([e.tracking.trim(),e.hub.trim(),e.sortCode.trim(),'']);});
 if(out.length===1){toast('Chưa có dữ liệu để chia sẻ.',true);return;}
 if(!window.XLSX){toast('Không tải được thư viện Excel.',true);return;}
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(out),'DATA');
 const d=new Date(),stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
 const filename=`order_pool_mass_update_template_vn_with_optional_ward_${stamp}.xlsx`;
 const blob=new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const file=new File([blob],filename,{type:blob.type});
 try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'SPX Order Pool',text:'Tệp dữ liệu đã nhập'});return;}
 if(navigator.share){await navigator.share({title:'SPX Order Pool',text:'Tôi đã hoàn tất nhập dữ liệu. Tệp Excel được tải xuống trên thiết bị.'});toast('Thiết bị không hỗ trợ chia sẻ trực tiếp tệp Excel. Đã mở chia sẻ văn bản; hãy dùng nút Xuất Excel.',false);return;}}
 catch(e){if(e.name==='AbortError')return;}
 XLSX.writeFile(wb,filename);toast('Trình duyệt chưa hỗ trợ chia sẻ tệp. Đã tải Excel để bạn gửi qua ứng dụng mong muốn.',false,true);
}
function uploadData(){
 const pass=prompt('Nhập mật khẩu để cập nhật DATA:');if(pass===null)return;
 if(pass!=='111291'){beep(false);toast('Mật khẩu không chính xác.',true);return;}
 $('dataFile').click();
}
$('dataFile').addEventListener('change',async ev=>{
 const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
 try{
  if(!window.XLSX)throw new Error('Không tải được thư viện đọc Excel. Kiểm tra Internet.');
  const buf=await file.arrayBuffer();let matrix;
  if(/\.csv$/i.test(file.name)){const text=new TextDecoder('utf-8').decode(buf);matrix=XLSX.utils.sheet_to_json(XLSX.read(text,{type:'string'}).Sheets[XLSX.read(text,{type:'string'}).SheetNames[0]],{header:1,defval:''});}
  else {const wb=XLSX.read(buf,{type:'array'});const sheet=wb.Sheets.DATA||wb.Sheets[wb.SheetNames[0]];matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});}
  const data=parseDataRows(matrix);
  if(!confirm(`Đọc được ${data.length} dòng DATA. Thay thế DATA hiện tại?`))return;
  state.data=data;localStorage.setItem('spx_qr_custom_data',JSON.stringify(data));populateProvinces();setDataStatus(`DATA mới · ${data.length} dòng`);renderAll();toast('Cập nhật DATA thành công.',false,true);
 }catch(err){toast(err.message||'Không đọc được tệp DATA.',true);} 
});
$('adminBtn').addEventListener('click',uploadData);
$('reloadDataBtn').addEventListener('click',()=>{if(confirm('Tải lại DATA mặc định từ GitHub? DATA tùy chỉnh trên thiết bị sẽ bị xóa.')){localStorage.removeItem('spx_qr_custom_data');loadInitialData();}});
$('province').addEventListener('change',()=>{state.entries.forEach(e=>{const card=document.querySelector(`[data-id="${e.id}"]`);if(card&&e.ward)lookupWard(e,card,false);});renderAll();});
$('addRowBtn').addEventListener('click',()=>addEntry());$('addBottomBtn').addEventListener('click',()=>addEntry());
$('finishBtn').addEventListener('click',exportWorkbook);$('shareBtn').addEventListener('click',shareOutput);
$('closeScannerBtn').addEventListener('click',stopScanner);$('switchCameraBtn').addEventListener('click',switchCamera);
$('scannerModal').addEventListener('click',ev=>{if(ev.target===$('scannerModal'))stopScanner();});
$('themeBtn').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('spx_qr_theme',dark?'dark':'light');$('themeBtn').textContent=dark?'☀':'☾';});
function tick(){$('clock').textContent=new Date().toLocaleTimeString('vi-VN',{hour12:false});}tick();setInterval(tick,1000);
try{const theme=localStorage.getItem('spx_qr_theme')||'light';document.documentElement.dataset.theme=theme;$('themeBtn').textContent=theme==='dark'?'☀':'☾';}catch(e){}
window.addEventListener('beforeinstallprompt',ev=>{ev.preventDefault();state.deferredInstall=ev;$('installBtn').classList.remove('hidden');});
$('installBtn').addEventListener('click',async()=>{if(!state.deferredInstall){toast('Trên iPhone: nhấn Chia sẻ → Thêm vào MH chính. Trên Android: mở menu ⋮ → Cài đặt ứng dụng.',false);return;}state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$('installBtn').classList.add('hidden');});
if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
restoreEntries();renderAll();loadInitialData();
})();