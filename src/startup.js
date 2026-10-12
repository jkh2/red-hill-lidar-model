// Insert after the payload and before the module script/import map.
(() => {
  const ld = document.getElementById('load');
  let watchdog;
  function fail(message = 'The browser could not start the 3D viewer. WebGL or a required library may be unavailable.') {
    clearTimeout(watchdog);
    ld.hidden = false; ld.className = 'is-error'; ld.replaceChildren();
    const title = document.createElement('h2'); title.textContent = '3D viewer unavailable';
    const detail = document.createElement('p'); detail.textContent = message;
    const links = document.createElement('div'); links.className = 'actions';
    const retry = document.createElement('button'); retry.textContent = 'Reload viewer';
    retry.addEventListener('click', () => location.reload());
    const source = document.createElement('a'); source.href = 'https://github.com/jkh2/red-hill-lidar-model';
    source.textContent = 'Open model files and documentation';
    links.append(retry, source); ld.append(title, detail, links);
    try {
      const data=JSON.parse(document.getElementById('payload').textContent);
      const disclosure=document.createElement('details'),summary=document.createElement('summary');
      summary.textContent='Read the 2020 stockpile snapshot without 3D';disclosure.append(summary);
      const note=document.createElement('p');note.textContent='Estimated volumes above a computed pad. Historical survey, not current inventory.';
      const table=document.createElement('table');
      const caption=document.createElement('caption');caption.textContent='USGS 3DEP 2020 stockpile estimates';table.append(caption);
      const head=document.createElement('thead'),row=document.createElement('tr');
      ['Pile','Volume (yd³)','Footprint (m²)'].forEach(text=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=text;row.append(cell);});
      head.append(row);table.append(head);
      const body=document.createElement('tbody');data.piles.forEach(p=>{const row=document.createElement('tr');
        [p.id,Math.round(p.volume_yd3).toLocaleString(),Math.round(p.area_m2).toLocaleString()].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});body.append(row);});
      table.append(body);disclosure.append(note,table);ld.append(disclosure);
    } catch (_) { /* Documentation remains available if the payload is damaged. */ }
  }
  window.redHillStartup = {
    fail,
    ready() { clearTimeout(watchdog); ld.hidden = true; }
  };
  watchdog = setTimeout(() => fail('Initialization is taking longer than expected. Reload, check your connection, or open the downloadable model files.'), 20000);
  addEventListener('error', event => {
    if (event.filename && !event.filename.startsWith('chrome-extension:')) fail();
  });
})();
