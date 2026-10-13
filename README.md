# Space Syntax Engine

Motor de análise configuracional de **espaços convexos** (sintaxe espacial, Hillier &amp; Hanson) com interface local, 100% no navegador — sem servidor e sem dependências em tempo de execução.

## Interface (celular, tablet e desktop)
- **Celular:** barra inferior (Desenhar · J-graph · Resultados · Comparar · Modelo); dois dedos para zoom e mover; toque num espaço abre o painel de detalhes; toque longo ativa a seleção múltipla.
- **Desktop:** abas no topo e painel lateral; roda do mouse = zoom; Alt+arrastar = mover a vista; atalhos N, L, R, Del, Esc, Ctrl+Z/Y.
- **Polígonos convexos:** toque os vértices e toque no 1º ponto (ou "Fechar"); polígonos não convexos geram aviso.
- **Nada destrutivo com um toque:** apagar pede confirmação e o aviso oferece "Desfazer".
- **Glossário:** o ícone ⓘ e os cartões de resultados explicam cada medida (definição, fórmula, leitura, referência).
- **Modo projetor** (ícone de monitor) e **PT/EN** no topo.

## Estrutura
```
index.html            estrutura da interface
src/styles.css        estilos (responsivo, projetor, alvos de toque ≥ 44 px)
src/main.js           lógica da interface (gestos, painel, vistas)
src/i18n.js           textos PT/EN
src/glossary.js       glossário das medidas PT/EN
src/engine/           motor de análise (TypeScript puro, sem DOM)
  model.ts            esquema de dados v2, validação e migração do v1
  graph.ts            grafo CSR, BFS, Brandes (choice), blocos biconexos
  analyse.ts          medidas por espaço e do sistema
src/util/html.ts      escape de texto do usuário
tests/                testes (Vitest): modelo validado de 10 nós + grafos canônicos
```

## Convenções (padrão = depthmapX 0.9.1)
- **Entropia:** `p_d = n_d/k` incluindo o próprio espaço em d=0 (`axialintegration.cpp`). Opção: convenção v1 `n_d/(k−1)`.
- **Fator de diferença H\*:** tripla (máx, média, mín) de **RA** (Hillier, Hanson & Graham 1987). Opção: sobre integração (v1).
- **RA/RRA/Integração** indefinidos quando MD ≤ 1 (espaço ligado a todos), como no depthmapX.
- **H\* e inteligibilidade** usam sempre valores **globais**, mesmo com raio.
- **Tipo d:** ≥3 ligações e em ≥2 anéis (Hillier 1996, cap. 8).

Ao reportar valores, declare: k, L, presença do portador, raio e convenções.

## Recursos
- Mapa de conexões editável (nós = espaços, arestas = portas) e **grafo justificado** a partir de uma raiz escolhida.
- Medidas por ambiente: **integração (HH), RA, RRA, profundidade total/média, controle, controllability, choice (Brandes), entropia**, tipologia a/b/c/d.
- Medidas globais: anéis, ringiness, fator de diferença H*, inteligibilidade (R²), diâmetro.
- **Raio-n** (integração/choice/entropia locais), **profundidade a partir do nó selecionado**.
- Edição: adicionar/arrastar nós, ligar arrastando, polígonos convexos com adjacência por lado compartilhado, snap à grade, guias, seleção múltipla, atalhos, desfazer/refazer, autosave.
- **Máscara de planta** como fundo (opacidade/rotação/escala/offset) para retraçar.
- Exportação: CSV, PNG dos grafos, cópia de tabela, relatório para impressão/PDF, import/export de modelo em JSON.
- Validação (nós órfãos, componentes desconexos) e **comparação de dois modelos**.

## Rodar localmente
Requer Node 20+.
```bash
npm install
npm run dev        # servidor local com recarga automática
npm test           # testes do motor
npm run build      # gera dist/ (o que vai para o GitHub Pages)
```
> Desde a v0.2 o `index.html` da raiz **não abre mais com duplo clique** (usa módulos ES). Use `npm run dev`, ou abra `dist/index.html` depois do build com `npx vite preview`.

## Publicar no GitHub Pages

O workflow `.github/workflows/deploy.yml` instala, verifica tipos, roda os testes, faz o build e publica `dist/` a cada push na `main`. Se algum teste falhar, nada é publicado.
1. Crie o repositório e envie o código (`git remote add origin …` e `git push -u origin main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Observações
- O arquivo `.nojekyll` evita que o GitHub Pages ignore arquivos pelo processador Jekyll.
- O estado (modelo + configurações) é salvo no `localStorage` do navegador; modelos salvos pela v1 são migrados automaticamente para o esquema v2. A imagem de fundo persiste se couber no limite local.
- Tudo é client-side: nenhum dado sai do navegador.

## Licença
MIT — veja `LICENSE`.
