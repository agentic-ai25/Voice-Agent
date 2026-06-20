/* Read-only viewer of the client registry (extension/clients.json). */
const $ = (id) => document.getElementById(id);

function row(c) {
  const el = document.createElement('div');
  el.className = 'client';
  const enabled = c.enabled !== false;
  el.innerHTML = `
    <span class="dot" style="background:${c.accent || '#16a34a'}"></span>
    <div class="meta">
      <div class="name"></div>
      <div class="host"></div>
    </div>
    <span class="tag ${enabled ? '' : 'off'}">${enabled ? (c.template || 'default') : 'disabled'}</span>`;
  el.querySelector('.name').textContent = c.label || c.id || c.match;
  el.querySelector('.host').textContent = c.match;
  return el;
}

fetch(chrome.runtime.getURL('clients.json'))
  .then((r) => r.json())
  .then((reg) => {
    $('api').innerHTML = `API: <b>${reg.apiBase || '(unset)'}</b>`;
    const list = $('clients');
    (reg.clients || []).forEach((c) => list.appendChild(row(c)));
    if (!reg.clients || !reg.clients.length) {
      list.textContent = 'No clients configured.';
    }
  })
  .catch(() => ($('clients').textContent = 'Could not load clients.json'));

$('reload').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
    window.close();
  });
});
