# Space Syntax Engine

Motor de análise configuracional de **espaços convexos** (sintaxe espacial, Hillier &amp; Hanson) com interface local, 100% no navegador — sem servidor, sem build, sem dependências externas.

Tudo roda num único arquivo: **`index.html`**.

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
Basta abrir `index.html` no navegador (duplo clique). Não precisa de servidor.
Opcional, servir localmente:
```bash
python3 -m http.server 8080
# depois acesse http://localhost:8080
```

## Publicar no GitHub Pages

### Método A — pela interface do GitHub (sem linha de comando)
1. Crie um repositório novo (ex.: `space-syntax-engine`).
2. **Add file → Upload files** e envie `index.html` (e opcionalmente `.nojekyll`, `README.md`, `LICENSE`).
3. **Commit changes**.
4. **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
5. Branch: `main` / pasta `/ (root)` → **Save**.
6. Aguarde ~1 min; a URL aparece em Settings → Pages (ex.: `https://SEU-USUARIO.github.io/space-syntax-engine/`).

### Método B — por linha de comando (git)
```bash
git init
git add index.html .nojekyll README.md LICENSE
git commit -m "Space Syntax Engine"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/space-syntax-engine.git
git push -u origin main
```
Depois ative o Pages como no Método A (ou use o workflow em `.github/workflows/deploy.yml`, já incluído, que publica automaticamente a cada push na `main`).

## Observações
- O arquivo `.nojekyll` evita que o GitHub Pages ignore arquivos pelo processador Jekyll.
- O estado (modelo + configurações) é salvo no `localStorage` do navegador; a imagem de fundo persiste se couber no limite local.
- Tudo é client-side: nenhum dado sai do navegador.

## Licença
MIT — veja `LICENSE`.
