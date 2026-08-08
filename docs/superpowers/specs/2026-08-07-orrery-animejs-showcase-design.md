# ORRERY — vitrine de animação com anime.js v4 + Three.js

Data: 2026-08-07
Status: aprovado

## Objetivo

Landing page de rolagem única, sem backend, que demonstra seis técnicas do
anime.js v4 — uma por seção — em torno de um objeto 3D central que se monta
conforme o scroll avança. Uso pessoal e exploratório, não produto comercial.
O nível de acabamento visado é "cinema", não exemplo de documentação.

Referência de inspiração: o scroll storytelling da home do anime.js. A
reinterpretação precisa ser original — em particular, o objeto central não
pode ser um diafragma de câmera.

## Stack

- Vite + TypeScript, vanilla. Sem framework de UI.
- `animejs` v4 — API nova: `animate()`, `createTimeline()`, `stagger()`,
  mola (`spring()` / `createSpring()`), `onScroll()`, `createDraggable()`,
  `svg.createDrawable()`, `svg.morphTo()`, `utils.random()`.
- `three` (versão atual) + `three/examples/jsm/postprocessing`
  (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`).
- `@fontsource-variable/space-grotesk` e `@fontsource-variable/jetbrains-mono`
  — fontes self-hosted via npm, sem CDN.
- `vitest` — apenas para a matemática de enquadramento de câmera.

Nome exato do export da mola: a documentação atual usa `spring()`; a v4.0
usava `createSpring()`. Verificar o que a versão instalada exporta durante o
scaffold e usar o que existir.

## Direção de arte

"Instrumento científico" — elegante/tech, não industrial e não galeria.

| Papel | Valor |
| --- | --- |
| Fundo (topo da página) | `#07090F` |
| Fundo (base da página) | `#0D1424` |
| Acento primário (emissivo) | cyan `#4DE1E8` |
| Acento secundário | âmbar `#FFB347` |
| Texto | off-white `#E8ECF2` |
| Texto secundário | `#8A94A6` |

O fundo interpola entre os dois tons ao longo do scroll. Vinheta radial fixa
por cima do canvas, abaixo do conteúdo.

Tipografia: Space Grotesk (títulos/corpo), JetBrains Mono (labels, números,
snippets de código).

Idioma da interface: português. Nomes de código, arquivos e README em inglês
técnico onde for natural.

## Arquitetura

```
test-animejs/
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ README.md
└─ src/
   ├─ main.ts              bootstrap: cena → seções → master timeline
   ├─ style.css            tokens, layout, vinheta
   ├─ core/
   │  ├─ tokens.ts         paleta, easings nomeados
   │  ├─ motion.ts         prefers-reduced-motion + tier de performance
   │  └─ codePanel.ts      painel de snippet colapsável (compartilhado)
   ├─ three/
   │  ├─ stage.ts          renderer, luzes, resize, loop único
   │  ├─ camera.ts         enquadramento (função pura, testada)
   │  ├─ orrery.ts         núcleo, anéis, nós, halo
   │  ├─ post.ts           EffectComposer + UnrealBloomPass
   │  └─ burst.ts          partículas emissivas da seção 6
   └─ sections/
      ├─ 00-hero.ts
      ├─ 01-stagger.ts
      ├─ 02-spring.ts
      ├─ 03-svg.ts
      ├─ 04-scrollsync.ts
      ├─ 05-timeline.ts
      └─ 06-burst.ts
```

Cada módulo em `sections/` exporta uma função de setup que recebe o estado
compartilhado e devolve um objeto com `destroy()`. Nenhuma seção conhece
outra seção.

### Camadas (z-order)

1. `canvas#stage` — `position: fixed`, viewport inteira. O orrery vive aqui.
2. `.vignette` — fixed, `pointer-events: none`, gradiente radial.
3. `main` — as seções rolam por cima. Em desktop cada seção é um card com
   `backdrop-filter` ocupando ~42% da largura, lado alternando, deixando o
   orrery respirar do outro lado. Em mobile o card é full-width.
4. `svg#leaders` — fixed, linhas finas ligando labels às peças do orrery.

### Fluxo de dados

O anime.js **nunca** anima um `Object3D` diretamente. As timelines animam um
objeto JS de estado:

```ts
type OrreryState = {
  coreScale: number
  coreEmissive: number
  ringXProgress: number
  ringZProgress: number
  nodesProgress: number
  haloProgress: number
  scrollSpin: number
  camDolly: number    // 1.6 → 1.0
  bgMix: number       // 0 → 1
}
```

O `renderer.setAnimationLoop` lê esse estado a cada frame e aplica na cena.
Motivo: o idle spin e a rotação vinda do scroll precisam **somar**
(`rotation.y = idle + scrollSpin`), o que é impossível se as duas fontes
escreverem na mesma propriedade.

## Enquadramento de câmera

Requisito explícito: nada pode ser cortado nas bordas, em nenhum aspect
ratio, em nenhum ponto do dolly. A conta vira uma função pura em
`three/camera.ts`, coberta por testes.

Dado `R` = raio da bounding sphere do conteúdo, `fov` vertical em graus e o
aspect ratio efetivo:

```
vFOV  = fov · π / 180
distV = R / sin(vFOV / 2)
hFOV  = 2 · atan( tan(vFOV / 2) · aspect )
distH = R / sin(hFOV / 2)
dist  = max(distV, distH) · SAFE          // SAFE = 1.18
```

Pontos que importam:

- **`sin`, não `tan`.** `tan` enquadra o plano que passa pelo centro; a
  esfera de raio `R` estoura essa moldura pelas quadrinas. `sin` enquadra a
  esfera tangente ao frustum, que é o que queremos.
- **`R` é medido no estado 100% montado**, no grupo com todos os estágios
  aplicados. Medir no estado corrente faria a moldura mudar enquanto o objeto
  monta.
- **`R` vem da união das bounding *spheres*, não das bounding boxes.** Unir
  AABBs e depois tirar a esfera da caixa mede até o canto: para este objeto
  isso inflava o raio de 2.75 para ~4.42 e a câmera recuava tanto que o
  orrery virava um ponto num quadro tecnicamente correto.
- **Nem tudo entra na medição.** O plano que recebe a sombra é muito maior que
  o sujeito e é marcado com `excludeFromFraming`. Sem isso ele sozinho define
  o raio.
- **Região, não aspect fudgeado.** Em vez de encolher o aspect, o cálculo
  recebe o retângulo livre em NDC (`layoutRegion`) e resolve a câmera
  *off-axis* para o centro dele: em desktop a faixa de 58% oposta ao card, em
  retrato a banda superior com largura cheia. É a mesma função nos dois casos,
  sem ajuste ad-hoc por breakpoint.
- **Dolly.** A câmera percorre `dist · 1.6` (longe) → `dist · 1.0` (perto).
  Como `dist` já é o pior caso com margem, todo ponto do trajeto é no mínimo
  tão seguro quanto o limite. O zoom nunca ultrapassa `dist`.
- Recalculado no `resize`, seguido de `camera.updateProjectionMatrix()`.

### Testes

`camera.test.ts`, com `vitest`. Para aspects de 0.5 a 3.0 e para cada passo
do dolly, asserta que uma esfera de raio `R` na origem projeta inteiramente
dentro do frustum. É o único teste automatizado do projeto.

## Objeto 3D

Grupo `root`, montado em estágios:

| Estágio | Peça | Geometria |
| --- | --- | --- |
| 1 | `core` | Icosaedro (0.55, detalhe 2), `MeshStandardMaterial` emissivo cyan |
| 2 | `coreCage` | Icosaedro wireframe raio 0.8, contra-rotação |
| 3 | `ringX` | Toro (1.5, 0.02) no eixo X + 24 dentes (`InstancedMesh`) |
| 4 | `ringZ` | Toro (2.1, 0.02) no eixo Z + 3 marcadores âmbar |
| 5 | `nodes` | 7 esferas em órbita elíptica (`InstancedMesh`) |
| 6 | `halo` | Anel (2.7, 2.75) billboard, blending aditivo |
| — | `shadowCatcher` | Plano abaixo com `ShadowMaterial` |

Luzes: `DirectionalLight` key com `castShadow` (shadow camera dimensionada a
partir de `R`), `PointLight` cyan dentro do núcleo, `PointLight` âmbar
rasante, `HemisphereLight` fraca de fill. `VSMShadowMap` — `PCFSoftShadowMap`
está depreciado no three 0.185 e cai silenciosamente para `PCFShadowMap`.

Easings da montagem: `outBack` nos anéis encaixando, `outElastic` nos nós,
`outExpo` no núcleo crescendo, `outSine` no halo.

## Seções e técnicas

| # | Arquivo | Seção | Técnica demonstrada |
| --- | --- | --- | --- |
| 0 | `00-hero.ts` | Hero | Tipografia letra a letra: `rotateX: [-90, 0]` + `opacity` + `y`, `stagger(38, { from: 'center' })`, `outExpo`. Subtítulo palavra a palavra. |
| 1 | `01-stagger.ts` | Campo | Grid 13×7. (a) onda de entrada com `stagger(60, { grid, from: 'center' })`; (b) hover contínuo com `from: [gx, gy]` derivado da posição do cursor — o grid responde como campo de força. `outQuint` na ida, `outSine` na volta. |
| 2 | `02-spring.ts` | Mola | Duas bolas `createDraggable` com molas opostas (stiffness 90 / damping 8 "elástica"; stiffness 200 / damping 26 "seca"). Sliders reconstroem os draggables ao vivo. Curva de resposta desenhada em SVG. |
| 3 | `03-svg.ts` | Selo | `svg.createDrawable` desenha os traços (`draw: ['0 0', '0 1']`, stagger, `inOutQuad`); em seguida `svg.morphTo` transforma o polígono central em outra forma, alternando no hover. |
| 4 | `04-scrollsync.ts` | Sincronia | Expõe a master timeline do orrery: labels laterais ligados às peças 3D por linhas finas (`vec3.project(camera)` → coordenadas de tela → atualiza `<line>`), mais barra de playhead. |
| 5 | `05-timeline.ts` | Sequência | `createTimeline()` com labels e offsets relativos (`'<-=200'`, `'+=100'`): cinco formas se revezam contando uma história abstrata, easing distinto por beat. |
| 6 | `06-burst.ts` | Ruptura | Clique dispara, na mesma timeline: ~60 shards DOM com `utils.random()` individual por eixo, e 400 partículas emissivas no Three, com `bloomPass.strength` pulsando 0.6 → 2.2 → 0.6. |

Cada seção tem um botão discreto que abre um painel monoespaçado com as ~8
linhas de anime.js responsáveis pelo efeito. O painel é colapsado por padrão.

## Performance

`core/motion.ts` resolve um tier: `desktop` ou `mobile`.

Sinais, em ordem de peso:

1. `matchMedia('(pointer: coarse)')` — primário.
2. Largura de viewport — primário.
3. `navigator.maxTouchPoints` — primário.
4. `navigator.hardwareConcurrency` — **sinal fraco, apenas desempate**.
   Safari reporta valores baixos por padrão, então esse número sozinho não
   rebaixa ninguém.
5. **Sonda de FPS em runtime**: mede os primeiros ~90 frames; se a média
   ficar abaixo de ~50fps, rebaixa o tier. Cobre tanto o Safari mal
   classificado quanto o desktop fraco que a heurística estática promoveria.

| Ajuste | desktop | mobile |
| --- | --- | --- |
| Device pixel ratio | ≤ 2 | ≤ 1.5 |
| Bloom | ligado | desligado |
| Partículas do burst | 400 | 120 |
| Shadow map | 2048 | 1024 |
| Grid da seção 1 | 13×7 | 7×5 |

Um único `setAnimationLoop` conduz todo o render. O anime.js mantém o próprio
ticker; o loop de render apenas lê o estado que ele produziu.

## prefers-reduced-motion

Quando ativo, `motion.ts` expõe `reduced === true` e:

- nenhum `ScrollObserver` é anexado;
- todas as timelines são levadas a `progress = 1` via `seek()`, sem tocar;
- o idle spin é desligado;
- o burst aplica o estado final direto, sem trajetória;
- o render passa a ser sob demanda em vez de loop contínuo;
- a tipografia entra com fade curto em vez de cascata 3D.

Resultado: a página fica legível e completa, estática, sem nenhum loop.

## Trade-offs assumidos

1. **Bloom por threshold, não por layers.** `threshold: 0.85` sobre um fundo
   escuro entrega o resultado desejado com muito menos código que a dança de
   duas passadas com layers. Se depois for preciso aplicar bloom a algo
   escuro, aí vale migrar para a abordagem com layers.
2. **Fontes via `@fontsource-variable`.** Custa duas dependências, mas evita
   CDN externo e funciona offline. A alternativa (system font stack) fica
   visivelmente mais fraca no tom pretendido.
3. **Cobertura de testes deliberadamente mínima.** É uma vitrine visual; o
   único ponto com matemática que erra silenciosamente é o enquadramento, e
   esse está coberto. O resto é verificado por `tsc --noEmit`, `npm run
   build` limpo e conferência visual no browser.
4. **Sem imagens externas.** Toda forma, cor e luz é gerada em código, o que
   limita a riqueza de textura mas mantém o projeto autocontido.

## Verificação

- `npx tsc --noEmit` sem erros.
- `npx vitest run` verde.
- `npm run build` sem avisos de import quebrado.
- Conferência visual: montagem em estágios sem corte nas bordas em janela
  larga, quadrada e estreita; scroll sem lag ou salto; reduced-motion
  entregando estado final estático.

## Entregável

Projeto rodável com `npm install && npm run dev`, mais um `README.md` curto
mapeando cada técnica ao arquivo que a implementa.
