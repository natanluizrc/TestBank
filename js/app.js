// =====================================================================
// CONFIGURAÇÃO FIREBASE
// =====================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCL2IZUtVUU0d8evu7-So6gsB1A9y2h5wI",
  authDomain: "nl-testbank.firebaseapp.com",
  projectId: "nl-testbank",
  storageBucket: "nl-testbank.firebasestorage.app",
  messagingSenderId: "1094588954081",
  appId: "1:1094588954081:web:83975863adc7bf83360ea0"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// =====================================================================
// CONTEÚDO — registrar cada aula aqui após extrair o PDF
// =====================================================================
const MATERIAS = [
  {
    id: 'contabilidade',
    nome: 'ContG',
    aulas: [
      { slug: 'aula-00',  titulo: 'Aula 00' },
      { slug: 'aula-01a', titulo: 'Aula 01A' },
      { slug: 'aula-01b', titulo: 'Aula 01B' },
      { slug: 'aula-02a', titulo: 'Aula 02A' },
      { slug: 'aula-02b', titulo: 'Aula 02B' },
      { slug: 'aula-03',  titulo: 'Aula 03' },
      { slug: 'aula-04',  titulo: 'Aula 04' },
      { slug: 'aula-05',  titulo: 'Aula 05' },
    ]
  },
];

const DIAGRAMA_RE = /[┌┐└┘│─┬┴┼├┤]/;

// =====================================================================
// ESTADO
// =====================================================================
let usuario = null;
let materiaAtiva = MATERIAS[0];
let aulaAtiva = MATERIAS[0].aulas[0];
let tabGlobal = null;       // null | 'simulado' | 'historico' | 'revisao'
let aulaCache = {};         // 'materiaId/slug' → dados JSON
let listaRespostas = {};   // questaoId → { dada, acertou }
let revisaoIds = new Set();
let revisaoQuestoes = [];
let salvosFiltroSlug = null;
let simuladoState = null;

// =====================================================================
// AUTH
// =====================================================================
auth.onAuthStateChanged(user => {
  if (user) {
    usuario = user;
    mostrarApp();
  } else {
    usuario = null;
    mostrarLogin();
  }
});

function mostrarLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('tela-login').classList.remove('hidden');
}

async function mostrarApp() {
  document.getElementById('tela-login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const avatar = document.getElementById('avatar');
  if (usuario.photoURL) {
    avatar.src = usuario.photoURL;
    avatar.style.display = '';
  } else {
    avatar.style.display = 'none';
  }

  salvarPerfil();
  inicializarApp();
}

async function salvarPerfil() {
  const ref = db.collection('usuarios').doc(usuario.uid).collection('perfil').doc('dados');
  try {
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        nome: usuario.displayName,
        email: usuario.email,
        fotoUrl: usuario.photoURL,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) {
    console.error('Erro ao salvar perfil:', e);
  }
}

async function inicializarApp() {
  await carregarRevisao();
  document.querySelector('.aba-global[data-tab="inicio"]')?.classList.add('ativa');
  renderConteudo();
}

// =====================================================================
// NAVEGAÇÃO
// =====================================================================
function renderBarraMaterias() {
  const barra = document.getElementById('barra-materias');
  if (tabGlobal === 'historico' || tabGlobal === 'materiais') { barra.style.display = 'none'; return; }
  if (tabGlobal === 'simulado') {
    const s = simuladoState;
    if (!s || s.fase === 'config') { barra.style.display = 'none'; return; }
    const mid = s.fonte.split(':')[1];
    const m = MATERIAS.find(x => x.id === mid);
    barra.style.display = '';
    barra.innerHTML = m ? `<button class="aba-materia ativa">${m.nome}</button>` : '';
    return;
  }
  barra.style.display = '';
  barra.innerHTML = MATERIAS.map(m =>
    `<button class="aba-materia ${m.id === materiaAtiva.id ? 'ativa' : ''}" data-mid="${m.id}">${m.nome}</button>`
  ).join('');
  barra.querySelectorAll('.aba-materia').forEach(btn => {
    btn.addEventListener('click', () => {
      materiaAtiva = MATERIAS.find(m => m.id === btn.dataset.mid);
      aulaAtiva = materiaAtiva.aulas[0];
      if (tabGlobal === 'revisao') {
        salvosFiltroSlug = materiaAtiva.aulas[0].slug;
        renderBarraMaterias();
        renderBarraAulas();
        renderRevisao();
      } else {
        tabGlobal = null;
        salvosFiltroSlug = null;
        document.querySelectorAll('.aba-global').forEach(b => b.classList.remove('ativa'));
        document.querySelector('.aba-global[data-tab="inicio"]')?.classList.add('ativa');
        renderConteudo();
      }
    });
  });
}

function renderBarraAulas() {
  const barra = document.getElementById('barra-aulas');
  if (tabGlobal === 'simulado') {
    const s = simuladoState;
    if (!s || s.fase === 'config' || !s.fonte.startsWith('aula:')) { barra.style.display = 'none'; return; }
    const [, mid, slug] = s.fonte.split(':');
    const m = MATERIAS.find(x => x.id === mid);
    const a = m?.aulas.find(x => x.slug === slug);
    barra.style.display = '';
    barra.innerHTML = a ? `<button class="aba-aula ativa">${a.titulo}</button>` : '';
    return;
  }
  if (tabGlobal && tabGlobal !== 'revisao') {
    barra.style.display = 'none';
    return;
  }

  barra.style.display = '';
  const isRevisao = tabGlobal === 'revisao';
  barra.innerHTML = materiaAtiva.aulas.map(a => {
    const ativa = isRevisao ? salvosFiltroSlug === a.slug : a.slug === aulaAtiva.slug;
    return `<button class="aba-aula ${ativa ? 'ativa' : ''}" data-slug="${a.slug}">${a.titulo}</button>`;
  }).join('');

  barra.querySelectorAll('.aba-aula').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slug;
      if (tabGlobal === 'revisao') {
        salvosFiltroSlug = salvosFiltroSlug === slug ? null : slug;
        renderBarraAulas();
        renderRevisao();
      } else {
        aulaAtiva = materiaAtiva.aulas.find(a => a.slug === slug);
        barra.querySelectorAll('.aba-aula').forEach(b => b.classList.remove('ativa'));
        btn.classList.add('ativa');
        renderQuestoes();
      }
    });
  });
}

function renderConteudo() {
  renderBarraMaterias();
  renderBarraAulas();

  if (tabGlobal === 'simulado')   { renderSimuladoConfig(); return; }
  if (tabGlobal === 'historico')  { renderHistorico(); return; }
  if (tabGlobal === 'revisao')    { renderRevisao();  return; }
  if (tabGlobal === 'materiais')  { renderMateriais(); return; }
  renderQuestoes();
}

// =====================================================================
// CARREGAMENTO DE DADOS
// =====================================================================
async function carregarAulaDados(materiaId, slug) {
  const key = `${materiaId}/${slug}`;
  if (aulaCache[key]) return aulaCache[key];
  try {
    const resp = await fetch(`data/${materiaId}/${slug}.json`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error();
    const dados = await resp.json();
    aulaCache[key] = dados;
    return dados;
  } catch {
    return null;
  }
}

async function carregarAula(slug) {
  return carregarAulaDados(materiaAtiva.id, slug);
}

// =====================================================================
// QUESTÕES
// =====================================================================
async function renderQuestoes() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p class="msg-vazio">Carregando...</p>';

  const dados = await carregarAula(aulaAtiva.slug);
  if (dados?.secoes?.length) { renderTeoria(dados); return; }
  if (!dados || !dados.questoes?.length) {
    conteudo.innerHTML = '<p class="msg-vazio">Nenhuma questão disponível.</p>';
    return;
  }

  listaRespostas = {};

  conteudo.innerHTML = `<div id="questoes-area"></div>`;
  renderListaQuestoes(dados.questoes);
}

// =====================================================================
// TEORIA
// =====================================================================
function melhorVoz(lang) {
  const voices = speechSynthesis.getVoices();
  const base = lang.split('-')[0];
  const prefs = [
    v => v.lang === lang && /Google|Microsoft/.test(v.name),
    v => v.lang === lang,
    v => v.lang.startsWith(base) && /Google|Microsoft/.test(v.name),
    v => v.lang.startsWith(base),
  ];
  for (const p of prefs) {
    const match = voices.find(p);
    if (match) return match;
  }
  return null;
}

function carregarVozes() {
  return new Promise(res => {
    const v = speechSynthesis.getVoices();
    if (v.length) { res(); return; }
    speechSynthesis.onvoiceschanged = () => res();
  });
}

function renderTeoria(dados) {
  const conteudo = document.getElementById('conteudo');
  const lang = dados.lang || 'pt-BR';
  const md = t => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const textos = dados.secoes.map(s => s.conteudo.replace(/\*\*(.+?)\*\*/g, '$1'));
  const html = dados.secoes.map((s, i) => {
    const corpo = s.conteudo.split('\n\n')
      .map(p => `<p>${md(p.replace(/\n/g, '<br>'))}</p>`)
      .join('');
    return `<div class="teoria-secao">
      <div class="teoria-secao-header">
        <h2 class="teoria-titulo">${s.titulo}</h2>
        <button class="teoria-play" data-idx="${i}" title="Ouvir esta seção">▶</button>
      </div>
      <div class="teoria-corpo">${corpo}</div>
    </div>`;
  }).join('');
  conteudo.innerHTML = `<div class="teoria-container">${html}</div>`;

  let activeBtn = null;
  conteudo.querySelectorAll('.teoria-play').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (activeBtn === btn && speechSynthesis.speaking) {
        speechSynthesis.cancel();
        btn.classList.remove('playing');
        activeBtn = null;
        return;
      }
      speechSynthesis.cancel();
      if (activeBtn) { activeBtn.classList.remove('playing'); }
      await carregarVozes();
      const utt = new SpeechSynthesisUtterance(textos[+btn.dataset.idx]);
      utt.lang = lang;
      utt.rate = 0.9;
      utt.pitch = 1.0;
      const voz = melhorVoz(lang);
      if (voz) utt.voice = voz;
      const done = () => { btn.classList.remove('playing'); if (activeBtn === btn) activeBtn = null; };
      utt.onend = done;
      utt.onerror = done;
      speechSynthesis.speak(utt);
      btn.classList.add('playing');
      activeBtn = btn;
    });
  });
}

// =====================================================================
// MATERIAIS
// =====================================================================
const MATERIAIS_LISTA = [
  { slug: 'notebooklm-prompts', titulo: 'Prompts: NotebookLM', descricao: 'Prompts prontos para gerar podcast, vídeo, slides, quiz, flashcards, infográfico, mapa mental e diálogo a partir de qualquer material.' },
  { slug: 'ingles-personalidade', titulo: 'Describing Character and Behavior', descricao: 'Personality adjectives, opposite pairs, grammar of "being + adjective", and false friends for Portuguese speakers.' },
  { slug: 'ingles-aparencia', titulo: 'Describing Appearance', descricao: 'Hair types and colors, body and skin vocabulary, modifiers (quite, fairly, rather...), and grooming phrases.' },
  { slug: 'ingles-corpo', titulo: 'Parts of the Body', descricao: 'Body parts from head to toe, action verbs, exercise vocabulary, and tricky plurals.' },
  { slug: 'ingles-familia', titulo: 'In the Family', descricao: 'Family member vocabulary, prefixes (step-, half-, great-, in-law), types of families, and relationship words.' },
  { slug: 'ingles-trabalho', titulo: 'Describing a Job', descricao: 'How to describe any job in English — conditions, environment, feelings, and duties — in opposite pairs, plus the grammar and vocabulary that make professional descriptions sound natural.' },
  { slug: 'ingles-crime', titulo: 'Crime and Justice', descricao: 'Types of crime, people in the justice system, the passive voice in news reporting, legal process vocabulary, and useful expressions.' },
  { slug: 'ingles-opposites', titulo: 'Word Building — Part 1: Prefixes and Opposites', descricao: 'The complete system for making opposites in English: suffix -less, prefixes un-, in-/im-/ir-/il-, and dis- — with the three words that will trap you if you apply the logic too confidently.' },
  { slug: 'ingles-word-building', titulo: 'Word Building — Part 2: Suffixes and Word Families', descricao: 'Four productive suffixes: -ous (noun → adjective), -able/-ible (verb → adjective), -tion/-ment/-ness (verb/adjective → noun), -er/-or/-ist (verb/field → person).' },
  { slug: 'ingles-false-friends', titulo: 'False Friends', descricao: 'The 50 most common English words that Portuguese speakers consistently misinterpret — with explanations, context, and traps to avoid.' },
  { slug: 'ingles-linking-words-1', titulo: 'Linking Words — Part 1: Contrast and Concession', descricao: 'Whereas, although, despite, however, nevertheless — the words that show contrast and concession, with the grammar rules that tell you which structure each one requires.' },
  { slug: 'ingles-linking-words-2', titulo: 'Linking Words — Part 2: Addition, Cause and Sequence', descricao: 'Furthermore, therefore, meanwhile, for example, in conclusion — the complete toolkit for linking ideas, with a punctuation guide and the traps that catch even advanced learners.' },
];

let materialAtivo = null;

function aplicarGlossarioAuto(container, gmap) {
  if (!gmap.size) return;
  // Build pattern: glossary keys + common plural variants for simple words
  const allKeys = new Set(gmap.keys());
  for (const key of gmap.keys()) {
    if (!/[\s\/\+]/.test(key)) {
      allKeys.add(key + 's');
      allKeys.add(key + 'es');
      if (/[^aeiou]y$/i.test(key)) allKeys.add(key.slice(0, -1) + 'ies');
    }
  }
  const sorted = [...allKeys].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(?<![\\w-])(${pattern})(?![\\w-])`, 'gi');
  const findEntry = w => {
    const l = w.toLowerCase();
    return gmap.get(l) || gmap.get(l.replace(/ies$/, 'y')) || gmap.get(l.replace(/ves$/, 'f'))
      || gmap.get(l.replace(/s$/, '')) || gmap.get(l.replace(/es$/, ''));
  };
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) {
    if (!n.parentElement.closest('strong')) nodes.push(n);
  }
  for (const textNode of nodes) {
    const text = textNode.textContent;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      const entry = findEntry(m[0]);
      if (!entry) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const strong = document.createElement('strong');
      strong.className = 'glossario-inline';
      strong.dataset.fala = entry.fala || m[0];
      strong.dataset.significado = entry.significado;
      strong.dataset.palavra = m[0];
      strong.textContent = m[0];
      frag.appendChild(strong);
      last = m.index + m[0].length;
    }
    re.lastIndex = 0;
    if (last > 0) {
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }
}

async function carregarMaterial(slug) {
  const key = `materiais/${slug}`;
  if (aulaCache[key]) return aulaCache[key];
  try {
    const resp = await fetch(`data/materiais/${slug}.json`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error();
    const dados = await resp.json();
    aulaCache[key] = dados;
    return dados;
  } catch { return null; }
}

async function renderMateriais() {
  const conteudo = document.getElementById('conteudo');
  const md = t => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  if (materialAtivo) {
    conteudo.innerHTML = '<p class="msg-vazio">Carregando…</p>';
    const dados = await carregarMaterial(materialAtivo);
    if (!dados) {
      conteudo.innerHTML = '<p class="msg-vazio">Material não encontrado.</p>';
      return;
    }
    const gmap = new Map();
    if (dados.glossario) {
      dados.glossario.forEach(g => gmap.set(g.palavra.toLowerCase(), g));
    }
    const mdGloss = t => t.replace(/\*\*(.+?)\*\*/g, (_, word) => {
      const lower = word.toLowerCase();
      const entry = gmap.get(lower)
        || gmap.get(lower.replace(/ies$/, 'y'))
        || gmap.get(lower.replace(/ves$/, 'f'))
        || gmap.get(lower.replace(/s$/, ''))
        || gmap.get(lower.replace(/es$/, ''));
      if (entry) {
        const fala = (entry.fala || word).replace(/"/g, '&quot;');
        const sig  = entry.significado.replace(/"/g, '&quot;');
        return `<strong class="glossario-inline" data-fala="${fala}" data-significado="${sig}" data-palavra="${word}">${word}</strong>`;
      }
      return `<strong>${word}</strong>`;
    });
    const renderCorpo = (text) => {
      const parts = text.split('```');
      return parts.map((part, i) => {
        if (i % 2 === 1) {
          const code = part.replace(/^\n/, '').replace(/\n$/, '');
          return `<div class="prompt-block-wrap"><pre class="prompt-block">${code}</pre><button class="prompt-copy">Copiar</button></div>`;
        }
        return part.split('\n\n').filter(p => p.trim())
          .map(p => `<p>${mdGloss(p.replace(/\n/g, '<br>'))}</p>`).join('');
      }).join('');
    };
    const html = dados.secoes.map(s => {
      return `<div class="teoria-secao">
        <div class="teoria-secao-header"><h2 class="teoria-titulo">${s.titulo}</h2></div>
        <div class="teoria-corpo">${renderCorpo(s.conteudo)}</div>
      </div>`;
    }).join('');
    conteudo.innerHTML = `
      <div class="material-detalhe">
        <button class="material-voltar" id="btn-voltar">← Materiais</button>
        <h1 class="material-detalhe-titulo">${dados.titulo}</h1>
        <div class="teoria-container">${html}</div>
      </div>
      <div id="glossario-overlay" class="glossario-overlay hidden"></div>
      <div id="glossario-popup" class="glossario-popup hidden">
        <div class="glossario-popup-header">
          <span class="glossario-popup-palavra"></span>
          <button class="glossario-popup-play" title="Ouvir">▶ Ouvir</button>
        </div>
        <p class="glossario-popup-sig"></p>
      </div>`;
    document.getElementById('btn-voltar').addEventListener('click', () => {
      materialAtivo = null;
      renderMateriais();
    });
    conteudo.querySelectorAll('.teoria-corpo').forEach(el => aplicarGlossarioAuto(el, gmap));
    conteudo.querySelectorAll('.prompt-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const pre = btn.previousElementSibling;
        navigator.clipboard.writeText(pre.textContent).then(() => {
          btn.textContent = 'Copiado!';
          setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
        }).catch(() => {});
      });
    });
    const popup   = document.getElementById('glossario-popup');
    const overlay = document.getElementById('glossario-overlay');
    const ppPalavra = popup.querySelector('.glossario-popup-palavra');
    const ppSig     = popup.querySelector('.glossario-popup-sig');
    const ppPlay    = popup.querySelector('.glossario-popup-play');
    let currentFala = '';

    function fecharPopup() {
      popup.classList.add('hidden');
      overlay.classList.add('hidden');
    }
    function abrirPopup(el) {
      currentFala = el.dataset.fala;
      ppPalavra.textContent = el.dataset.palavra;
      ppSig.textContent     = el.dataset.significado;
      overlay.classList.remove('hidden');
      popup.classList.remove('hidden');
      const rect = el.getBoundingClientRect();
      const pw = 290, margin = 10;
      let left = rect.left;
      let top  = rect.bottom + 6;
      if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
      if (left < margin) left = margin;
      if (top + 140 > window.innerHeight) top = rect.top - 146;
      if (top < margin) top = margin;
      popup.style.left = left + 'px';
      popup.style.top  = top  + 'px';
    }

    conteudo.addEventListener('click', e => {
      const el = e.target.closest('.glossario-inline');
      if (el) abrirPopup(el);
    });
    overlay.addEventListener('click', fecharPopup);
    ppPlay.addEventListener('click', async e => {
      e.stopPropagation();
      await carregarVozes();
      const utter = new SpeechSynthesisUtterance(currentFala);
      const voz = melhorVoz(dados.lang || 'en-US');
      if (voz) utter.voice = voz;
      utter.rate = 0.85;
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
    });
    return;
  }

  if (!MATERIAIS_LISTA.length) {
    conteudo.innerHTML = `<div class="materiais-container"><p class="msg-vazio">Nenhum material disponível ainda — envie uma fonte aqui no chat para gerar o primeiro.</p></div>`;
    return;
  }

  const cards = MATERIAIS_LISTA.map(m => `
    <div class="material-card" data-slug="${m.slug}">
      <h3 class="material-card-titulo">${m.titulo}</h3>
      ${m.descricao ? `<p class="material-card-desc">${m.descricao}</p>` : ''}
    </div>`).join('');
  conteudo.innerHTML = `<div class="materiais-container"><div class="materiais-grid">${cards}</div></div>`;
  conteudo.querySelectorAll('.material-card').forEach(card => {
    card.addEventListener('click', () => {
      materialAtivo = card.dataset.slug;
      renderMateriais();
    });
  });
}

// ---- Modo lista ----
function renderListaQuestoes(questoes) {
  const area = document.getElementById('questoes-area');
  let questoesFiltradas = [...questoes];

  const p3 = n => String(n).padStart(3, '0');

  const placarHtml = () => {
    const ids     = new Set(questoesFiltradas.map(q => q.id));
    const acertos = Object.entries(listaRespostas).filter(([id, r]) => ids.has(id) && r.acertou).length;
    const erros   = Object.entries(listaRespostas).filter(([id, r]) => ids.has(id) && !r.acertou).length;
    const fixadas = questoesFiltradas.filter(q => revisaoIds.has(q.id)).length;
    return `<span class="total">${p3(questoesFiltradas.length)}</span><span class="acerto">${p3(acertos)}</span><span class="erro">${p3(erros)}</span><span class="fixadas">${p3(fixadas)}</span>`;
  };

  const uniq = arr => [...new Set(arr.filter(v => v != null))].sort((a, b) =>
    typeof a === 'number' ? b - a : String(a).localeCompare(String(b), 'pt')
  );
  const opts = vals => uniq(vals).map(v => `<option value="${v}">${v}</option>`).join('');
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const difOpts = uniq(questoes.map(q => q.dificuldade).filter(Boolean))
    .sort((a, b) => a - b)
    .map(n => `<option value="${n}">${stars(n)}</option>`).join('');
  const tiposPresentes = [...new Set(questoes.map(q => q.tipo))];
  const tipoOpts = [
    tiposPresentes.includes('multipla_escolha') ? '<option value="multipla_escolha">Múltipla Escolha</option>' : '',
    tiposPresentes.includes('certo_errado')     ? '<option value="certo_errado">Certo/Errado</option>'         : '',
  ].join('');

  area.innerHTML = `
    <div class="barra-filtros barra-filtros-sticky">
      <div class="filtros-grid">
        <select id="filtro-banca" class="filtro-select"><option value="">Banca</option>${opts(questoes.map(q => q.banca))}</select>
        <select id="filtro-cargo" class="filtro-select"><option value="">Cargo</option>${opts(questoes.map(q => q.cargo))}</select>
        <select id="filtro-ano"   class="filtro-select"><option value="">Ano</option>${opts(questoes.map(q => q.ano))}</select>
        <select id="filtro-tipo" class="filtro-select"><option value="">Tipo</option>${tipoOpts}</select>
        <select id="filtro-dif"  class="filtro-select"><option value="">Dificuldade</option>${difOpts}</select>
        <button id="btn-limpar-filtros" class="btn-limpar inativo">Limpar</button>
      </div>
      <div class="questoes-barra">
        <div class="barra-placar">${placarHtml()}</div>
        <button id="btn-expandir">Ver Gabaritos</button>
      </div>
    </div>
    ${questoes.map((q, i) => htmlQuestaoLista(q, i)).join('')}
  `;
  diagramasParaCanvas();

  const atualizarPlacar = () => {
    const pl = area.querySelector('.barra-placar');
    if (pl) pl.innerHTML = placarHtml();
  };

  const FILTRO_CAMPO = {
    'filtro-banca': q => q.banca,
    'filtro-cargo': q => q.cargo,
    'filtro-ano':   q => String(q.ano ?? ''),
    'filtro-tipo':  q => q.tipo,
    'filtro-dif':   q => String(q.dificuldade ?? ''),
  };
  const FILTRO_LABEL = {
    'filtro-banca': 'Banca', 'filtro-cargo': 'Cargo', 'filtro-ano': 'Ano',
    'filtro-tipo': 'Tipo', 'filtro-dif': 'Dificuldade',
  };
  const FILTROS = Object.keys(FILTRO_CAMPO);

  const val = id => document.getElementById(id)?.value || '';

  const opcoesHtml = (id, qs) => {
    if (id === 'filtro-tipo') {
      const tipos = new Set(qs.map(q => q.tipo));
      return [
        tipos.has('multipla_escolha') ? '<option value="multipla_escolha">Múltipla Escolha</option>' : '',
        tipos.has('certo_errado')     ? '<option value="certo_errado">Certo/Errado</option>'         : '',
      ].join('');
    }
    if (id === 'filtro-dif') {
      return uniq(qs.map(q => q.dificuldade).filter(Boolean))
        .sort((a, b) => a - b)
        .map(n => `<option value="${n}">${stars(n)}</option>`).join('');
    }
    const raw = { 'filtro-banca': q => q.banca, 'filtro-cargo': q => q.cargo, 'filtro-ano': q => q.ano };
    return opts(qs.map(raw[id]));
  };

  const atualizarCascata = changedId => {
    const idx = FILTROS.indexOf(changedId);
    let base = questoes;
    for (let i = 0; i <= idx; i++) {
      const v = val(FILTROS[i]);
      if (v) base = base.filter(q => FILTRO_CAMPO[FILTROS[i]](q) === v);
    }
    for (let i = idx + 1; i < FILTROS.length; i++) {
      const id = FILTROS[i];
      const el = document.getElementById(id);
      if (!el) continue;
      const prev = el.value;
      el.innerHTML = `<option value="">${FILTRO_LABEL[id]}</option>` + opcoesHtml(id, base);
      if (prev) el.value = prev;
    }
  };

  const aplicarFiltros = () => {
    questoesFiltradas = questoes.filter(q =>
      FILTROS.every(id => { const v = val(id); return !v || FILTRO_CAMPO[id](q) === v; })
    );
    const ids = new Set(questoesFiltradas.map(q => q.id));
    area.querySelectorAll('.questao-card').forEach(card =>
      card.classList.toggle('hidden', !ids.has(card.dataset.qid))
    );
    FILTROS.forEach(id => document.getElementById(id)?.classList.toggle('ativo', !!val(id)));
    document.getElementById('btn-limpar-filtros')?.classList.toggle('inativo', !FILTROS.some(id => val(id)));
    atualizarPlacar();
  };

  FILTROS.forEach(id => document.getElementById(id)?.addEventListener('change', () => {
    atualizarCascata(id);
    aplicarFiltros();
  }));

  document.getElementById('btn-limpar-filtros')?.addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('inativo')) return;
    FILTROS.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.classList.remove('ativo'); }
    });
    FILTROS.forEach(id => atualizarCascata(id));
    aplicarFiltros();
  });

  document.getElementById('btn-expandir').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const expandir = btn.textContent === 'Ver Gabaritos';
    area.querySelectorAll('.questao-card:not(.hidden) .gabarito-inline').forEach(gab => {
      gab.classList.toggle('hidden', !expandir);
      const revelar = area.querySelector(`.btn-revelar[data-id="${gab.dataset.id}"]`);
      if (revelar) {
        revelar.textContent = expandir ? 'Ocultar Gabarito' : 'Ver Gabarito';
        revelar.classList.toggle('aberto', expandir);
      }
    });
    btn.textContent = expandir ? 'Ocultar Gabaritos' : 'Ver Gabaritos';
    btn.classList.toggle('aberto', expandir);
  });

  area.querySelectorAll('.btn-revelar').forEach(btn => {
    btn.addEventListener('click', () => {
      const gab = area.querySelector(`.gabarito-inline[data-id="${btn.dataset.id}"]`);
      gab.classList.toggle('hidden');
      const oculto = gab.classList.contains('hidden');
      btn.textContent = oculto ? 'Ver Gabarito' : 'Ocultar Gabarito';
      btn.classList.toggle('aberto', !oculto);
    });
  });

  area.querySelectorAll('.opcao[data-letra]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const card = btn.closest('.questao-card');
      const q = questoes.find(x => x.id === card.dataset.qid);
      const acertou = btn.dataset.letra === q.resposta;
      listaRespostas[q.id] = { dada: btn.dataset.letra, acertou };
      registrarRespostaQuestao(q, acertou, questoes.indexOf(q) + 1);
      card.querySelectorAll('.opcao').forEach(o => {
        o.disabled = true;
        if (o.dataset.letra === q.resposta) o.classList.add('correta');
        else if (o.dataset.letra === btn.dataset.letra) o.classList.add('errada');
      });
      if (!acertou && !revisaoIds.has(q.id)) {
        toggleRevisao(q, questoes.indexOf(q) + 1);
        const btnMarcar = card.querySelector('.btn-marcar');
        if (btnMarcar) { btnMarcar.classList.add('marcado'); btnMarcar.textContent = 'Fixada'; }
      }
      atualizarPlacar();
    });
  });

  area.querySelectorAll('.btn-ce[data-resp]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const card = btn.closest('.questao-card');
      const q = questoes.find(x => x.id === card.dataset.qid);
      const acertou = btn.dataset.resp === q.resposta;
      listaRespostas[q.id] = { dada: btn.dataset.resp, acertou };
      registrarRespostaQuestao(q, acertou, questoes.indexOf(q) + 1);
      card.querySelectorAll('.btn-ce').forEach(b => {
        b.disabled = true;
        if (b.dataset.resp === q.resposta) b.classList.add('correta');
        else if (b.dataset.resp === btn.dataset.resp) b.classList.add('errada');
      });
      if (!acertou && !revisaoIds.has(q.id)) {
        toggleRevisao(q, questoes.indexOf(q) + 1);
        const btnMarcar = card.querySelector('.btn-marcar');
        if (btnMarcar) { btnMarcar.classList.add('marcado'); btnMarcar.textContent = 'Fixada'; }
      }
      atualizarPlacar();
    });
  });

  area.querySelectorAll('.btn-marcar').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const qIdx = questoes.findIndex(x => x.id === btn.dataset.qid);
      const q = questoes[qIdx];
      if (!q) return;
      toggleRevisao(q, qIdx + 1);
      const marcado = revisaoIds.has(q.id);
      if (tabGlobal === 'revisao' && !marcado) {
        const card = btn.closest('.questao-card');
        card?.remove();
        atualizarPlacar();
        if (!area.querySelector('.questao-card')) {
          area.innerHTML = '<p class="msg-vazio">Nenhuma questão salva ainda.</p>';
        }
      } else {
        btn.classList.toggle('marcado', marcado);
        btn.textContent = marcado ? 'Fixada' : 'Fixar';
        atualizarPlacar();
      }
    });
  });
}

function diagramasParaCanvas() {
  const BOX = {
    '─': { l:true,  r:true,  t:false, b:false },
    '│': { l:false, r:false, t:true,  b:true  },
    '┌': { l:false, r:true,  t:false, b:true  },
    '┐': { l:true,  r:false, t:false, b:true  },
    '└': { l:false, r:true,  t:true,  b:false },
    '┘': { l:true,  r:false, t:true,  b:false },
    '├': { l:false, r:true,  t:true,  b:true  },
    '┤': { l:true,  r:false, t:true,  b:true  },
    '┬': { l:true,  r:true,  t:false, b:true  },
    '┴': { l:true,  r:true,  t:true,  b:false },
    '┼': { l:true,  r:true,  t:true,  b:true  },
  };

  document.querySelectorAll('pre.diagrama').forEach(pre => {
    const lines = pre.textContent.split('\n');
    const fontSize = 13;
    const lh = fontSize * 1.7;
    const px = 10, py = 10;
    const fontStr = `${fontSize}px monospace`;

    const tmp = document.createElement('canvas').getContext('2d');
    tmp.font = fontStr;
    const cw = tmp.measureText('M').width;

    const maxLen = Math.max(...lines.map(l => [...l].length));
    const w = Math.ceil(maxLen * cw + px * 2);
    const h = Math.ceil(lines.length * lh + py * 2);

    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.cssText = `width:${w}px;max-width:100%;aspect-ratio:${w}/${h};display:block;margin:0.75rem 0;border-radius:6px;border:1px solid #e5e7eb;`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, w, h);

    const cellX  = col => px + col * cw;
    const cellY  = row => py + row * lh;
    const midX   = col => px + col * cw + cw * 0.5;
    const midY   = row => py + row * lh + lh * 0.5;

    ctx.strokeStyle = '#374151';
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'square';
    ctx.font        = fontStr;
    ctx.fillStyle   = '#1a1a1a';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';

    // Pass 1: linhas de borda
    ctx.beginPath();
    lines.forEach((line, row) => {
      [...line].forEach((ch, col) => {
        const seg = BOX[ch];
        if (!seg) return;
        if (seg.l) { ctx.moveTo(cellX(col),   midY(row));  ctx.lineTo(midX(col),    midY(row));  }
        if (seg.r) { ctx.moveTo(midX(col),    midY(row));  ctx.lineTo(cellX(col+1), midY(row));  }
        if (seg.t) { ctx.moveTo(midX(col),    cellY(row)); ctx.lineTo(midX(col),    midY(row));  }
        if (seg.b) { ctx.moveTo(midX(col),    midY(row));  ctx.lineTo(midX(col),    cellY(row+1)); }
      });
    });
    ctx.stroke();

    // Pass 2: texto centralizado por célula (detecta bordas por coluna, suporta células mescladas)
    const chars2d = lines.map(l => [...l]);

    // Uma linha é borda horizontal para a célula cujo separador esquerdo está em leftBound
    // se o caractere nessa posição tem extensão para a direita (início de linha horizontal).
    const isHBorderForCell = (row, leftBound) => {
      const ch = chars2d[row]?.[leftBound];
      return !!(ch && BOX[ch] && BOX[ch].r);
    };

    const cellCenterYForCell = (row, leftBound) => {
      let top = row, bot = row;
      for (let i = row - 1; i >= 0; i--) {
        if (isHBorderForCell(i, leftBound)) { top = i + 1; break; } else top = i;
      }
      for (let i = row + 1; i < lines.length; i++) {
        if (isHBorderForCell(i, leftBound)) { bot = i - 1; break; } else bot = i;
      }
      return (cellY(top) + cellY(bot + 1)) / 2;
    };

    ctx.textAlign = 'center';
    lines.forEach((line, row) => {
      const chars = chars2d[row];
      let i = 0;
      while (i < chars.length) {
        if (BOX[chars[i]]) { i++; continue; }
        const start = i;
        let leftBound = 0;
        for (let j = start - 1; j >= 0; j--) { if (BOX[chars[j]]) { leftBound = j; break; } }
        while (i < chars.length && !BOX[chars[i]]) i++;
        if (isHBorderForCell(row, leftBound)) continue;
        const text = chars.slice(start, i).join('').trim();
        if (text) ctx.fillText(text, cellX(start) + (i - start) * cw / 2, cellCenterYForCell(row, leftBound));
      }
    });

    pre.replaceWith(canvas);
  });
}

function htmlEnunciado(q) {
  const bancaParts = [q.banca, q.orgao, q.cargo, q.ano].filter(Boolean);
  if (q.adaptada) bancaParts.push('adaptada');
  const banca = bancaParts.length ? `<div class="questao-banca">(${bancaParts.join(' / ')})</div>` : '';
  const linhas = q.enunciado.split('\n');
  let html = '';
  let diagBuf = [];

  const flushDiag = () => {
    if (diagBuf.length) {
      html += `<pre class="diagrama">${diagBuf.join('\n')}</pre>`;
      diagBuf = [];
    }
  };

  for (const linha of linhas) {
    if (DIAGRAMA_RE.test(linha)) {
      diagBuf.push(linha);
    } else {
      flushDiag();
      html += linha + '\n';
    }
  }
  flushDiag();

  return `${banca}<div class="questao-enunciado">${html.trimEnd()}</div>`;
}

function htmlQuestaoLista(q, i) {
  const d = Math.min(5, Math.max(0, q.dificuldade || 0));
  const dif = '★'.repeat(d) + '☆'.repeat(5 - d);

  const opcoes = q.tipo === 'multipla_escolha'
    ? `<div class="opcoes">${q.opcoes.map((o, idx) => {
        const letra = String.fromCharCode(65 + idx);
        return `<button class="opcao" data-letra="${letra}">${o}</button>`;
      }).join('')}</div>`
    : `<div class="opcoes">
        <button class="opcao btn-ce" data-resp="certo">A) Certo</button>
        <button class="opcao btn-ce" data-resp="errado">B) Errado</button>
       </div>`;

  return `
    <div class="questao-card" data-qid="${q.id}">
      <div class="questao-info">
        <div class="questao-info-linha">
          <span>Q${String(q._qNum ?? i + 1).padStart(2, '0')}${q.validado ? ' <span class="validada-check">✓</span>' : ''}</span>
          <span>${dif}</span>
          <button class="btn-marcar ${revisaoIds.has(q.id) ? 'marcado' : ''}" data-qid="${q.id}">${revisaoIds.has(q.id) ? 'Fixada' : 'Fixar'}</button>
        </div>
      </div>
      ${htmlEnunciado(q)}
      ${opcoes}
      <button class="btn-revelar" data-id="${q.id}">Ver Gabarito</button>
      <div class="gabarito-inline hidden" data-id="${q.id}">
        <strong>Resposta: ${String(q.resposta).toUpperCase()}</strong><br>${q.comentario}
      </div>
    </div>`;
}

// =====================================================================
// SIMULADO

function htmlQuestaoFoco(q, resp, isLast = false, num = null) {
  const d = Math.min(5, Math.max(0, q.dificuldade || 0));
  const dif = '★'.repeat(d) + '☆'.repeat(5 - d);

  let interacaoHtml;
  if (q.tipo === 'multipla_escolha') {
    interacaoHtml = `<div class="opcoes">${q.opcoes.map((o, i) => {
      const letra = String.fromCharCode(65 + i);
      let cls = 'opcao';
      if (resp) {
        if (letra === q.resposta) cls += ' correta';
        else if (letra === resp.dada) cls += ' errada';
      }
      return `<button class="${cls}" data-letra="${letra}" ${resp ? 'disabled' : ''}>${o}</button>`;
    }).join('')}</div>`;
  } else {
    const mkCE = (val, label) => {
      let cls = 'opcao btn-ce';
      if (resp) {
        if (q.resposta === val) cls += ' correta';
        else if (resp.dada === val) cls += ' errada';
      }
      return `<button class="${cls}" data-resp="${val}" ${resp ? 'disabled' : ''}>${label}</button>`;
    };
    interacaoHtml = `<div class="opcoes">${mkCE('certo', 'A) Certo')}${mkCE('errado', 'B) Errado')}</div>`;
  }

  const gabaritoHtml = resp ? `
    <div class="gabarito-inline ${resp.acertou ? 'acerto' : 'erro'}">
      Resposta: <strong>${String(q.resposta).toUpperCase()}</strong><br>${q.comentario}
    </div>
    <button class="btn-proxima">${isLast ? 'Ver Resultado' : 'Próxima →'}</button>` : '';

  return `
    <div class="questao-card">
      <div class="questao-info">
        ${num !== null ? `<span>Q${num}</span>` : ''}
        <span title="Dificuldade">${dif}</span>
        <span>${q.tipo === 'multipla_escolha' ? 'Múltipla escolha' : 'Certo/Errado'}</span>
        <button class="btn-marcar ${revisaoIds.has(q.id) ? 'marcado' : ''}" data-qid="${q.id}">${revisaoIds.has(q.id) ? 'Fixada' : 'Fixar'}</button>
      </div>
      ${htmlEnunciado(q)}
      ${interacaoHtml}
      ${gabaritoHtml}
    </div>`;
}
// =====================================================================
function renderSimuladoConfig() {
  if (simuladoState?.fase === 'quiz') { renderSimuladoQuiz(); return; }
  if (simuladoState?.fase === 'resultado') { renderSimuladoResultado(); return; }

  const conteudo = document.getElementById('conteudo');

  const materiasComQuestoes = MATERIAS.filter(m => !m.teoriaOnly);
  const opsFonte = [
    ...materiasComQuestoes.map(m => `<option value="materia:${m.id}">${m.nome}</option>`),
    ...materiasComQuestoes.flatMap(m => m.aulas.map(a =>
      `<option value="aula:${m.id}:${a.slug}">${m.nome} — ${a.titulo}</option>`
    ))
  ].join('');

  conteudo.innerHTML = `
    <div class="simulado-config">
      <h2>Novo Simulado</h2>
      <div class="config-grupo">
        <label>Fonte das questões</label>
        <select id="sim-fonte">${opsFonte}</select>
      </div>
      <div class="config-grupo">
        <label>Quantidade</label>
        <select id="sim-qtd">
          <option value="10">10 questões</option>
          <option value="20">20 questões</option>
          <option value="30">30 questões</option>
        </select>
      </div>
      <button class="btn-iniciar" id="btn-iniciar-sim">Iniciar Simulado</button>
    </div>`;

  document.getElementById('btn-iniciar-sim').addEventListener('click', () =>
    iniciarSimulado(
      document.getElementById('sim-fonte').value,
      parseInt(document.getElementById('sim-qtd').value)
    )
  );
}

async function iniciarSimulado(fonte, qtd) {
  document.getElementById('conteudo').innerHTML = '<p class="msg-vazio">Preparando simulado...</p>';

  let pool = [];

  const carregarParaPool = async (m, a) => {
    const dados = await carregarAulaDados(m.id, a.slug);
    if (dados?.questoes) {
      pool.push(...dados.questoes.map(q => ({ ...q, _materia: m.nome, _materiaId: m.id, _aula: a.titulo, _slug: a.slug })));
    }
  };

  if (fonte.startsWith('materia:')) {
    const m = MATERIAS.find(x => x.id === fonte.split(':')[1]);
    if (m) for (const a of m.aulas) await carregarParaPool(m, a);
  } else if (fonte.startsWith('aula:')) {
    const [, mid, slug] = fonte.split(':');
    const m = MATERIAS.find(x => x.id === mid);
    const a = m?.aulas.find(x => x.slug === slug);
    if (m && a) await carregarParaPool(m, a);
  }

  if (!pool.length) {
    document.getElementById('conteudo').innerHTML =
      '<p class="msg-vazio">Nenhuma questão disponível para esta seleção.</p>';
    return;
  }

  const questoes = pool.sort(() => Math.random() - 0.5).slice(0, qtd);

  simuladoState = {
    fase: 'quiz',
    questoes,
    respostas: {},
    idx: 0,
    fonte,
    qtd,
    tempoInicio: Date.now(),
    tempoSegundos: 0,
    intervalo: setInterval(atualizarCronometro, 1000)
  };

  renderBarraMaterias();
  renderBarraAulas();
  renderSimuladoQuiz();
}

function renderSimuladoQuiz() {
  const conteudo = document.getElementById('conteudo');
  const s = simuladoState;
  const q = s.questoes[s.idx];
  const isLast = s.idx === s.questoes.length - 1;
  const resp = s.respostas[q.id];

  const total    = s.questoes.length;
  const acertos  = Object.values(s.respostas).filter(r => r.acertou).length;
  const erros    = Object.values(s.respostas).filter(r => !r.acertou).length;
  const fixadas  = s.questoes.filter(q => revisaoIds.has(q.id)).length;

  const stickyClass = s.fonte.startsWith('aula:') ? 'sim-barra-sticky com-aula' : 'sim-barra-sticky';
  conteudo.innerHTML = `
    <div class="questoes-barra ${stickyClass}">
      <div class="barra-placar">
        <span class="total">${String(total).padStart(3,'0')}</span>
        <span class="acerto">${String(acertos).padStart(3,'0')}</span>
        <span class="erro">${String(erros).padStart(3,'0')}</span>
        <span class="fixadas">${String(fixadas).padStart(3,'0')}</span>
      </div>
      <span id="cronometro">00:00</span>
    </div>
    ${htmlQuestaoFoco(q, resp, isLast, s.idx + 1)}`;
  diagramasParaCanvas();

  atualizarCronometro();

  if (!resp) {
    const responder = (dada) => {
      const acertou = dada.toLowerCase() === String(q.resposta).toLowerCase();
      s.respostas[q.id] = { dada, acertou };
      registrarRespostaQuestao(q, acertou);
      if (!acertou && !revisaoIds.has(q.id)) toggleRevisao(q, s.idx + 1);
      renderSimuladoQuiz();
    };

    if (q.tipo === 'multipla_escolha') {
      conteudo.querySelectorAll('.opcao[data-letra]').forEach(btn =>
        btn.addEventListener('click', () => responder(btn.dataset.letra))
      );
    } else {
      conteudo.querySelectorAll('.btn-ce[data-resp]').forEach(btn =>
        btn.addEventListener('click', () => responder(btn.dataset.resp))
      );
    }
  } else {
    conteudo.querySelector('.btn-proxima')?.addEventListener('click', () => {
      if (isLast) {
        finalizarSimulado();
      } else {
        s.idx++;
        renderSimuladoQuiz();
      }
    });
  }

  conteudo.querySelector('.btn-marcar')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleRevisao(q, s.idx + 1);
    const marcado = revisaoIds.has(q.id);
    const chip = conteudo.querySelector('.barra-placar .fixadas');
    if (chip) chip.textContent = String(s.questoes.filter(x => revisaoIds.has(x.id)).length).padStart(3, '0');
    const btn = conteudo.querySelector('.btn-marcar');
    if (btn) { btn.classList.toggle('marcado', marcado); btn.textContent = marcado ? 'Fixada' : 'Fixar'; }
  });
}

function atualizarCronometro() {
  const el = document.getElementById('cronometro');
  if (!el || !simuladoState) return;
  const seg = Math.floor((Date.now() - simuladoState.tempoInicio) / 1000);
  el.textContent = formatarTempo(seg);
}

async function finalizarSimulado() {
  const s = simuladoState;
  clearInterval(s.intervalo);
  s.fase = 'resultado';
  s.tempoSegundos = Math.floor((Date.now() - s.tempoInicio) / 1000);
  s.acertos = Object.values(s.respostas).filter(r => r.acertou).length;

  try {
    await db.collection('usuarios').doc(usuario.uid).collection('historico').add({
      data: firebase.firestore.FieldValue.serverTimestamp(),
      fonte: s.fonte,
      placar: s.acertos,
      total: s.questoes.length,
      tempoSegundos: s.tempoSegundos,
      questoes: s.questoes.map(q => ({
        id: q.id,
        enunciado: q.enunciado,
        tipo: q.tipo,
        opcoes: q.opcoes || null,
        resposta: q.resposta,
        comentario: q.comentario,
        respondido: s.respostas[q.id]?.dada || null,
        acertou: s.respostas[q.id]?.acertou || false,
        _materia: q._materia || '',
        _aula: q._aula || ''
      }))
    });
  } catch (e) {
    console.error('Erro ao salvar simulado:', e);
  }

  renderSimuladoResultado();
}

function renderSimuladoResultado() {
  const conteudo = document.getElementById('conteudo');
  const s = simuladoState;
  const pct = Math.round((s.acertos / s.questoes.length) * 100);

  const gabHtml = s.questoes.map((q, i) => {
    const resp = s.respostas[q.id] || {};
    return `
      <div class="questao-card">
        <div class="questao-info">
          <span>Q${i + 1}</span>
          <span class="${resp.acertou ? 'ind-acerto' : 'ind-erro'}">${resp.acertou ? '✓' : '✗'}</span>
          ${q._aula ? `<span>${q._materia} — ${q._aula}</span>` : ''}
        </div>
        ${htmlEnunciado(q)}
        <div class="gabarito-inline ${resp.acertou ? 'acerto' : 'erro'}">
          Sua resposta: <strong>${String(resp.dada || '—').toUpperCase()}</strong> ·
          Correta: <strong>${String(q.resposta).toUpperCase()}</strong><br>${q.comentario}
        </div>
      </div>`;
  }).join('');

  conteudo.innerHTML = `
    <div class="resultado-placar">
      <div class="score">${s.acertos} / ${s.questoes.length}</div>
      <div class="pct">${pct}%</div>
      <div class="tempo">Tempo: ${formatarTempo(s.tempoSegundos)}</div>
    </div>
    <div class="resultado-acoes">
      <button class="btn-iniciar" id="btn-novo-sim">Novo Simulado</button>
    </div>
    <div class="resultado-gabarito">${gabHtml}</div>`;
  diagramasParaCanvas();

  document.getElementById('btn-novo-sim').addEventListener('click', () => {
    simuladoState = null;
    renderSimuladoConfig();
  });
}

// =====================================================================
// HISTÓRICO
// =====================================================================
function renderHistorico() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = `
    <div class="hist-tabs">
      <button class="hist-tab ativo" data-hist="simulados">Simulados</button>
      <button class="hist-tab" data-hist="questoes">Questões</button>
    </div>
    <div id="hist-conteudo"></div>`;

  const container = document.getElementById('hist-conteudo');

  conteudo.querySelectorAll('.hist-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      conteudo.querySelectorAll('.hist-tab').forEach(b => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      if (btn.dataset.hist === 'simulados') renderHistoricoSimulados(container);
      else renderHistoricoQuestoes(container);
    });
  });

  renderHistoricoSimulados(container);
}

async function renderHistoricoSimulados(container) {
  container.innerHTML = '<p class="msg-vazio">Carregando...</p>';

  try {
    const snap = await db.collection('usuarios').doc(usuario.uid)
      .collection('historico').orderBy('data', 'desc').get();

    if (snap.empty) {
      container.innerHTML = '<p class="msg-vazio">Nenhum simulado realizado ainda.</p>';
      return;
    }

    const simulados = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    container.innerHTML = `
      <button class="btn-limpar-simulados" id="btn-limpar">Limpar Simulados</button>
      <ul class="historico-lista">
        ${simulados.map(s => {
          const data = s.data?.toDate?.().toLocaleDateString('pt-BR') || '—';
          const pct = Math.round((s.placar / s.total) * 100);
          return `
            <li class="historico-item" data-id="${s.id}">
              <div>
                <div class="historico-titulo">${data} · ${s.total} questões</div>
                <div class="historico-info">${formatarTempo(s.tempoSegundos || 0)}</div>
              </div>
              <div class="historico-placar">${s.placar}/${s.total} (${pct}%)</div>
            </li>`;
        }).join('')}
      </ul>`;

    simulados.forEach(s => {
      container.querySelector(`.historico-item[data-id="${s.id}"]`)
        ?.addEventListener('click', () => renderDetalhesSimulado(s));
    });

    document.getElementById('btn-limpar').addEventListener('click', () => limparHistorico(simulados, container));

  } catch (e) {
    container.innerHTML = '<p class="msg-vazio">Erro ao carregar histórico.</p>';
    console.error(e);
  }
}

async function renderHistoricoQuestoes(container) {
  container.innerHTML = '<p class="msg-vazio">Carregando...</p>';

  try {
    const snap = await db.collection('usuarios').doc(usuario.uid)
      .collection('questoes').get();

    if (snap.empty) {
      container.innerHTML = '<p class="msg-vazio">Nenhuma questão respondida ainda.</p>';
      return;
    }

    const questoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const grupos = {};
    questoes.forEach(q => {
      const key = `${q._materiaId || ''}|${q._slug || ''}`;
      if (!grupos[key]) grupos[key] = {
        materia: q._materia || q._materiaId || '—',
        aula: q._aula || '—',
        materiaId: q._materiaId || '',
        slug: q._slug || '',
        questoes: []
      };
      grupos[key].questoes.push(q);
    });

    const sortedGrupos = Object.values(grupos).sort((a, b) =>
      a.materiaId.localeCompare(b.materiaId) || a.slug.localeCompare(b.slug)
    );
    sortedGrupos.forEach(g => g.questoes.sort((a, b) => (a._qNum ?? 999) - (b._qNum ?? 999)));

    const totalAcertos = questoes.reduce((s, q) => s + (q.acertos || 0), 0);
    const totalErros   = questoes.reduce((s, q) => s + (q.erros   || 0), 0);
    const totalResp    = totalAcertos + totalErros;
    const pct = totalResp > 0 ? Math.round((totalAcertos / totalResp) * 100) : 0;

    container.innerHTML = `
      <button class="btn-limpar-simulados" id="btn-limpar-q">Limpar Questões</button>
      <div class="questoes-hist-resumo">
        <span class="qh-chip azul">${String(questoes.length).padStart(3,'0')}</span>
        <span class="qh-chip verde">${String(totalAcertos).padStart(3,'0')}</span>
        <span class="qh-chip vermelho">${String(totalErros).padStart(3,'0')}</span>
        <span class="qh-chip cinza">${pct}%</span>
      </div>
      <div class="questoes-hist-lista">
        ${sortedGrupos.map(g => `
          <div class="qh-grupo">
            <div class="qh-grupo-header">${g.materia} — ${g.aula}</div>
            ${g.questoes.map(q => {
              const ac = q.acertos  || 0;
              const er = q.erros    || 0;
              const fi = q.fixacoes || 0;
              return `
                <div class="qh-item">
                  <span class="qh-num">Q${q._qNum != null ? q._qNum : '—'}</span>
                  <span class="qh-stat verde">✓ ${ac}</span>
                  <span class="qh-stat vermelho">✗ ${er}</span>
                  ${fi > 0 ? `<span class="qh-stat amarelo">★ ${fi}</span>` : ''}
                </div>`;
            }).join('')}
          </div>`
        ).join('')}
      </div>`;

    document.getElementById('btn-limpar-q').addEventListener('click', () =>
      limparHistoricoQuestoes(questoes, container)
    );

  } catch (e) {
    container.innerHTML = '<p class="msg-vazio">Erro ao carregar histórico de questões.</p>';
    console.error(e);
  }
}

function renderDetalhesSimulado(s) {
  const conteudo = document.getElementById('conteudo');
  const data = s.data?.toDate?.().toLocaleDateString('pt-BR') || '—';
  const pct = Math.round((s.placar / s.total) * 100);

  const gabHtml = (s.questoes || []).map((q, i) => `
    <div class="questao-card">
      <div class="questao-info">
        <span>Q${i + 1}</span>
        <span class="${q.acertou ? 'ind-acerto' : 'ind-erro'}">${q.acertou ? '✓' : '✗'}</span>
        ${q._aula ? `<span>${q._materia} — ${q._aula}</span>` : ''}
      </div>
      ${htmlEnunciado(q)}
      <div class="gabarito-inline ${q.acertou ? 'acerto' : 'erro'}">
        Respondido: <strong>${String(q.respondido || '—').toUpperCase()}</strong> ·
        Correto: <strong>${String(q.resposta).toUpperCase()}</strong><br>${q.comentario}
      </div>
    </div>`).join('');

  conteudo.innerHTML = `
    <button class="btn-voltar" id="btn-voltar-hist">← Histórico</button>
    <div class="resultado-placar">
      <div class="score">${s.placar} / ${s.total}</div>
      <div class="pct">${pct}%</div>
      <div class="tempo">${data} · ${formatarTempo(s.tempoSegundos || 0)}</div>
    </div>
    <div class="resultado-gabarito">${gabHtml}</div>`;

  document.getElementById('btn-voltar-hist').addEventListener('click', renderHistorico);
}

async function limparHistorico(simulados, container) {
  if (!confirm('Apagar todo o histórico de simulados?')) return;
  const batch = db.batch();
  simulados.forEach(s =>
    batch.delete(db.collection('usuarios').doc(usuario.uid).collection('historico').doc(s.id))
  );
  await batch.commit();
  renderHistoricoSimulados(container);
}

async function limparHistoricoQuestoes(questoes, container) {
  if (!confirm('Apagar todo o histórico de questões?')) return;
  const batch = db.batch();
  questoes.forEach(q =>
    batch.delete(db.collection('usuarios').doc(usuario.uid).collection('questoes').doc(q.id))
  );
  await batch.commit();
  renderHistoricoQuestoes(container);
}

// =====================================================================
// REVISÃO
// =====================================================================
function registrarRespostaQuestao(q, acertou, qNum) {
  if (!usuario) return;
  const ref = db.collection('usuarios').doc(usuario.uid).collection('questoes').doc(q.id);
  const inc = firebase.firestore.FieldValue.increment;
  const idNum = parseInt(String(q.id).split('-').pop());
  const numFinal = !isNaN(idNum) ? idNum : (qNum ?? null);
  ref.set({
    [acertou ? 'acertos' : 'erros']: inc(1),
    _materia:   q._materia   || materiaAtiva?.nome  || '',
    _materiaId: q._materiaId || materiaAtiva?.id    || '',
    _aula:      q._aula      || aulaAtiva?.titulo   || '',
    _slug:      q._slug      || aulaAtiva?.slug     || '',
    _qNum:      numFinal,
    ultimaResposta: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }).catch(e => console.error('Erro ao registrar resposta:', e));
}

async function carregarRevisao() {
  try {
    const snap = await db.collection('usuarios').doc(usuario.uid).collection('revisao').get();
    revisaoIds = new Set(snap.docs.map(d => d.id));
    revisaoQuestoes = snap.docs.map(d => d.data());
  } catch (e) { console.error('Erro ao carregar revisão:', e); }
}

function toggleRevisao(q, qNum) {
  const ref = db.collection('usuarios').doc(usuario.uid).collection('revisao').doc(q.id);
  if (revisaoIds.has(q.id)) {
    revisaoIds.delete(q.id);
    revisaoQuestoes = revisaoQuestoes.filter(x => x.id !== q.id);
    ref.delete().catch(e => console.error('Erro ao remover revisão:', e));
  } else {
    const qRich = {
      ...q,
      _materia:   q._materia   || materiaAtiva.nome,
      _materiaId: q._materiaId || materiaAtiva.id,
      _aula:      q._aula      || aulaAtiva?.titulo || '',
      _slug:      q._slug      || aulaAtiva?.slug   || '',
      _qNum:      q._qNum      ?? qNum,
    };
    revisaoIds.add(q.id);
    revisaoQuestoes.push(qRich);
    db.collection('usuarios').doc(usuario.uid).collection('questoes').doc(q.id)
      .set({
        fixacoes:   firebase.firestore.FieldValue.increment(1),
        _materia:   qRich._materia,
        _materiaId: qRich._materiaId,
        _aula:      qRich._aula,
        _slug:      qRich._slug,
        _qNum:      qRich._qNum || null,
      }, { merge: true })
      .catch(e => console.error('Erro ao registrar fixação:', e));
    ref.set({
      id: qRich.id, banca: qRich.banca || null, orgao: qRich.orgao || null, cargo: qRich.cargo || null,
      ano: qRich.ano || null, adaptada: qRich.adaptada || false,
      tipo: qRich.tipo, enunciado: qRich.enunciado,
      opcoes: qRich.opcoes || null, resposta: qRich.resposta, comentario: qRich.comentario,
      dificuldade: qRich.dificuldade || 1,
      _materia: qRich._materia, _materiaId: qRich._materiaId,
      _aula: qRich._aula, _slug: qRich._slug, _qNum: qRich._qNum || null,
      marcadoEm: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.error('Erro ao salvar revisão:', e));
  }
}

async function renderRevisao() {
  const conteudo = document.getElementById('conteudo');

  // Garante que todas as aulas referenciadas pelas fixadas estejam no cache
  const slugsUnicos = [...new Set(
    revisaoQuestoes.map(q => q._materiaId && q._slug ? `${q._materiaId}/${q._slug}` : null).filter(Boolean)
  )];
  await Promise.all(slugsUnicos.map(k => {
    const [mid, slug] = k.split('/');
    return carregarAulaDados(mid, slug);
  }));

  // Monta lookup id → questão atual do JSON
  const lookup = {};
  for (const k of slugsUnicos) {
    aulaCache[k]?.questoes?.forEach(q => { lookup[q.id] = q; });
  }

  // Enriquece com dados frescos, preservando metadados do Firestore
  const questoes = (salvosFiltroSlug
    ? revisaoQuestoes.filter(q => q._slug === salvosFiltroSlug && q._materiaId === materiaAtiva.id)
    : revisaoQuestoes
  ).map(q => {
    const fresh = lookup[q.id];
    if (!fresh) return q;
    return { ...fresh, _materia: q._materia, _materiaId: q._materiaId, _aula: q._aula, _slug: q._slug, _qNum: q._qNum, marcadoEm: q.marcadoEm };
  }).slice().sort((a, b) =>
    (a._materiaId || '').localeCompare(b._materiaId || '') ||
    (a._slug || '').localeCompare(b._slug || '') ||
    (a._qNum || 0) - (b._qNum || 0)
  );

  if (!questoes.length) {
    conteudo.innerHTML = `<p class="msg-vazio">${salvosFiltroSlug ? 'Nenhuma questão salva nesta aula.' : 'Nenhuma questão salva ainda.'}</p>`;
    return;
  }
  listaRespostas = {};
  conteudo.innerHTML = `<div id="questoes-area"></div>`;
  renderListaQuestoes(questoes);
}

// =====================================================================
// UTILITÁRIOS
// =====================================================================
function formatarTempo(seg) {
  const mm = String(Math.floor(seg / 60)).padStart(2, '0');
  const ss = String(seg % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// =====================================================================
// EVENT LISTENERS (globais, fixos no DOM)
// =====================================================================
document.getElementById('btn-login').addEventListener('click', () => {
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(console.error);
});

document.getElementById('btn-logout').addEventListener('click', () => {
  auth.signOut();
});

document.querySelectorAll('.aba-global').forEach(btn => {
  btn.addEventListener('click', () => {
    const newTab = btn.dataset.tab === 'inicio' ? null : btn.dataset.tab;
    if (simuladoState?.intervalo) clearInterval(simuladoState.intervalo);
    simuladoState = null;
    if (newTab === null) {
      materiaAtiva = MATERIAS[0];
      aulaAtiva = materiaAtiva.aulas[0];
      salvosFiltroSlug = null;
    } else if (newTab === 'revisao') {
      materiaAtiva = MATERIAS[0];
      salvosFiltroSlug = materiaAtiva.aulas[0].slug;
    } else {
      salvosFiltroSlug = null;
      materialAtivo = null;
    }
    tabGlobal = newTab;
    document.querySelectorAll('.aba-global').forEach(b => b.classList.remove('ativa'));
    btn.classList.add('ativa');
    renderConteudo();
  });
});

