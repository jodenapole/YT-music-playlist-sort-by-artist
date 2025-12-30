// Injeta script no contexto da página
function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Escuta mensagens do script injetado
window.addEventListener('message', (event) => {
  // Só aceita mensagens da nossa origem
  if (event.source !== window) return;
  
  const message = event.data;
  
  if (message.type === 'YTM_SORTER_LOG') {
    console.log('[YTM Sorter]', message.data);
  } else if (message.type === 'YTM_SORTER_ERROR') {
    console.error('[YTM Sorter]', message.data);
  }
});

// Injeta quando a página carregar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectScript);
} else {
  injectScript();
}
