(function() {
  'use strict';
  
  console.log('YouTube Music Playlist Sorter: Carregado no contexto da página');
  
  // Cria botão principal
  function createReorderButton() {
    if (document.getElementById('reorder-btn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'reorder-btn';
    btn.textContent = 'Order Playlist by Artist';
    btn.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10000;
      background: #ff0000;
      color: white;
      border: 2px solid #000;
      padding: 12px 24px;
      font: bold 14px Arial;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;
    
    btn.onclick = startReordering;
    document.body.appendChild(btn);
    console.log('✓ Botão de ordenação criado');
  }
  
  // Pega apenas as músicas da playlist
  function getPlaylistItems() {
    const playlistShelf = document.querySelector('ytmusic-playlist-shelf-renderer');
    if (!playlistShelf) return [];
    
    const items = playlistShelf.querySelectorAll('ytmusic-responsive-list-item-renderer');
    return Array.from(items);
  }
  
  // Extrai dados completos de uma música
  function extractSongData(element, index) {
    const title = element.querySelector('.title')?.textContent?.trim() || 'Desconhecido';
    const byline = element.querySelector('.secondary-flex-columns')?.textContent?.trim() || '';
    
    const parts = byline.split('•').map(s => s.trim());
    const artist = parts[0] || 'Artista Desconhecido';
    const album = parts[1] || 'Álbum Desconhecido';
    
    // Usa o método getSetVideoId() do próprio elemento
    let setVideoId = null;
    try {
      if (typeof element.getSetVideoId === 'function') {
        setVideoId = element.getSetVideoId();
      }
    } catch (e) {
      console.warn(`Erro ao extrair setVideoId da música ${index}:`, e);
    }
    
    return { index, title, artist, album, setVideoId };
  }
  
  // Cria array desordenado (ordem atual)
  function getUnorderedArray() {
    const items = getPlaylistItems();
    const array = [];
    
    items.forEach((item, index) => {
      const data = extractSongData(item, index);
      array.push(data);
    });
    
    return array;
  }
  
  // Cria array ordenado (ordem desejada)
  function getOrderedArray(unorderedArray) {
    const songsByArtistAlbum = {};
    
    // Agrupa por artista + álbum
    unorderedArray.forEach(song => {
      const key = `${song.artist}\n${song.album}`;
      
      if (!songsByArtistAlbum[key]) {
        songsByArtistAlbum[key] = [];
      }
      
      songsByArtistAlbum[key].push(song);
    });
    
    // Ordena chaves (artista + álbum)
    const sortedKeys = Object.keys(songsByArtistAlbum).sort((a, b) => 
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
    
    // Ordena músicas dentro de cada álbum
    sortedKeys.forEach(key => {
      songsByArtistAlbum[key].sort((a, b) => 
        a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' })
      );
    });
    
    // Cria array ordenado
    const orderedArray = [];
    sortedKeys.forEach(key => {
      songsByArtistAlbum[key].forEach(song => {
        orderedArray.push(song);
      });
    });
    
    return orderedArray;
  }
  
  // Pega playlistId da URL
  function getPlaylistId() {
    const url = new URL(window.location.href);
    const listParam = url.searchParams.get('list');
    
    if (listParam) {
      return listParam.startsWith('VL') ? listParam.substring(2) : listParam;
    }
    
    return null;
  }
  
  // Pega configuração da API InnerTube
  function getInnerTubeConfig() {
    try {
      const ytcfg = window.ytcfg?.data_;
      if (!ytcfg) {
        console.error('ytcfg não encontrado');
        return null;
      }
      
      const apiKey = ytcfg.INNERTUBE_API_KEY;
      const context = ytcfg.INNERTUBE_CONTEXT;
      
      if (!apiKey || !context) {
        console.error('API key ou context não encontrados');
        return null;
      }
      
      console.log('✓ Configuração InnerTube obtida com sucesso');
      return { apiKey, context };
    } catch (e) {
      console.error('Erro ao acessar configuração InnerTube:', e);
      return null;
    }
  }
  
  // Função auxiliar para calcular SHA-1
  async function sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Gera Authorization header (SAPISIDHASH)
  async function generateAuthorizationHeader() {
    try {
      const cookies = document.cookie.split(';');
      let sapisid = null;
      
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'SAPISID') {
          sapisid = value;
          break;
        }
      }
      
      if (!sapisid) {
        console.error('Cookie SAPISID não encontrado');
        return null;
      }
      
      const timestamp = Math.floor(Date.now() / 1000);
      const origin = 'https://music.youtube.com';
      const hashInput = `${timestamp} ${sapisid} ${origin}`;
      
      const hash = await sha1(hashInput);
      
      return `SAPISIDHASH ${timestamp}_${hash} SAPISID1PHASH ${timestamp}_${hash} SAPISID3PHASH ${timestamp}_${hash}`;
    } catch (e) {
      console.error('Erro ao gerar authorization header:', e);
      return null;
    }
  }
  
  // Detecta o authUser correto
  function getAuthUser() {
    try {
      const ytcfg = window.ytcfg?.data_;
      if (ytcfg?.SESSION_INDEX !== undefined) {
        return String(ytcfg.SESSION_INDEX);
      }
      
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        if (script.textContent.includes('SESSION_INDEX')) {
          const match = script.textContent.match(/"SESSION_INDEX":(\d+)/);
          if (match) {
            return match[1];
          }
        }
      }
      
      return '0';
    } catch (e) {
      return '0';
    }
  }
  
// Move MÚLTIPLAS músicas via API (batch)
async function moveSongsViaAPI(playlistId, actions) {
  const config = getInnerTubeConfig();
  
  if (!config) {
    console.error('Configuração InnerTube não disponível');
    return false;
  }
  
  const authHeader = await generateAuthorizationHeader();
  if (!authHeader) {
    console.error('Não foi possível gerar header de autorização');
    return false;
  }
  
  const apiKey = config.apiKey;
  const endpoint = `https://music.youtube.com/youtubei/v1/browse/edit_playlist?key=${apiKey}&prettyPrint=false`;
  
  const payload = {
    context: config.context,
    playlistId: playlistId,
    actions: actions // Array de múltiplas ações
  };
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'X-Goog-AuthUser': getAuthUser(),
        'X-Goog-Visitor-Id': config.context?.client?.visitorData || '',
        'X-Origin': 'https://music.youtube.com',
        'X-Youtube-Bootstrap-Logged-In': 'true',
        'X-Youtube-Client-Name': '67',
        'X-Youtube-Client-Version': '1.20251215.03.00'
      },
      body: JSON.stringify(payload),
      credentials: 'include',
      mode: 'cors'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API retornou status ${response.status}`);
      console.error('Resposta:', errorText);
      return false;
    }
    
    const result = await response.json();
    
    if (result.error) {
      console.error('Erro na resposta da API:', result.error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao chamar API:', error);
    return false;
  }
}

  
  // Move música no DOM (visual apenas)
  function moveSongInDOM(sourceIndex, targetIndex) {
    const items = getPlaylistItems();
    
    if (sourceIndex < 0 || sourceIndex >= items.length || 
        targetIndex < 0 || targetIndex >= items.length) {
      return false;
    }
    
    const source = items[sourceIndex];
    const target = items[targetIndex];
    
    if (!source || !target) return false;
    
    try {
      const parent = source.parentElement;
      if (!parent) return false;
      
      // Move source para antes de target no DOM
      parent.insertBefore(source, target);
      
      console.log(`  ✓ DOM atualizado visualmente`);
      return true;
    } catch (error) {
      console.error('Erro ao mover no DOM:', error);
      return false;
    }
  }
  
  // Atualiza texto do botão
  function updateButton(text, disabled = false) {
    const btn = document.getElementById('reorder-btn');
    if (btn) {
      btn.textContent = text;
      btn.disabled = disabled;
      btn.style.backgroundColor = disabled ? '#666' : '#ff0000';
      btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }
  }
  
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Carrega todas as músicas da playlist (auto-scroll)
async function loadAllSongs() {
  console.log('🔄 Carregando todas as músicas da playlist...');
  
  let lastCount = 0;
  let sameCount = 0;
  let totalLoaded = 0;
  
  while (true) {
    // Pega quantidade atual
    const items = getPlaylistItems();
    const currentCount = items.length;
    totalLoaded = currentCount;
    
    updateButton(`Carregando músicas (${currentCount})...`, true);
    console.log(`  📊 ${currentCount} músicas carregadas`);
    
    // Scrolla até o final
    const container = document.querySelector('ytmusic-playlist-shelf-renderer');
    if (container) {
      const lastItem = items[items.length - 1];
      if (lastItem) {
        lastItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } else {
      // Fallback: scrolla a página inteira
      window.scrollTo(0, document.body.scrollHeight);
    }
    
    // Aguarda carregar mais músicas
    await sleep(800);
    
    // Verifica se parou de carregar
    if (currentCount === lastCount) {
      sameCount++;
      
      // Se ficou igual 3 vezes seguidas, terminou
      if (sameCount >= 1) {
        console.log(`✓ Todas as ${currentCount} músicas carregadas!`);
        break;
      }
    } else {
      sameCount = 0;
      lastCount = currentCount;
    }
    
    // Safety: limita a 1000 músicas para não travar
    if (currentCount >= 1000) {
      console.warn('⚠ Limite de 1000 músicas atingido');
      break;
    }
  }
  
  // Volta ao topo
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(100);
  
  return totalLoaded;
}

// Verifica se há músicas não carregadas
function hasUnloadedSongs() {
  const playlistShelf = document.querySelector('ytmusic-playlist-shelf-renderer');
  if (!playlistShelf) return false;
  
  // Verifica se tem o indicador de "carregar mais" ou spinner
  const loadingIndicators = [
    'tp-yt-paper-spinner',
    '[loading]',
    '.loading-spinner'
  ];
  
  for (const selector of loadingIndicators) {
    if (playlistShelf.querySelector(selector)) {
      return true;
    }
  }
  
  // Verifica se o container tem mais altura que o visível
  const containerHeight = playlistShelf.scrollHeight;
  const visibleHeight = playlistShelf.clientHeight;
  
  return containerHeight > visibleHeight * 1.5;
}

  
// Inicia o processo de reordenação (versão ULTRA otimizada - batch único)
async function startReordering() {
  console.log('\n=== INICIANDO REORDENAÇÃO DA PLAYLIST ===\n');
  
  updateButton('Processando...', true);
  
  const playlistId = getPlaylistId();
  
  if (!playlistId) {
    alert('Unable to obtain playlist ID!');
    updateButton('Order Playlist by Artist', false);
    return;
  }
  
  console.log('Playlist ID:', playlistId);
  
  const config = getInnerTubeConfig();
  if (!config) {
    alert('Unable to access YT Music API.\nTry to reload the page.');
    updateButton('Order Playlist by Artist', false);
    return;
  }

    // NOVO: Carrega todas as músicas primeiro
  const initialCount = getPlaylistItems().length;
  console.log(`📋 ${initialCount} músicas visíveis inicialmente`);
  
  // Verifica se precisa carregar mais
  if (hasUnloadedSongs() || initialCount > 50) {
    // const loadMore = confirm(
    //   `A playlist tem mais de ${initialCount} músicas.\n\n` +
    //   `Deseja carregar TODAS as músicas antes de ordenar?\n` +
    //   `(Recomendado para playlists grandes)\n\n` +
    //   `Isso pode levar alguns segundos.`
    // );
    
    // if (loadMore) {
      const totalLoaded = await loadAllSongs();
      console.log(`✓ ${totalLoaded} músicas prontas para ordenar`);
    // }    
  }
  
  let unorderedArray = getUnorderedArray();
  
  if (unorderedArray.length === 0) {
    alert('0 songs found in this playlist');
    updateButton('Order Playlist by Artist', false);
    return;
  }
  
  const missingSetVideoId = unorderedArray.filter(s => !s.setVideoId);
  if (missingSetVideoId.length > 0) {
    alert(
      `Error: ${missingSetVideoId.length} songs without valid ID.\n\n`
    );
    updateButton('Order Playlist by Artist', false);
    return;
  }
  
  const orderedArray = getOrderedArray(unorderedArray);
  
  console.log('Preview da ordenação:');
  console.log('ANTES:', unorderedArray.map(s => `${s.artist} - ${s.title}`));
  console.log('DEPOIS:', orderedArray.map(s => `${s.artist} - ${s.title}`));
  
  const proceed = confirm(
    `Order ${unorderedArray.length} songs by artist?\n\n`
  );
  
  if (!proceed) {
    console.log('Cancelado pelo usuário');
    updateButton('Order Playlist by Artist', false);
    return;
  }
  
  updateButton('Calculando movimentos...', true);
  
  // Coleta TODAS as ações necessárias
  const actions = [];
  const domMoves = [];
  
  // Cria uma cópia para simular movimentos
  let simulatedArray = [...unorderedArray];
  
  for (let targetPos = 0; targetPos < orderedArray.length; targetPos++) {
    const targetSong = orderedArray[targetPos];
    
    // Encontra onde essa música está no array simulado
    const currentPos = simulatedArray.findIndex(
      s => s.title === targetSong.title && s.artist === targetSong.artist
    );
    
    if (currentPos === -1) {
      console.warn(`Música não encontrada: ${targetSong.title}`);
      continue;
    }
    
    if (currentPos === targetPos) {
      // Já está na posição correta
      continue;
    }
    
    const songToMove = simulatedArray[currentPos];
    
    if (!songToMove.setVideoId) {
      console.warn(`Música sem setVideoId: ${songToMove.title}`);
      continue;
    }
    
    // Calcula successor (música que deve vir depois)
    let successorSetVideoId = null;
    const currentSongAtTarget = simulatedArray[targetPos];
    
    if (currentSongAtTarget && currentSongAtTarget.setVideoId) {
      successorSetVideoId = currentSongAtTarget.setVideoId;
    }
    
    // Adiciona ação
    actions.push({
      action: 'ACTION_MOVE_VIDEO_BEFORE',
      setVideoId: songToMove.setVideoId,
      movedSetVideoIdSuccessor: successorSetVideoId
    });
    
    // Salva para atualizar DOM depois
    domMoves.push({
      title: songToMove.title,
      from: currentPos,
      to: targetPos
    });
    
    console.log(`  [${actions.length}] ${songToMove.title}: pos ${currentPos + 1} → ${targetPos + 1}`);
    
    // Simula movimento no array para calcular próximas posições corretamente
    const temp = simulatedArray[currentPos];
    simulatedArray.splice(currentPos, 1);
    simulatedArray.splice(targetPos, 0, temp);
  }
  
  if (actions.length === 0) {
    alert('Playlist already ordered!');
    updateButton('Order Playlist by Artist', false);
    return;
  }
  
  console.log(`\n🚀 Enviando ${actions.length} ações em um único batch...`);
  updateButton(`Enviando ${actions.length} movimentos...`, true);
  
  // Envia TODAS as ações de uma vez
  const apiSuccess = await moveSongsViaAPI(playlistId, actions);
  
  if (apiSuccess) {
    console.log('✓ API: Todos os movimentos processados no servidor!');
    updateButton('Atualizando visualização...', true);
    
    // Atualiza DOM para cada movimento (em ordem)
    for (let i = 0; i < domMoves.length; i++) {
      const move = domMoves[i];
      
      // Re-pega estado atual do DOM
      const currentUnordered = getUnorderedArray();
      const fromIndex = currentUnordered.findIndex(s => s.title === move.title);
      
      if (fromIndex !== -1 && fromIndex !== move.to) {
        moveSongInDOM(fromIndex, move.to);
      }
      
      // Atualiza progresso visual
      if (i % 5 === 0 || i === domMoves.length - 1) {
        const progress = Math.round(((i + 1) / domMoves.length) * 100);
        updateButton(`Atualizando (${progress}%)...`, true);
        await sleep(10); // Mini delay para UI atualizar
      }
    }
    
    console.log('✓ DOM atualizado!');
    
    alert(
      `✓ Playlist successfully ordered!\n\n` +
      `${actions.length} songs organized by artists.\n\n`
    );
  } else {
    alert(
      `✗ Error when ordering playlist.\n\n` +
      `Try again or reload the page.`
    );
  }
  
  updateButton('Order Playlist by Artist', false);
}

  
  // Inicializa
  function init() {
    if (!location.href.includes('music.youtube.com/playlist')) {
      console.log('Não é uma playlist, aguardando...');
      return;
    }
    
    console.log('✓ Playlist detectada');
    
    const check = setInterval(() => {
      const playlistShelf = document.querySelector('ytmusic-playlist-shelf-renderer');
      if (playlistShelf) {
        const items = playlistShelf.querySelectorAll('ytmusic-responsive-list-item-renderer');
        if (items.length > 0) {
          clearInterval(check);
          createReorderButton();
          console.log(`✓ ${items.length} músicas encontradas`);
        }
      }
    }, 500);
    
    setTimeout(() => clearInterval(check), 10000);
  }
  
  // Observa navegação
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById('reorder-btn')?.remove();
      init();
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Inicia
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
