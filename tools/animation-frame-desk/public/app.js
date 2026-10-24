const $ = selector => document.querySelector(selector);
const blank = () => ({ version: 1, loop: 0, frames: [], sources: {} });
let project = blank(), selected = 0, history = [], busy = false, playing = false, raf = 0, drawGeneration = 0;
const images = new Map(), downloadUrls = [];
const status = (message, error = false) => { $('#status').textContent = message; $('#status').classList.toggle('error', error); };
const database = new Promise((resolve, reject) => {
  const req = indexedDB.open('animation-frame-desk-v1', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('projects');
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
});
async function stored(write, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', write ? 'readwrite' : 'readonly');
    const store = tx.objectStore('projects');
    const request = write ? store.put(value, 'active') : store.get('active');
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
function snapshot() { return { ...project, frames: project.frames.map(f => ({ ...f })), sources: { ...project.sources } }; }
function checkpoint() { history.push(snapshot()); if (history.length > 20) history.shift(); }
async function saveState() { await stored(true, project); }
function clearDownloads() { for (const url of downloadUrls) URL.revokeObjectURL(url); downloadUrls.length = 0; $('#downloads').replaceChildren(); }
async function run(action) {
  if (busy) return;
  busy = true; pause();
  try { await action(); } catch (error) { status(error.message, true); }
  finally { busy = false; }
}
async function changed(message) {
  // Undo snapshots retain their own references; the active autosave should not
  // grow forever after removing frames or starting new sequences.
  const used = new Set(project.frames.map(f => f.hash));
  project.sources = Object.fromEntries(Object.entries(project.sources).filter(([hash]) => used.has(hash)));
  for (const hash of images.keys()) if (!used.has(hash)) images.delete(hash);
  clearDownloads(); render();
  try { await saveState(); status(`${message} · Autosaved locally`); }
  catch (e) { status(`${message}. Autosave failed: ${e.message}. Save a portable project now.`, true); }
}
async function api(path, data) {
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Local service failed'); return result;
}
function encode(buffer) { let result = ''; const bytes = new Uint8Array(buffer); for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(result); }
const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
function dimensions(p = project) {
  const sources = p.frames.map(f => p.sources[f.hash]).filter(Boolean);
  return { width: Math.max(1, ...sources.map(s => s.width || 1)), height: Math.max(1, ...sources.map(s => s.height || 1)) };
}
function checkLimits(p) {
  if (p.frames.length > 120) throw new Error('Maximum 120 frame occurrences');
  const { width, height } = dimensions(p);
  if (width * height * p.frames.length > 32000000) throw new Error('Timeline exceeds 32 million canvas pixels');
  const used = new Set(p.frames.map(f => f.hash));
  let bytes = 0; for (const hash of used) bytes += (p.sources[hash]?.data?.length || 0) * 0.75;
  if (bytes > 24 * 1024 * 1024) throw new Error('Unique sources exceed 24 MiB');
}
async function inspectFile(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: exceeds 8 MiB`);
  const data = encode(await file.arrayBuffer());
  return { name: file.name, data, ...await api('inspect', { data }) };
}
async function addFiles(files, reconnect = false) {
  if (!files.length) return;
  status(reconnect ? 'Checking original file hashes…' : 'Reading and normalizing frames…');
  const next = snapshot();
  if (!reconnect && files.length + next.frames.length > 120) throw new Error('Maximum 120 frame occurrences');
  for (const file of files) {
    const source = await inspectFile(file);
    if (reconnect && !next.frames.some(f => f.hash === source.hash)) throw new Error(`${file.name}: SHA-256 does not match any requested original`);
    next.sources[source.hash] = source;
    if (!reconnect) next.frames.push({ id: crypto.randomUUID(), hash: source.hash, name: file.name, duration: 100 });
  }
  checkLimits(next); checkpoint(); project = next;
  await changed(reconnect ? 'Matching originals reconnected' : `Imported ${files.length} frames`);
}
function portable(includeSources = true) {
  const sources = {};
  for (const hash of new Set(project.frames.map(f => f.hash))) {
    const s = project.sources[hash] || {};
    sources[hash] = { name: s.name || hash, width: s.width, height: s.height, ...(includeSources && s.data ? { data: s.data } : {}) };
  }
  return { version: 1, loop: project.loop, frames: project.frames, sources };
}
async function loadProject(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.frames) || !input.sources || typeof input.sources !== 'object' || !Number.isInteger(input.loop) || input.loop < 0 || input.loop > 65535 || input.frames.length > 120) throw new Error('Invalid version 1 project');
  const next = blank(); next.loop = input.loop;
  const ids = new Set();
  for (const f of input.frames) {
    if (!f || typeof f.id !== 'string' || !/^[\w-]{1,100}$/.test(f.id) || ids.has(f.id) || !/^[a-f0-9]{64}$/.test(f.hash) || !Number.isInteger(f.duration) || f.duration < 1 || f.duration > 60000) throw new Error('Invalid occurrence ID, source hash or duration in project');
    ids.add(f.id);
    next.frames.push({ id: f.id, hash: f.hash, name: typeof f.name === 'string' ? f.name.slice(0, 255) : f.hash, duration: f.duration });
    if (Object.hasOwn(next.sources, f.hash)) continue;
    const s = input.sources[f.hash];
    if (!s || typeof s !== 'object') throw new Error('Missing source reference');
    if (s.data !== undefined) {
      if (typeof s.data !== 'string' || s.data.length > 11184812 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s.data)) throw new Error('Invalid source encoding');
      const normalized = await api('inspect', { data: s.data });
      if (normalized.hash !== f.hash) throw new Error('Project source SHA-256 mismatch');
      next.sources[f.hash] = { name: f.name, data: s.data, ...normalized };
    } else {
      if (!Number.isInteger(s.width) || !Number.isInteger(s.height) || s.width < 1 || s.height < 1 || s.width > 2048 || s.height > 2048) throw new Error('Invalid missing-source dimensions');
      next.sources[f.hash] = { name: f.name, width: s.width, height: s.height };
    }
  }
  checkLimits(next); return next;
}
function download(name, bytes, type, linkOnly = false) {
  const url = URL.createObjectURL(new Blob([bytes], { type })); downloadUrls.push(url);
  const a = document.createElement('a'); a.href = url; a.download = name; a.textContent = name;
  if (linkOnly) $('#downloads').append(a); else a.click();
}
function pause() { playing = false; cancelAnimationFrame(raf); $('#play').textContent = 'Play'; }
function draw() {
  const generation = ++drawGeneration, canvas = $('#canvas'), context = canvas.getContext('2d');
  const { width, height } = dimensions(); canvas.width = width; canvas.height = height;
  $('#position').textContent = `${project.frames.length ? selected + 1 : 0} / ${project.frames.length}`;
  $('#empty').hidden = project.frames.length > 0;
  for (const [i, li] of [...$('#frames').children].entries()) li.classList.toggle('selected', i === selected);
  const frame = project.frames[selected], source = frame && project.sources[frame.hash];
  if (!source?.preview) return;
  let img = images.get(frame.hash);
  if (!img) { img = new Image(); img.src = `data:image/png;base64,${source.preview}`; images.set(frame.hash, img); }
  const paint = () => { if (generation === drawGeneration) context.drawImage(img, 0, 0); };
  if (img.complete) paint(); else img.onload = paint;
}
function button(text, title, action, disabled = false) {
  const b = document.createElement('button'); b.textContent = text; b.title = title; b.setAttribute('aria-label', title); b.disabled = disabled; b.onclick = () => run(action); return b;
}
function render() {
  selected = Math.max(0, Math.min(selected, project.frames.length - 1));
  $('#loop').value = project.loop;
  $('#total').textContent = `${project.frames.reduce((n,f) => n + f.duration, 0)} ms / play`;
  const { width, height } = dimensions();
  $('#dimensions').textContent = project.frames.length ? `${width} × ${height} · ${project.frames.length} occurrences` : 'No frames';
  $('#undo').disabled = !history.length;
  $('#export').disabled = !project.frames.length || project.frames.some(f => !project.sources[f.hash]?.data);
  $('#frames').replaceChildren();
  for (const [index, frame] of project.frames.entries()) {
    const source = project.sources[frame.hash];
    const li = document.createElement('li'); li.dataset.id = frame.id;
    const thumb = button('', `Inspect frame ${index + 1}`, () => { selected = index; draw(); }); thumb.className = 'thumb';
    if (source?.preview) { const img = new Image(); img.src = `data:image/png;base64,${source.preview}`; img.alt = `Frame ${index + 1}`; thumb.append(img); } else thumb.textContent = 'Reconnect original';
    const name = document.createElement('p'); name.className = 'name'; name.textContent = `${String(index + 1).padStart(2, '0')} / ${frame.name}`; name.title = `${frame.name}\nOccurrence ${frame.id}\nSHA-256 ${frame.hash}`;
    const label = document.createElement('label'); label.textContent = 'Duration ms';
    const duration = document.createElement('input'); duration.type = 'number'; duration.min = '1'; duration.max = '60000'; duration.step = '1'; duration.value = frame.duration; duration.setAttribute('aria-label', `Duration frame ${index + 1}`);
    duration.onchange = () => run(async () => {
      const n = Number(duration.value);
      if (!Number.isInteger(n) || n < 1 || n > 60000) { duration.value = frame.duration; throw new Error('Duration must be an integer from 1 to 60000 ms'); }
      checkpoint(); project.frames[index] = { ...frame, duration: n }; await changed('Duration updated');
    }); label.append(duration);
    const actions = document.createElement('div'); actions.className = 'actions';
    for (const [delta, arrow, title] of [[-1, '←', 'Move earlier'], [1, '→', 'Move later']]) actions.append(button(arrow, `${title} frame ${index + 1}`, async () => {
      checkpoint(); [project.frames[index], project.frames[index + delta]] = [project.frames[index + delta], project.frames[index]]; selected = index + delta; await changed('Order updated');
    }, index + delta < 0 || index + delta >= project.frames.length));
    actions.append(button('Copy', `Duplicate frame ${index + 1}`, async () => { const next = snapshot(); next.frames.splice(index + 1, 0, { ...frame, id: crypto.randomUUID() }); checkLimits(next); checkpoint(); project = next; selected = index + 1; await changed('Distinct frame occurrence duplicated'); }));
    actions.append(button('×', `Remove frame ${index + 1}`, async () => { checkpoint(); project.frames.splice(index, 1); await changed('Frame removed; Undo restores it'); }));
    li.append(thumb, name, label, actions); $('#frames').append(li);
  }
  draw();
}
$('#import').onchange = e => run(async () => { const files = [...e.target.files]; e.target.value = ''; await addFiles(files); });
$('#reconnect').onchange = e => run(async () => { const files = [...e.target.files]; e.target.value = ''; await addFiles(files, true); });
$('#sample').onclick = () => run(async () => { const files = []; for (let i = 1; i <= 16; i++) { const response = await fetch(`/sample/${i}.png`); if (!response.ok) throw new Error('Sample unavailable'); files.push(new File([await response.blob()], `explosion-${String(i).padStart(2, '0')}.png`, { type: 'image/png' })); } await addFiles(files); });
$('#new').onclick = () => run(async () => { checkpoint(); project = blank(); selected = 0; await changed('New empty project; Undo restores previous work'); });
$('#undo').onclick = () => run(async () => { if (history.length) { project = history.pop(); await changed('Undone'); } });
$('#save').onclick = () => run(() => { download('animation-project.json', JSON.stringify(portable(), null, 2), 'application/json'); status('Portable project downloaded. Original source bytes are included where connected.'); });
$('#references').onclick = () => run(() => { download('animation-references.json', JSON.stringify(portable(false), null, 2), 'application/json'); status('Source-reference project downloaded. Reconnect matching originals when reopening.'); });
$('#open').onchange = e => run(async () => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; if (file.size > 36 * 1024 * 1024) throw new Error('Project exceeds 36 MiB'); status('Validating project and original hashes…'); const next = await loadProject(JSON.parse(await file.text())); checkpoint(); project = next; selected = 0; const missing = project.frames.filter(f => !project.sources[f.hash]?.data).length; await changed(missing ? `Opened project: reconnect ${missing} missing frame occurrences by hash` : 'Opened portable project'); });
$('#loop').onchange = () => run(async () => { const loop = Number($('#loop').value); if (!Number.isInteger(loop) || loop < 0 || loop > 65535) { $('#loop').value = project.loop; throw new Error('Total plays must be an integer from 0 to 65535'); } checkpoint(); project.loop = loop; await changed('Loop updated'); });
$('#previous').onclick = () => run(() => { selected = Math.max(0, selected - 1); draw(); });
$('#next').onclick = () => run(() => { selected = Math.min(project.frames.length - 1, selected + 1); draw(); });
$('#pause').onclick = pause;
$('#play').onclick = () => {
  if (busy || !project.frames.length) return;
  if (project.frames.some(f => !project.sources[f.hash]?.preview)) return status('Reconnect all missing originals before playback', true);
  pause(); playing = true; $('#play').textContent = 'Playing';
  const cumulative = []; let total = 0; for (const f of project.frames) { total += f.duration; cumulative.push(total); }
  const start = performance.now(); selected = 0; draw();
  function tick(now) {
    if (!playing) return;
    const elapsed = now - start;
    if (project.loop && elapsed >= total * project.loop) { selected = project.frames.length - 1; pause(); draw(); return; }
    const next = cumulative.findIndex(end => elapsed % total < end);
    if (next !== selected) { selected = next; draw(); }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
};
$('#export').onclick = () => run(async () => {
  clearDownloads(); status('Encoding every occurrence losslessly…');
  const result = await api('export', portable());
  download('animation.webp', decode(result.webp), 'image/webp', true);
  download('playback.html', decode(result.specimen), 'text/html', true);
  download('manifest.json', JSON.stringify(result.manifest, null, 2), 'application/json', true);
  status(`Encoded ${result.manifest.frames.length} occurrences. Download all three files below. Manifest records hashes; run the independent verifier for this export.`);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
await run(async () => {
  const recovered = await stored(false);
  if (recovered) { project = await loadProject(recovered); render(); status(`Recovered ${project.frames.length} frame occurrences from this browser`); }
  else { render(); status('Ready. Import frames or try the real artwork demo.'); }
});
