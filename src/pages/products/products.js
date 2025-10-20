// base de la api y rutas que usa esta pantalla
const API_BASE = 'https://tffarmaciabackend-production.up.railway.app';
const URLS = {
  listProducts: `${API_BASE}/producto/listar`,
  listCategories: `${API_BASE}/categoria/listarcategoria`,
  saveProduct: `${API_BASE}/producto/guardarproducto`,
};

// utilidad para escapar texto antes de insertarlo en html
// esto evita inyeccion de codigo y protege contra xss
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
);

// cache de categorias en memoria y en almacenamiento local
// se usa para no pedir categorias al servidor cada vez
let memCats = null;
const CATS_CACHE_KEY = 'ts_cats_cache_v1';
const CATS_TTL_MS = 60 * 60 * 1000; // una hora

// intenta leer las categorias desde almacenamiento local
// si existen y no estan vencidas se devuelven
// si no existen o caducaron se devuelve nulo
function getCatsFromStorage() {
  try {
    const raw = localStorage.getItem(CATS_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.ts > CATS_TTL_MS) return null; // expirado
    return obj.data;
  } catch { return null; }
}

// guarda las categorias en almacenamiento local junto con la hora
// esto permite saber luego si el cache sigue vigente
function saveCatsToStorage(data) {
  try {
    localStorage.setItem(CATS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

// conecta la logica de la interfaz del modal para crear productos
// se encarga de abrir y cerrar el modal
// de cargar categorias al abrir
// de cerrar por clics de fondo y por la tecla escape
// y de gestionar el envio del formulario sin recargar la pagina
function wireModalUI() {
  const modal = document.getElementById('modal-add');
  const btnOpen = document.getElementById('btn-open-modal');
  const btnClose = document.getElementById('btn-close-modal');

  if (!modal || !btnOpen) return;

  // funcion para abrir el modal y asegurar que las categorias esten listas
  const open = async () => {
    modal.classList.add('is-open'); 
    document.body.classList.add('modal-open');
    await ensureCategoriesLoaded();
  };
  // funcion para cerrar el modal y restaurar el estado del body
  const close = () => {
    modal.classList.remove('is-open'); 
    document.body.classList.remove('modal-open');
  };

  // eventos para abrir y cerrar el modal
  btnOpen.addEventListener('click', open);
  btnClose?.addEventListener('click', close);

  // permite cerrar haciendo clic en el fondo del modal
  modal.addEventListener('click', (e) => { if (e.target.dataset.close) close(); });

  // permite cerrar con la tecla escape
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // captura el envio del formulario
  // evita el comportamiento por defecto
  // y llama a la funcion que guarda el producto
  const form = document.getElementById('form-producto');
  const btnSave = document.getElementById('btn-save');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProduct(form, btnSave, close);
  });
}

// llena el select de categorias con las opciones
// usa escape para evitar problemas al insertar texto
function fillCategoriesSelect(select, cats) {
  select.innerHTML = [
    '<option value="" disabled selected>Seleccione una categoría</option>',
    ...cats.map(c => `<option value="${esc(c.id)}">${esc(c.tipo_categoria ?? c.nombre ?? 'Sin nombre')}</option>`)
  ].join('');
}

// asegura que las categorias esten disponibles antes de usarlas
// primero intenta usar cache en memoria
// luego intenta usar cache en almacenamiento local
// si no hay cache hace una solicitud al servidor
// mientras carga deshabilita el select y muestra un mensaje
async function ensureCategoriesLoaded() {
  const select = document.getElementById('sel-categoria');
  if (!select) return [];

  // usa cache en memoria si ya se cargo antes
  if (memCats && Array.isArray(memCats) && memCats.length) {
    fillCategoriesSelect(select, memCats);
    return memCats;
  }

  // usa cache de almacenamiento local si esta vigente
  const cached = getCatsFromStorage();
  if (cached && Array.isArray(cached) && cached.length) {
    memCats = cached;
    fillCategoriesSelect(select, memCats);
    return memCats;
  }

  // muestra estado de carga y deshabilita el control
  select.innerHTML = '<option selected disabled>Cargando categorías…</option>';
  select.disabled = true;

  try {
    // pide categorias al servidor
    const res = await fetch(URLS.listCategories, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cats = await res.json();

    // normaliza respuesta a arreglo y actualiza caches
    memCats = Array.isArray(cats) ? cats : [];
    saveCatsToStorage(memCats);

    // llena el select con las categorias
    fillCategoriesSelect(select, memCats);
  } catch (err) {
    // si algo falla informa en el select y registra el error en consola
    select.innerHTML = '<option selected disabled>Error cargando categorías</option>';
    console.error('Categorías:', err);
  } finally {
    // reactiva el select luego de terminar
    select.disabled = false;
  }
  return memCats || [];
}

// carga la lista de productos desde el servidor y la dibuja en la tabla
// muestra un mensaje de cargando mientras espera la respuesta
// convierte cada producto en una fila de html y la inserta en el cuerpo de la tabla
// si hay error lo muestra en la tabla y registra el detalle en consola
async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Cargando…</td></tr>`;

  try {
    const res = await fetch(URLS.listProducts, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();

    // asegura que siempre se itere un arreglo
    const rows = (Array.isArray(list) ? list : [list]).map(p => {
      const cat = p.categoria || {};
      // cada fila usa la utilidad de escape para proteger el dom
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

    // si no hay productos muestra mensaje de sin resultados
    tbody.innerHTML = rows || `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Sin resultados</td></tr>`;
  } catch (e) {
    // muestra mensaje de error en la tabla y registra el error
    tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-3 text-center text-gray-600">Error cargando productos: ${esc(e.message)}</td></tr>`;
    console.error('Productos:', e);
  }
}

// guarda un nuevo producto usando los datos del formulario
// valida campos requeridos antes de enviar
// construye el cuerpo de la peticion como formulario urlencoded
// deshabilita el boton mientras guarda para evitar dobles envios
// si todo sale bien resetea el formulario cierra el modal recarga la lista y avisa
// si falla informa el error y reactiva el boton
async function saveProduct(form, btnSave, closeModal) {
  // obtiene valores del formulario y aplica recortes de espacios donde corresponde
  const nombre = document.getElementById('inp-nombre')?.value.trim();
  const catId  = document.getElementById('sel-categoria')?.value;
  const cant   = document.getElementById('inp-cantidad')?.value;
  const proc   = document.getElementById('inp-procedencia')?.value.trim();
  const venc   = document.getElementById('inp-vencimiento')?.value;

  // validacion simple de requeridos
  if (!nombre || !catId || !cant || !proc || !venc) {
    alert('Completa todos los campos.');
    return;
  }

  // arma los parametros con nombres esperados por el backend
  const params = new URLSearchParams({
    nombre_producto: nombre,
    categoriaId: catId,
    cantidad: String(cant),
    procedencia: proc,
    fecha_vencimiento: venc,
  });

  // feedback visual de accion en progreso
  btnSave.disabled = true;
  const prev = btnSave.textContent;
  btnSave.textContent = 'Guardando…';

  try {
    // envia la peticion al servidor
    const res = await fetch(URLS.saveProduct, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const msg = await res.text();

    // al completar resetea el formulario cierra el modal recarga productos y avisa
    form.reset();
    closeModal?.();
    await loadProducts();

    alert(`${msg}`);
  } catch (err) {
    // maneja errores de red o de servidor y avisa al usuario
    console.error('Guardar producto:', err);
    alert(`Error guardando: ${err.message}`);
  } finally {
    // siempre restablece el estado del boton
    btnSave.disabled = false;
    btnSave.textContent = prev;
  }
}

// punto de entrada del modulo
// configura los manejadores del modal y carga la lista inicial de productos
export async function initProducts() {
  wireModalUI();
  await loadProducts();
}
