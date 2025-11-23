// base de la api y rutas que usa esta pantalla
const API_BASE = 'https://tf-farmacia-backend.onrender.com/';
const URLS = {
  listProducts: `${API_BASE}/producto/listar`,
  listCategories: `${API_BASE}/categoria/listarcategoria`,
  saveProduct: `${API_BASE}/producto/guardarproducto`,
  // endpoints adicionales para editar y eliminar
  editProduct: `${API_BASE}/producto/editar`,
  deleteProduct: `${API_BASE}/producto/eliminar`,
};

// utilidad para escapar texto antes de insertarlo en html
// esto evita inyeccion de codigo
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
);

// notificaciones estilo toastr en lugar del alert
function showToast(message, type = 'info') {
  const containerId = 'toast-container';
  let container = document.getElementById(containerId);

  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.style.position = 'fixed';
    container.style.top = '1rem';
    container.style.right = '1rem';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '0.5rem';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.backgroundColor = '#ffffff';
  toast.style.borderRadius = '0.75rem';
  toast.style.padding = '0.75rem 1rem';
  toast.style.boxShadow = '0 10px 25px rgba(15, 23, 42, 0.15)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'flex-start';
  toast.style.gap = '0.5rem';
  toast.style.borderLeft = '4px solid';
  toast.style.maxWidth = '320px';
  toast.style.fontSize = '0.875rem';

  let color = '#0ea5e9'; // info
  if (type === 'success') color = '#22c55e';
  else if (type === 'error') color = '#ef4444';
  toast.style.borderLeftColor = color;

  const text = document.createElement('div');
  text.style.color = '#0f172a';
  text.textContent = message;

  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.textContent = '✕';
  btnClose.style.marginLeft = '0.5rem';
  btnClose.style.fontSize = '0.75rem';
  btnClose.style.color = '#64748b';
  btnClose.style.background = 'transparent';
  btnClose.style.border = 'none';
  btnClose.style.cursor = 'pointer';

  btnClose.addEventListener('click', () => {
    if (toast.parentNode === container) {
      container.removeChild(toast);
    }
  });

  toast.appendChild(text);
  toast.appendChild(btnClose);
  container.appendChild(toast);

  setTimeout(() => {
    if (!toast.isConnected) return;
    toast.style.transition = 'opacity 0.25s ease-out';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 250);
  }, 3500);
}

// cache de categorias en memoria y en almacenamiento local
// se usa para no pedir categorias al servidor cada vez
let memCats = null;
const CATS_CACHE_KEY = 'ts_cats_cache_v1';
const CATS_TTL_MS = 60 * 60 * 1000; // una hora

// id del producto que se está editando (null = modo crear)
let editingProductId = null;

// estado del producto pendiente de eliminación
let deleteProductId = null;
let deleteProductName = "";

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
    editingProductId = null;
    const form = document.getElementById('form-producto');
    form?.reset();

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) modalTitle.textContent = 'Nuevo producto';

    const btnSave = document.getElementById('btn-save');
    if (btnSave) btnSave.textContent = 'Guardar';

    //solo en modo nuevo, la fecha de vencimiento debe poder editarse
    const inpVenc = document.getElementById('inp-vencimiento');
    if (inpVenc) {
      inpVenc.disabled = false;
      inpVenc.value = '';
    }

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
    // si hay id, actualiza; si no, crea
    if (editingProductId != null) {
      await updateProduct(editingProductId, form, btnSave, close);
    } else {
      await saveProduct(form, btnSave, close);
    }
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
  // 5mentarios
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
              <button
                class="inline-flex items-center gap-1 rounded-[0.75rem] bg-indigo-600 px-2.5 py-1.5 text-white hover:bg-indigo-700 text-xs"
                title="Editar"
                data-action="edit"
                data-id="${esc(p.id)}"
                data-nombre="${esc(p.nombre_producto)}"
                data-categoria-id="${esc(cat.id)}"
                data-cantidad="${esc(p.cantidad)}"
                data-procedencia="${esc(p.procedencia)}"
              >
                ✏️
              </button>
              <button
                class="inline-flex items-center gap-1 rounded-[0.75rem] bg-red-600 px-2.5 py-1.5 text-white hover:bg-red-700 text-xs"
                title="Eliminar"
                data-action="delete"
                data-id="${esc(p.id)}"
                data-nombre="${esc(p.nombre_producto)}"
              >
                🗑️
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
    showToast('Completa todos los campos.', 'error');
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

    showToast(`${msg}`, 'success');
  } catch (err) {
    // maneja errores de red o de servidor y avisa al usuario
    console.error('Guardar producto:', err);
    showToast(`Error guardando: ${err.message}`, 'error');
  } finally {
    // siempre restablece el estado del boton
    btnSave.disabled = false;
    btnSave.textContent = prev;
  }
}

// actualiza un producto existente usando los datos del formulario (PUT /producto/editar/{id})
async function updateProduct(productId, form, btnSave, closeModal) {
  const nombre = document.getElementById('inp-nombre')?.value.trim();
  const catId  = document.getElementById('sel-categoria')?.value;
  const proc   = document.getElementById('inp-procedencia')?.value.trim();

  // el endpoint de actualizar solo requiere nombre, categoria_id y procedencia
  if (!nombre || !catId || !proc) {
    showToast('Completa nombre, categoría y procedencia.', 'error');
    return;
  }

  const payload = {
    nombre_producto: nombre,
    categoria_id: Number(catId),
    procedencia: proc,
  };

  btnSave.disabled = true;
  const prev = btnSave.textContent;
  btnSave.textContent = 'Guardando…';

  try {
    const res = await fetch(`${URLS.editProduct}/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json().catch(() => null);

    form.reset();
    editingProductId = null;
    closeModal?.();
    await loadProducts();

    showToast('Producto actualizado correctamente.', 'success');
  } catch (err) {
    console.error('Actualizar producto:', err);
    showToast(`Error actualizando: ${err.message}`, 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = prev;
  }
}

// elimina un producto y sus items asociados (DELETE /producto/eliminar/{id})
async function deleteProduct(productId, productName) {
  try {
    const res = await fetch(`${URLS.deleteProduct}/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json().catch(() => null);
    showToast(data?.mensaje || `Producto "${productName}" eliminado correctamente.`, 'success');

    await loadProducts();
  } catch (err) {
    console.error('Eliminar producto:', err);
    showToast(`Error eliminando producto: ${err.message}`, 'error');
  }
}

// abre el modal de confirmación de eliminación
function openDeleteModal(id, nombre) {
  deleteProductId = id;
  deleteProductName = nombre || '';

  const modal = document.getElementById('modal-confirm-delete');
  if (!modal) return;

  const spanName = document.getElementById('confirm-product-name');
  if (spanName) spanName.textContent = `"${deleteProductName}"`;

  modal.classList.add('is-open');
  document.body.classList.add('modal-open');
}

// cierra el modal de confirmación y limpia estado
function closeDeleteModal() {
  const modal = document.getElementById('modal-confirm-delete');
  if (modal) {
    modal.classList.remove('is-open');
  }
  document.body.classList.remove('modal-open');
  deleteProductId = null;
  deleteProductName = "";
}

// conecta la lógica del modal de confirmación de borrado
function wireDeleteModalUI() {
  const modal = document.getElementById('modal-confirm-delete');
  if (!modal) return;

  const btnClose = document.getElementById('btn-close-confirm');
  const btnConfirm = document.getElementById('btn-confirm-delete');

  btnClose?.addEventListener('click', closeDeleteModal);
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeDeleteModal));

  btnConfirm?.addEventListener('click', async () => {
    if (!deleteProductId) {
      closeDeleteModal();
      return;
    }
    const id = deleteProductId;
    const name = deleteProductName;
    closeDeleteModal();
    await deleteProduct(id, name);
  });

  // permite cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDeleteModal();
    }
  });
}

// maneja clicks en los botones de editar y eliminar dentro de la tabla
function wireTableActions() {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;

    if (action === 'edit') {
      // modo edición babys
      editingProductId = Number(id);

      await ensureCategoriesLoaded();

      const modal = document.getElementById('modal-add');
      if (!modal) return;

      const modalTitle = document.getElementById('modal-title');
      if (modalTitle) modalTitle.textContent = 'Editar producto';

      const btnSave = document.getElementById('btn-save');
      if (btnSave) btnSave.textContent = 'Actualizar';

      const inpNombre = document.getElementById('inp-nombre');
      if (inpNombre) inpNombre.value = btn.dataset.nombre || '';

      const selectCat = document.getElementById('sel-categoria');
      if (selectCat && btn.dataset.categoriaId) {
        selectCat.value = btn.dataset.categoriaId;
      }

      const inpCant = document.getElementById('inp-cantidad');
      if (inpCant && btn.dataset.cantidad != null) {
        inpCant.value = btn.dataset.cantidad;
      }

      const inpProc = document.getElementById('inp-procedencia');
      if (inpProc) inpProc.value = btn.dataset.procedencia || '';

      // en modo editar, no se debe modificar la fecha de vencimiento, esto solo es para
      //crear nuevos productos y sus items
      const inpVenc = document.getElementById('inp-vencimiento');
      if (inpVenc) {
        inpVenc.value = '';
        inpVenc.disabled = true;
      }

      modal.classList.add('is-open');
      document.body.classList.add('modal-open');
    } else if (action === 'delete') {
      // abrir modal bonis de confirmación
      const nombre = btn.dataset.nombre || '';
      openDeleteModal(id, nombre);
    }
  });
}

// punto de entrada del modulo
// configura los manejadores del modal y carga la lista inicial de productos
export async function initProducts() {
  wireModalUI();
  await loadProducts();
  wireTableActions();
  wireDeleteModalUI();
}
//jordi estuvo aqui
