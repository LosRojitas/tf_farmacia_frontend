// src/index.js
import './pages/login/login.js'; // lo que ya tienes

function boot() {
  const hook = document.getElementById('products-view');
  if (hook) import('./pages/products/products.js').then(m => m.initProducts());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
