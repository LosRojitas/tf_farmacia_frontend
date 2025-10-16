const API_BASE = 'https://tffarmaciabackend-production.up.railway.app';
const URLS = {
  listProducts: `${API_BASE}/producto/listar`,
  listCategories: `${API_BASE}/categoria/listarcategoria`,
  saveProduct: `${API_BASE}/producto/guardarproducto`,
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
);

let memCats = null;
const CATS_CACHE_KEY = 'ts_cats_cache_v1';
const CATS_TTL_MS = 60 * 60 * 1000;

function getCatsFromStorage() {
  try {
    const raw = localStorage.getItem(CATS_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.ts > CATS_TTL_MS) return null;
    return obj.data;
  } catch { return null; }
}
function saveCatsToStorage(data) {
  try {
    localStorage.setItem(CATS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

function wireModalUI() {
  const modal = document.getElementById('modal-add');
  const btnOpen = document.getElementById('btn-open-modal');
  const btnClose = document.getElementById('btn-close-modal');

  if (!modal || !btnOpen) return;

  const open = async () => {
    modal.classList.add('is-open'); 
    document.body.classList.add('modal-open');
    await ensureCategoriesLoaded();
  };
  const close = () => {
    modal.classList.remove('is-open'); 
    document.body.classList.remove('modal-open');
  };

  btnOpen.addEventListener('click', open);
  btnClose?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target.dataset.close) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  const form = document.getElementById('form-producto');
  const btnSave = document.getElementById('btn-save');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProduct(form, btnSave, close);
  });
}

function fillCategoriesSelect(select, cats) {
  select.innerHTML = [
    '<option value="" disabled selected>Seleccione una categoría</option>',
    ...cats.map(c => `<option value="${esc(c.id)}">${esc(c.tipo_categoria ?? c.nombre ?? 'Sin nombre')}</option>`)
  ].join('');
}

async function ensureCategoriesLoaded() {
  const select = document.getElementById('sel-categoria');
  if (!select) return [];

  if (memCats && Array.isArray(memCats) && memCats.length) {
    fillCategoriesSelect(select, memCats);
    return memCats;
  }

  const cached = getCatsFromStorage();
  if (cached && Array.isArray(cached) && cached.length) {
    memCats = cached;
    fillCategoriesSelect(select, memCats);
    return memCats;
  }

  select.innerHTML = '<option selected disabled>Cargando categorías…</option>';
  select.disabled = true;

  try {
    const res = await fetch(URLS.listCategories, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cats = await res.json();
    memCats = Array.isArray(cats) ? cats : [];
    saveCatsToStorage(memCats);
    fillCategoriesSelect(select, memCats);
  } catch (err) {
    select.innerHTML = '<option selected disabled>Error cargando categorías</option>';
    console.error('Categorías:', err);
  } finally {
    select.disabled = false;
  }
  return memCats || [];
}

async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Cargando…</td></tr>`;

  try {
    const res = await fetch(URLS.listProducts, { headers: { 'Accept': 'application/json' } });
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
    tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Error cargando productos: ${esc(e.message)}</td></tr>`;
    console.error('Productos:', e);
  }
}

async function saveProduct(form, btnSave, closeModal) {
  const nombre = document.getElementById('inp-nombre')?.value.trim();
  const catId  = document.getElementById('sel-categoria')?.value;
  const cant   = document.getElementById('inp-cantidad')?.value;
  const proc   = document.getElementById('inp-procedencia')?.value.trim();
  const venc   = document.getElementById('inp-vencimiento')?.value;

  if (!nombre || !catId || !cant || !proc || !venc) {
    alert('Completa todos los campos.');
    return;
  }

  const params = new URLSearchParams({
    nombre_producto: nombre,
    categoriaId: catId,
    cantidad: String(cant),
    procedencia: proc,
    fecha_vencimiento: venc,
  });

  btnSave.disabled = true;
  const prev = btnSave.textContent;
  btnSave.textContent = 'Guardando…';

  try {
    const res = await fetch(URLS.saveProduct, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const msg = await res.text();

    form.reset();
    closeModal?.();
    await loadProducts();

    alert(`✅ ${msg}`);
  } catch (err) {
    console.error('Guardar producto:', err);
    alert(`❌ Error guardando: ${err.message}`);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = prev;
  }
}

export async function initProducts() {
  wireModalUI();
  await loadProducts();
}
