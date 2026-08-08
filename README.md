# ORRERY

**→ https://cazemoises.github.io/animejs-tryout/**

Vitrine de animação com [anime.js v4](https://animejs.com) e Three.js. Página
de rolagem única: um instrumento 3D se monta em estágios conforme você rola, e
cada seção demonstra uma técnica diferente da lib.

```bash
npm install
npm run dev
```

O dev server sobe em `http://localhost:5173/animejs-tryout/` — o `base` do Vite
é o mesmo em dev e em produção, de propósito, para que um path que só quebra
sob sub-path não passe despercebido em desenvolvimento.

## Deploy

Automático: qualquer push em `main` dispara
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), que roda os
testes, faz o build e publica via `upload-pages-artifact` + `deploy-pages`.
Nenhum artefato de build entra no histórico.

Em **Settings → Pages**, a origem precisa estar em **GitHub Actions**.

| script | o que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção |
| `npm run typecheck` | só o `tsc --noEmit` |
| `npm run test` | testes da matemática de enquadramento |

## Qual arquivo implementa qual técnica

| # | Técnica | Arquivo | O que olhar |
| --- | --- | --- | --- |
| 0 | Tipografia em cascata | `src/sections/00-hero.ts` | `splitText` + `stagger(38, { from: 'center' })`, com `rotateX: [-96, 0]` |
| 1 | Stagger avançado | `src/sections/01-stagger.ts` | `stagger` distribuindo **valores** (não só delays) por distância do cursor: `scale: stagger([1.62, 1], { grid, from: cursorIndex })` |
| 2 | Física de mola | `src/sections/02-spring.ts` | `createDraggable` + `releaseEase: spring({ stiffness, damping })`; a curva ao lado é amostrada da mesma instância |
| 3 | SVG: draw + morph | `src/sections/03-svg.ts` | `svg.createDrawable` → `draw: ['0 0', '0 1']`, depois `svg.morphTo` (heptágono → estrela de 14 pontos) |
| 4 | `onScroll()` sincronizado | `src/master.ts` + `src/sections/04-scrollsync.ts` | A timeline mestra vive em `master.ts`; a seção só a **expõe**, com rótulos ligados às peças 3D e um playhead |
| 5 | Timeline coreografada | `src/sections/05-timeline.ts` | `createTimeline` com labels e offsets relativos (`'<-=200'`, `'+=120'`), um easing por beat |
| 6 | `random()` + stagger em massa | `src/sections/06-burst.ts` + `src/three/burst.ts` | Valores por alvo via função (`x: () => utils.random(...)`), partículas 3D e resposta de luz na mesma timeline |

## Como a cena está organizada

| Arquivo | Responsabilidade |
| --- | --- |
| `src/three/camera.ts` | Matemática de enquadramento. Função pura, coberta por testes |
| `src/three/stage.ts` | Renderer, luzes, resize, loop, hooks `onFrame` / `onAfterRender` |
| `src/three/orrery.ts` | O instrumento: núcleo, gaiola, anéis, nós, halo, sombra |
| `src/three/post.ts` | `EffectComposer` + `UnrealBloomPass`. Devolve `null` quando o tier não tem bloom |
| `src/three/burst.ts` | Partículas do burst e a casca emissiva do flash |
| `src/core/motion.ts` | `prefers-reduced-motion` e detecção de tier |
| `src/core/cardTracker.ts` | Lado do card como valor contínuo, para a câmera seguir |
| `src/core/tokens.ts` | Paleta e vocabulário de easings |

## Três decisões que não são óbvias no código

### Um escritor por propriedade

O anime.js anima objetos Three diretamente pelo adapter oficial
(`import 'animejs/adapters/three'`), mas **só** onde a propriedade tem uma
fonte única. Onde há mais de um contribuinte, a timeline move um número num
objeto simples e o render loop combina:

```
adapter        scale, emissiveIntensity, opacity   (montagem)
render loop    rotation.y = idle + scroll, dolly, background, flash
```

A escala do emissivo por tier fica na **cor** emissiva, não em
`emissiveIntensity`, justamente para não disputar a propriedade com a timeline.
Mesma divisão no halo: timeline dona da `opacity`, tier dono da `color`.

### `sync: 1`, medido e não chutado

O `onScroll` da timeline mestra usa mapeamento direto. Valores menores
suavizam, mas nunca terminam: medindo progresso contra posição de scroll,
`sync: 0.6` chegava ao rodapé da página com a timeline em 0.47 — metade do
instrumento por montar. A tabela completa está no comentário de `master.ts`.
Em dev, `?sync=0.5` na URL permite sentir os outros valores.

### Enquadramento por região, não por aspect

`camera.ts` recebe o retângulo livre em NDC e resolve a câmera *off-axis* para
o centro dele. Detalhes que os testes travam:

- `d = R / sin(halfFov)`, não `tan` — `tan` enquadra o plano do centro e deixa
  a esfera estourar pelas quadrinas.
- `R` vem da união de bounding **spheres**, não de boxes: a esfera da caixa
  mede até o canto e inflava o raio de 2.75 para ~4.42.
- O plano de sombra é marcado com `excludeFromFraming` — sozinho, ele definia
  o raio.
- A largura da região livre é idêntica em todo o trajeto do card, então a
  garantia vale durante a troca de lado, não só nas pontas.

## Parâmetros de dev

Só em `npm run dev`:

| Query | Efeito |
| --- | --- |
| `?debug` | Desenha a bounding sphere usada pelo enquadramento |
| `?tier=low` / `?tier=high` | Força o tier de performance |
| `?sync=0.5` | Troca a taxa de catch-up do scroll |

`window.__orrery` expõe stage, orrery, master e estado do burst.

## Degradação e acessibilidade

**Tiers.** Sinais primários: `pointer: coarse`, largura de viewport e
`maxTouchPoints`. `hardwareConcurrency` entra só como desempate — o Safari
reporta valores baixos por padrão e sozinho rebaixaria máquinas capazes. Por
cima disso, uma sonda mede os primeiros ~90 frames e rebaixa se a média ficar
abaixo de ~50fps.

| | desktop | mobile |
| --- | --- | --- |
| Bloom | ligado | desligado |
| Emissivo do núcleo | 2.0 (clipa de propósito, o bloom espalha) | 1.15 |
| Tone mapping | ACES | Khronos PBR Neutral |
| Partículas / fragmentos | 400 / 60 | 120 / 28 |
| Grade da seção 1 | 13×7 | 7×5 |

**`prefers-reduced-motion`.** Nenhum `ScrollObserver` é anexado, as timelines
são levadas ao estado final, o render vira sob demanda em vez de loop, e o
burst fica desabilitado. Os cards são fixados num lado só: sem loop, a câmera
não poderia acompanhar um card que troca de lado, e o instrumento acabaria
embaixo dele.

## Limitações conhecidas

- **Bloom por threshold, não por layers.** Funciona porque a cena é escura;
  aplicar bloom a algo escuro exigiria a abordagem com layers. As constantes
  (`BASE_STRENGTH`, `RADIUS`, `THRESHOLD`) ficam no topo de `src/three/post.ts`
  — o `radius` é o que decide entre "objeto brilhando" e "névoa na tela".
- **O fundo é `scene.background`, não `setClearColor`.** A clear color não passa
  por gerenciamento de cor: atrás do composer ela cai num render target linear e
  o `OutputPass` a re-encoda, o que erguia o preto para azul-ardósia apenas no
  tier com bloom.
- **Rebaixar o tier em runtime não reduz a contagem de nós orbitais**, que é
  definida na criação. Desliga bloom, baixa DPR e sombra — onde está o custo.
- **Cobertura de testes deliberadamente mínima.** O único ponto com matemática
  que erra em silêncio é o enquadramento, e esse está coberto. O resto é
  verificado por typecheck, build e conferência visual.
