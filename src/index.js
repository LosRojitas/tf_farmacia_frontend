// src/index.js
import '/tf_farmacia_frontend/pages/login/login.js'; // lo que ya tienes

function boot() {
  const hook = document.getElementById('products-view');
  if (hook) import('/tf_farmacia_frontend/pages/products/products.js').then(m => m.initProducts());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
