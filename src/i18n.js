/** Textos da interface em português e inglês. `t(chave, {var})` interpola {var}. */
const DICT = {
  pt: {
    'brand.sub': 'Configuração convexa · Hillier & Hanson',
    'tab.graph': 'Configuração', 'tab.jgraph': 'Grafo justificado', 'tab.results': 'Resultados', 'tab.compare': 'Comparar',
    'nav.graph': 'Desenhar', 'nav.jgraph': 'J-graph', 'nav.results': 'Resultados', 'nav.compare': 'Comparar', 'nav.model': 'Modelo',
    'undo': 'Desfazer (Ctrl+Z)', 'redo': 'Refazer (Ctrl+Y)', 'projector': 'Modo projetor', 'lang.switch': 'Switch to English',
    'grp.root': 'Raiz (portador / entrada)',
    'hint.root': 'Ou use ⦿ ao lado de um espaço. Para analisar só o interior, apague o nó exterior.',
    'grp.spaces': 'Espaços', 'ph.newName': 'Nome do novo espaço…', 'btn.add': 'Adicionar',
    'hint.spaces': 'Toque num espaço para ver e editar. ⦿ define a raiz.',
    'grp.links': 'Ligações', 'btn.link': 'Ligar',
    'grp.view': 'Exibição', 'opt.snap': 'Alinhar à grade (20)', 'opt.values': 'Mostrar valores nos nós',
    'opt.radius': 'Raio (0 = global)', 'hint.radius': 'O raio limita integração, choice e entropia a n passos (medidas locais).',
    'grp.conv': 'Convenções', 'conv.entropy': 'Entropia', 'conv.entropy.dm': 'depthmapX (n_d/k, inclui o próprio)',
    'conv.entropy.v1': 'Engine v1 (n_d/(k−1))', 'conv.h': 'Tripla do H*', 'conv.h.ra': 'RA (original)', 'conv.h.int': 'Integração (engine v1)',
    'hint.conv': 'Padrões: depthmapX 0.9.1 e Hillier, Hanson & Graham (1987). Declare a convenção ao reportar valores.',
    'grp.bg': 'Planta de fundo', 'bg.opacity': 'Opacidade', 'bg.rotate': 'Girar', 'bg.scale': 'Escala', 'bg.dx': 'Mover X', 'bg.dy': 'Mover Y',
    'bg.remove': 'Remover imagem', 'hint.bg': 'Uma imagem para traçar por cima. Crie espaços sobre os cômodos e ligue-os.',
    'grp.convex': 'Polígonos convexos', 'btn.derive': 'Derivar ligações dos polígonos',
    'hint.convex': 'No modo Convexo, toque os vértices e toque no 1º ponto (ou em "Fechar"). Lados compartilhados viram ligações aqui.',
    'grp.export': 'Exportar', 'ex.csv': 'CSV', 'ex.png': 'PNG do mapa', 'ex.pngj': 'PNG do j-graph', 'ex.copy': 'Copiar tabela', 'ex.print': 'Imprimir relatório',
    'grp.io': 'Arquivo do modelo (JSON)', 'io.export': 'Exportar JSON', 'io.load': 'Carregar da caixa',
    'ph.io': 'Cole o JSON do modelo e toque em Carregar…', 'io.reset': 'Restaurar modelo validado', 'io.storeB': 'Guardar como B',
    'colourBy': 'Colorir por', 'aboutMeasure': 'Sobre esta medida',
    'mode.select': 'Selecionar', 'mode.add': 'Espaço', 'mode.link': 'Ligar', 'mode.poly': 'Convexo',
    'zoom.in': 'Aproximar', 'zoom.out': 'Afastar', 'zoom.fit': 'Enquadrar tudo',
    'help.graph': 'Arraste espaços para mover · Shift+clique ou caixa para seleção múltipla · roda do mouse = zoom · Alt+arrastar = mover a vista · duplo clique cria espaço. Atalhos: N novo · L liga par · R raiz · Del apaga · Esc cancela. No celular: dois dedos para zoom e mover; toque longo para seleção múltipla.',
    'help.jgraph': 'Organizado por profundidade a partir da raiz (profundidade 0 na base). Cor = profundidade; ligações fora da árvore (anéis) tracejadas. Toque num espaço para ver os valores.',
    'ctx.add': 'Toque no mapa para criar um espaço', 'ctx.link1': 'Toque no primeiro espaço', 'ctx.link2': 'Toque no espaço a ligar com {id}',
    'ctx.poly': 'Toque os vértices · toque no 1º ponto para fechar', 'ctx.sel': '{n} selecionado(s)', 'ctx.multi': 'Toque para incluir/retirar',
    'btn.cancel': 'Cancelar', 'btn.close': 'Fechar', 'btn.undoPt': 'Desfazer ponto', 'btn.done': 'Concluir', 'btn.delete': 'Apagar',
    'name': 'Nome', 'close': 'Fechar', 'type': 'Tipo',
    'type.a': 'fim de linha', 'type.b': 'passagem fora de anéis', 'type.c': 'em um anel', 'type.d': 'junção de anéis',
    'root.badge': 'raiz', 'act.root': 'Definir raiz', 'act.linkTo': 'Ligar a…', 'act.delete': 'Apagar espaço', 'confirm': 'Confirmar?',
    'edge.title': 'Ligação', 'sheet.more': 'Todas as medidas ▾', 'sheet.less': 'Menos medidas ▴', 'act.removeLink': 'Remover ligação',
    'toast.deleted': '{n} espaço(s) apagado(s)', 'toast.linkRemoved': 'Ligação removida', 'toast.undo': 'Desfazer',
    'toast.nonconvex': 'Atenção: o polígono não é convexo. Divida-o em espaços convexos.',
    'toast.derived': '{n} ligação(ões) criada(s) a partir de lados compartilhados.', 'toast.noDerived': 'Nenhum lado compartilhado novo encontrado.',
    'toast.needPolys': 'São necessários pelo menos dois polígonos.', 'toast.copied': 'Tabela copiada.', 'toast.linkExists': 'Esses espaços já estão ligados.',
    'toast.storedB': 'Modelo atual guardado como B.',
    'warn.components': '⚠ O grafo tem {n} partes desconexas; as medidas de profundidade são por componente.',
    'val.title': 'Validação', 'val.orphan': 'Sem ligações: {ids}', 'val.comp': '{n} componentes desconexos.',
    'val.unreach': 'Inalcançáveis a partir da raiz: {ids}', 'val.issues': '⚠ {n} problema(s)', 'val.ok': '✓ Sem problemas estruturais — conexo, sem órfãos.',
    'card.k': 'Espaços (k)', 'card.L': 'Ligações (L)', 'card.rings': 'Anéis', 'card.ringiness': 'Aneldade r', 'card.meanConn': 'Conect. média',
    'card.meanMD': 'Prof. média', 'card.meanInt': 'Integ. média', 'card.meanRRA': 'RRA médio', 'card.diameter': 'Diâmetro',
    'card.Hs': 'H* ({basis})', 'card.int': 'Intelig. R² (global)', 'card.types': 'Tipos a/b/c/d', 'card.radius': 'Raio', 'global': 'global', 'basis.ra': 'RA', 'basis.integ': 'integ.',
    'col.id': 'Espaço', 'col.type': 'Tipo', 'col.conn': 'Conn', 'col.ctrl': 'Controle', 'col.controllability': 'Ctrlab', 'col.choice': 'Choice',
    'col.depth': 'Prof.', 'col.td': 'Prof.T', 'col.md': 'Prof.M', 'col.ra': 'RA', 'col.rra': 'RRA', 'col.integ': 'Integ.', 'col.ent': 'Entropia',
    'sortBy': 'Ordenar por',
    'method.base': '<b>Método.</b> Profundidades por busca em largura; <code>MD=ΣD/(k−1)</code>, <code>RA=2(MD−1)/(k−2)</code> (indefinido se MD≤1, como no depthmapX), <code>RRA=RA/D_k</code>, <code>Integração [HH]=1/RRA</code>. Controle <code>=Σ1/conn(vizinho)</code>; Controlabilidade <code>=conn/(espaços a até 2 passos)</code>; Choice = betweenness de Brandes (pares não ordenados). ',
    'method.ent.dm': 'Entropia <code>=−Σ p_d log₂ p_d</code>, <code>p_d=n_d/k</code> incluindo o próprio espaço (depthmapX). ',
    'method.ent.v1': 'Entropia <code>=−Σ p_d log₂ p_d</code>, <code>p_d=n_d/(k−1)</code> sem o próprio espaço (engine v1). ',
    'method.h.ra': 'H* sobre a tripla (máx, média, mín) de RA (Hillier, Hanson &amp; Graham 1987)', 'method.h.int': 'H* sobre a tripla (máx, média, mín) de integração (engine v1)',
    'method.tail': '; H* e inteligibilidade usam sempre valores globais. O raio limita integração, choice e entropia a n passos. Tipo d = ≥3 ligações em ≥2 anéis.',
    'cmp.none': 'Nenhuma referência guardada. Em Modelo → Arquivo do modelo, toque em "Guardar como B", altere o modelo e volte aqui.',
    'cmp.intro': 'Guarde uma referência com "Guardar como B", altere o modelo e compare. Espaços com o mesmo id são comparados.',
    'cmp.meanA': 'Integ. média A', 'cmp.meanB': 'Integ. média B', 'cmp.rings': 'Anéis A / B', 'cmp.addrem': 'Adicionados / Removidos',
    'cmp.added': 'Só em A: {a} · Só em B: {b}', 'cmp.integA': 'Integ. A', 'cmp.integB': 'Integ. B', 'cmp.dInteg': 'Δ Integ.',
    'cmp.choiceA': 'Choice A', 'cmp.choiceB': 'Choice B', 'cmp.dChoice': 'Δ Choice',
    'legend.seg': 'segregado', 'legend.int': 'integrado',
    'm.integ': 'Integração (HH)', 'm.choice': 'Choice', 'm.ctrl': 'Controle', 'm.controllability': 'Controlabilidade', 'm.conn': 'Conectividade',
    'm.focus': 'Profundidade a partir do selecionado', 'm.depth': 'Profundidade a partir da raiz', 'm.md': 'Profundidade média',
    'm.rra': 'RRA', 'm.ra': 'RA', 'm.td': 'Profundidade total', 'm.ent': 'Entropia (bits)',
    'newSpace': 'Espaço {n}',
    'io.note': '{what} está na caixa acima e foi copiado. Se o navegador bloquear o download, copie de lá.',
    'ovl.hint': 'Toque e segure (ou clique com o botão direito) na imagem → "Salvar imagem".', 'ovl.download': 'Baixar', 'ovl.close': 'Fechar',
    'png.fail': 'Falha ao exportar PNG neste navegador; use uma captura de tela.',
    'err.json': 'JSON inválido.', 'err.expect': 'Esperado: {schema, nodes:[{id,name,x,y}], edges:[[a,b]], root}.',
    'info.how': 'Como ler', 'info.formula': 'Fórmula', 'info.ref': 'Referência', 'info.conv': 'Convenção atual: {c}',
  },
  en: {
    'brand.sub': 'Convex configuration · Hillier & Hanson',
    'tab.graph': 'Configuration', 'tab.jgraph': 'Justified graph', 'tab.results': 'Results', 'tab.compare': 'Compare',
    'nav.graph': 'Draw', 'nav.jgraph': 'J-graph', 'nav.results': 'Results', 'nav.compare': 'Compare', 'nav.model': 'Model',
    'undo': 'Undo (Ctrl+Z)', 'redo': 'Redo (Ctrl+Y)', 'projector': 'Projector mode', 'lang.switch': 'Mudar para português',
    'grp.root': 'Root (carrier / entrance)',
    'hint.root': 'Or tick ⦿ beside a space. To analyse the interior only, delete the exterior node.',
    'grp.spaces': 'Spaces', 'ph.newName': 'New space name…', 'btn.add': 'Add',
    'hint.spaces': 'Tap a space to view and edit it. ⦿ sets the root.',
    'grp.links': 'Connections', 'btn.link': 'Link',
    'grp.view': 'View options', 'opt.snap': 'Snap to grid (20)', 'opt.values': 'Show values on nodes',
    'opt.radius': 'Radius (0 = global)', 'hint.radius': 'Radius limits integration, choice and entropy to n steps (local measures).',
    'grp.conv': 'Conventions', 'conv.entropy': 'Entropy', 'conv.entropy.dm': 'depthmapX (n_d/k, incl. self)',
    'conv.entropy.v1': 'Engine v1 (n_d/(k−1))', 'conv.h': 'H* triple', 'conv.h.ra': 'RA (original)', 'conv.h.int': 'Integration (engine v1)',
    'hint.conv': 'Defaults follow depthmapX 0.9.1 and Hillier, Hanson & Graham (1987). Declare the convention when reporting values.',
    'grp.bg': 'Background plan', 'bg.opacity': 'Opacity', 'bg.rotate': 'Rotate', 'bg.scale': 'Scale', 'bg.dx': 'Shift X', 'bg.dy': 'Shift Y',
    'bg.remove': 'Remove image', 'hint.bg': 'An image to trace over. Place spaces on the rooms and link them.',
    'grp.convex': 'Convex polygons', 'btn.derive': 'Derive links from polygons',
    'hint.convex': 'In Convex mode, tap the vertices and tap the first point (or "Close"). Shared edges become links here.',
    'grp.export': 'Export', 'ex.csv': 'CSV', 'ex.png': 'Map PNG', 'ex.pngj': 'J-graph PNG', 'ex.copy': 'Copy table', 'ex.print': 'Print report',
    'grp.io': 'Model file (JSON)', 'io.export': 'Export JSON', 'io.load': 'Load from box',
    'ph.io': 'Paste model JSON and tap Load…', 'io.reset': 'Reset to validated model', 'io.storeB': 'Store as B',
    'colourBy': 'Colour by', 'aboutMeasure': 'About this measure',
    'mode.select': 'Select', 'mode.add': 'Space', 'mode.link': 'Link', 'mode.poly': 'Convex',
    'zoom.in': 'Zoom in', 'zoom.out': 'Zoom out', 'zoom.fit': 'Fit all',
    'help.graph': 'Drag spaces to move · Shift-click or box for multi-select · mouse wheel = zoom · Alt+drag = pan · double-click adds a space. Shortcuts: N new · L link pair · R root · Del delete · Esc cancel. On phones: two fingers to zoom and pan; long-press for multi-select.',
    'help.jgraph': 'Banded by depth from root (depth 0 at base). Colour = depth; non-tree links (rings) dashed. Tap a space to see its values.',
    'ctx.add': 'Tap the map to create a space', 'ctx.link1': 'Tap the first space', 'ctx.link2': 'Tap the space to link with {id}',
    'ctx.poly': 'Tap vertices · tap the first point to close', 'ctx.sel': '{n} selected', 'ctx.multi': 'Tap to add/remove',
    'btn.cancel': 'Cancel', 'btn.close': 'Close', 'btn.undoPt': 'Undo point', 'btn.done': 'Done', 'btn.delete': 'Delete',
    'name': 'Name', 'close': 'Close', 'type': 'Type',
    'type.a': 'dead end', 'type.b': 'passage, not on a ring', 'type.c': 'on one ring', 'type.d': 'junction of rings',
    'root.badge': 'root', 'act.root': 'Set as root', 'act.linkTo': 'Link to…', 'act.delete': 'Delete space', 'confirm': 'Confirm?',
    'edge.title': 'Link', 'sheet.more': 'All measures ▾', 'sheet.less': 'Fewer measures ▴', 'act.removeLink': 'Remove link',
    'toast.deleted': '{n} space(s) deleted', 'toast.linkRemoved': 'Link removed', 'toast.undo': 'Undo',
    'toast.nonconvex': 'Warning: the polygon is not convex. Split it into convex spaces.',
    'toast.derived': 'Added {n} link(s) from shared polygon edges.', 'toast.noDerived': 'No new shared edges found.',
    'toast.needPolys': 'At least two polygons are needed.', 'toast.copied': 'Table copied.', 'toast.linkExists': 'These spaces are already linked.',
    'toast.storedB': 'Current model stored as B.',
    'warn.components': '⚠ The graph has {n} disconnected parts; depth measures are per component.',
    'val.title': 'Validation', 'val.orphan': 'Orphan (no links): {ids}', 'val.comp': '{n} disconnected components.',
    'val.unreach': 'Unreachable from root: {ids}', 'val.issues': '⚠ {n} issue(s)', 'val.ok': '✓ No structural issues — connected, no orphans.',
    'card.k': 'Spaces (k)', 'card.L': 'Links (L)', 'card.rings': 'Rings', 'card.ringiness': 'Ringiness r', 'card.meanConn': 'Mean conn.',
    'card.meanMD': 'Mean depth', 'card.meanInt': 'Mean integ.', 'card.meanRRA': 'Mean RRA', 'card.diameter': 'Diameter',
    'card.Hs': 'H* ({basis})', 'card.int': 'Intellig. R² (global)', 'card.types': 'Types a/b/c/d', 'card.radius': 'Radius', 'global': 'global', 'basis.ra': 'RA', 'basis.integ': 'integ.',
    'col.id': 'Space', 'col.type': 'Type', 'col.conn': 'Conn', 'col.ctrl': 'Control', 'col.controllability': 'Ctrlab', 'col.choice': 'Choice',
    'col.depth': 'Depth', 'col.td': 'Tot.D', 'col.md': 'MeanD', 'col.ra': 'RA', 'col.rra': 'RRA', 'col.integ': 'Integ.', 'col.ent': 'Entropy',
    'sortBy': 'Sort by',
    'method.base': '<b>Method.</b> BFS depths; <code>MD=ΣD/(k−1)</code>, <code>RA=2(MD−1)/(k−2)</code> (undefined when MD≤1, as in depthmapX), <code>RRA=RA/D_k</code>, <code>Integration [HH]=1/RRA</code>. Control <code>=Σ1/conn(neighbour)</code>; Controllability <code>=conn/(spaces within 2 steps)</code>; Choice = Brandes betweenness (unordered pairs). ',
    'method.ent.dm': 'Entropy <code>=−Σ p_d log₂ p_d</code>, <code>p_d=n_d/k</code> including the space itself (depthmapX). ',
    'method.ent.v1': 'Entropy <code>=−Σ p_d log₂ p_d</code>, <code>p_d=n_d/(k−1)</code> excluding the space itself (engine v1). ',
    'method.h.ra': 'H* on the (max, mean, min) triple of RA (Hillier, Hanson &amp; Graham 1987)', 'method.h.int': 'H* on the (max, mean, min) triple of integration (engine v1)',
    'method.tail': '; H* and intelligibility always use global values. Radius limits integration, choice and entropy to n steps. Type d = ≥3 links on ≥2 rings.',
    'cmp.none': 'No baseline stored yet. In Model → Model file, tap "Store as B", change the model and come back.',
    'cmp.intro': 'Store a baseline with "Store as B", change the model, then compare. Matching space ids are diffed.',
    'cmp.meanA': 'Mean integ. A', 'cmp.meanB': 'Mean integ. B', 'cmp.rings': 'Rings A / B', 'cmp.addrem': 'Added / Removed',
    'cmp.added': 'Only in A: {a} · Only in B: {b}', 'cmp.integA': 'Integ. A', 'cmp.integB': 'Integ. B', 'cmp.dInteg': 'Δ Integ.',
    'cmp.choiceA': 'Choice A', 'cmp.choiceB': 'Choice B', 'cmp.dChoice': 'Δ Choice',
    'legend.seg': 'segregated', 'legend.int': 'integrated',
    'm.integ': 'Integration (HH)', 'm.choice': 'Choice', 'm.ctrl': 'Control value', 'm.controllability': 'Controllability', 'm.conn': 'Connectivity',
    'm.focus': 'Depth from selected', 'm.depth': 'Depth from root', 'm.md': 'Mean depth',
    'm.rra': 'RRA', 'm.ra': 'RA', 'm.td': 'Total depth', 'm.ent': 'Entropy (bits)',
    'newSpace': 'Space {n}',
    'io.note': '{what} is in the box above and was copied. If your browser blocks the download, copy it from there.',
    'ovl.hint': 'Long-press (or right-click) the image → "Save image".', 'ovl.download': 'Download', 'ovl.close': 'Close',
    'png.fail': 'PNG export failed in this browser; use a screenshot instead.',
    'err.json': 'Invalid JSON.', 'err.expect': 'Expecting {schema, nodes:[{id,name,x,y}], edges:[[a,b]], root}.',
    'info.how': 'How to read', 'info.formula': 'Formula', 'info.ref': 'Reference', 'info.conv': 'Current convention: {c}',
  },
};

function initialLang() {
  try {
    const s = localStorage.getItem('ssx_lang');
    if (s === 'pt' || s === 'en') return s;
  } catch (_) { /* armazenamento indisponível */ }
  return (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

let lang = initialLang();

export const getLang = () => lang;

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'pt';
  try { localStorage.setItem('ssx_lang', lang); } catch (_) { /* ignore */ }
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
}

export function t(key, vars) {
  let s = DICT[lang][key] ?? DICT.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

/** Aplica traduções a elementos com data-i18n (texto), data-i18n-ph (placeholder) e data-i18n-aria (aria-label + title). */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const s = t(el.dataset.i18nAria);
    el.setAttribute('aria-label', s);
    el.title = s;
  });
}
