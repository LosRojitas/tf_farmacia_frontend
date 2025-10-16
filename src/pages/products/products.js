// src/pages/products/products.js
function wireModalUI() {
  const modal = document.getElementById('modal-add');
  const btnOpen = document.getElementById('btn-open-modal');
  const btnClose = document.getElementById('btn-close-modal');

  if (!modal || !btnOpen) return;

  const open = () => { modal.classList.add('is-open'); document.body.classList.add('modal-open'); };
  const close = () => { modal.classList.remove('is-open'); document.body.classList.remove('modal-open'); };

  btnOpen.addEventListener('click', open);
  btnClose?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target.dataset.close) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

export async function initProducts() {
  wireModalUI();

  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  const API = 'https://tffarmaciabackend-production.up.railway.app/producto/listar';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );

  tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Cargando…</td></tr>`;

  try {
    const res = await fetch(API, { method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();

    const rows = (Array.isArray(list) ? list : [list]).map(p => {
      const cat = p.categoria || {};
      return `
        <tr class="border-b even:bg-gray-50">
          <td class="px-3 py-3 text-center text-gray-700 font-medium">${esc(p.id)}</td>
          <td class="px-3 py-3 text-center">${esc(p.nombre_producto)}</td>
          <td class="px-3 py-3 text-center">${esc(cat.tipo_categoria)}</td>
          <td class="px-3 py-3 text-center max-w-[150px] whitespace-nowrap overflow-hidden text-ellipsis">
            ${esc(cat.descripcion_categoria)}
          </td>
          <td class="px-3 py-3 text-center">${esc(p.cantidad)}</td>
          <td class="px-3 py-3 text-center">${esc(p.procedencia)}</td>
          <td class="px-3 py-3">
            <div class="flex items-center justify-center gap-2">
              <button class="inline-flex items-center gap-1 rounded-[0.75rem] bg-indigo-600 px-2.5 py-1.5 text-white hover:bg-indigo-700" title="Ver">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 .001-10.001A5 5 0 0 1 12 17z"/><circle cx="12" cy="12" r="2.5"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rows || `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Sin resultados</td></tr>`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Error cargando productos: ${e.message}</td></tr>`;
  }
}
