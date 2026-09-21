/* =====================================================================
   RIGOR MORTIS — script de API para o Roll20 (Guardião: Luan)
   Contadores persistentes + tabelas + handouts do clímax.

   COMANDOS (todos só para o GM, exceto onde indicado)
     !rm                      ajuda
     !rm status               cartão com Ruído, doses e fase do cerco (público)
     !rm setup                cria as Rollable Tables e os Handouts (uma vez)
     !rm vincular ruido|dose|cerco   (com um token selecionado) o token passa a mostrar o contador na barra 1
     !rm reset                zera tudo (pede confirmação: !rm reset sim)
     !rm fichas               despeja CON/SAN/PV/PM/perícias de todas as fichas no console da API + resumo ao GM

     !ruido                   mostra   |  !ruido +1  |  !ruido -1  |  !ruido -2  |  !ruido 3  |  !ruido zerar
     !dose                    mostra   |  !dose -1   |  !dose +1   |  !dose 5
     !cerco                   mostra   |  !cerco +1  |  !cerco -1  |  !cerco 6

     !insanidade rapida       rola 1D10 na tabela Rápida (sussurra ao GM)
     !insanidade prolongada   rola 1D10 na tabela Prolongada (sussurra ao GM)
     !insanidade rapida pub   ... e mostra a todos
     !reacao                  1D6: reação de um soldado qualquer (sussurra ao GM)

   Acrescente "gm" no fim de !ruido/!dose/!cerco para NÃO anunciar aos jogadores
   (ex.: !ruido +1 gm). Sem "gm", a mesa vê o contador mudar — é proposital.
   ===================================================================== */

var RigorMortis = (function () {
  'use strict';

  var VERSION = '1.2';

  var SIEGE = [
    'Quarentena declarada · saídas fechadas',
    'Queima dos corpos na vala',
    'Exames médicos em TODOS · Mendel descobre os infectados',
    'Queima das casas vazias',
    'Mendel começa a raptar pessoas para estudo',
    'Desapropriação · famílias separadas por zona',
    '2 semanas: extermínio dos casos avançados',
    '3 semanas: novas chacinas',
    'Erradicação da cidade'
  ];

  var RUIDO_FX = [
    'Silêncio. Nada ainda.',
    'Um guarda vira a cabeça. Nada ainda — mas a próxima falha custa mais.',
    'Patrulha desvia a rota. O próximo teste de Furtividade é <b>Difícil</b>.',
    'Alerta local. Soldados no setor: encontro obrigatório (!reacao). Testes Difíceis até saírem do setor.',
    '<b>ALERTA GERAL.</b> Apito, holofote, tropa mobilizada. A missão acabou — agora é fuga.'
  ];

  var RAPIDA = [
    '<b>Grito de nascimento.</b> Acorda gritando, sem ar, como quem sai da água. Não reconhece o próprio corpo.',
    '<b>Foge da caixa.</b> Não suporta o mesmo cômodo que os ingredientes — ou que o frasco lacrado. Corre.',
    '<b>O riso.</b> Ri sem conseguir parar. "Eu estava morrendo e agora não estou." Ninguém mais acha graça.',
    '<b>Fala na língua dos Goules.</b> Balbucia trechos do canto que ouviu enquanto dormia. Não sabe o que diz. Grace sabe.',
    '<b>Pavor da própria pele.</b> A pele nova não parece dele. Não deixa ninguém tocar; não olha as próprias mãos.',
    '<b>"Devolve."</b> Tenta arrancar a pele nova com as unhas — ou agarra o frasco para "devolver o que é dele".',
    '<b>Vê o dono.</b> Uma figura no canto do quarto, esperando, paciente. Ninguém mais a vê. Ela não vai embora quando ele fecha os olhos.',
    '<b>Ecoa o canto.</b> Repete tudo o que ouve com um segundo de atraso — na cadência do ritual.',
    '<b>Fome.</b> Pede comida. Carne. Crua. E sente vergonha no mesmo instante em que pede.',
    '<b>Ainda está lá.</b> Acorda com os olhos abertos e não se move. O corpo voltou; ele não.'
  ];

  var PROLONGADA = [
    '<b>As horas apagadas.</b> Não lembra de nada do sono — e tem pavor do que possa ter dito ou feito nele.',
    '<b>O cheiro invertido.</b> O cheiro de podridão, que antes revirava o estômago, agora parece bom. Ele se odeia por isso.',
    '<b>A cidade dupla.</b> Vê as Terras do Sonho sobrepostas a Shellburne Falls — outra praça sob a praça, outra igreja atrás da igreja.',
    '<b>Passar adiante.</b> Compulsão de tocar os doentes. Sente que deve — que a cura não é dele para guardar.',
    '<b>O frasco.</b> Não larga o frasco lacrado. Dorme com ele. Se alguém pegar, entra em pânico.',
    '<b>As mãos.</b> Tremor constante — que só para enquanto ele cantarola o canto.',
    '<b>Sem reflexo.</b> Não consegue se ver em espelhos ou vidros. Não é que não haja reflexo: ele não consegue olhar.',
    '<b>A cura foi o sonho.</b> Acredita que ainda está doente; que acordou no lugar errado. Pede que o examinem, várias vezes.',
    '<b>O dono sabe.</b> Certeza de que J.M. sabe exatamente onde ele está. Todo soldado é mensageiro. Toda carta é a cobrança.',
    '<b>A contagem.</b> Conta as porções restantes a toda hora. Lava as mãos. Cantarola sem perceber. Alinha os frascos na caixa.'
  ];

  var REACAO = [
    '<b>Assustado</b> — quer distância; cede fácil se o assunto for doença.',
    '<b>Burocrata</b> — segue o manual à risca; nada de exceções.',
    '<b>Cansado</b> — deixa passar se não der trabalho nem testemunha.',
    '<b>Valentão</b> — provoca, testa limites, quer que reajam.',
    '<b>Curioso</b> — quer saber o que está realmente acontecendo aqui.',
    '<b>Humano</b> — reconhece alguém, aceita um recado, faz um favor pequeno. Anote o nome: ele volta.'
  ];

  /* ---------- estado ---------- */
  function ensureState() {
    if (!state.RigorMortis || state.RigorMortis.ruido === undefined) {
      state.RigorMortis = {
        version: VERSION,
        ruido: 0,
        doses: 3,
        cerco: 5,
        tokens: { ruido: null, dose: null, cerco: null }
      };
    }
    state.RigorMortis.version = VERSION;
    state.RigorMortis.tokens = state.RigorMortis.tokens || { ruido: null, dose: null, cerco: null };
    return state.RigorMortis;
  }

  /* ---------- saída no chat ---------- */
  var CSS = {
    card: 'background:#0d1a12;border:1px solid #5c6e46;border-left:4px solid #8f1d1d;border-radius:4px;padding:8px 10px;color:#e6dcc4;font-family:Georgia,serif;font-size:13px;line-height:1.4;',
    eyebrow: 'display:block;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#9c7a3c;margin-bottom:3px;',
    big: 'font-size:22px;color:#c9302c;font-weight:bold;',
    dim: 'color:#a89f8a;font-size:11px;'
  };

  function card(eyebrow, html) {
    return '<div style="' + CSS.card + '"><span style="' + CSS.eyebrow + '">' + eyebrow + '</span>' + html + '</div>';
  }
  function say(html, gmOnly) {
    sendChat('Rigor Mortis', (gmOnly ? '/w gm ' : '/direct ') + html);
  }
  function pips(n, max, on, off) {
    var s = '';
    for (var i = 1; i <= max; i++) s += (i <= n ? on : off);
    return s;
  }

  /* ---------- tokens vinculados ---------- */
  function syncToken(kind) {
    var st = ensureState();
    var id = st.tokens[kind];
    if (!id) return;
    var tok = getObj('graphic', id);
    if (!tok) { st.tokens[kind] = null; return; }
    var v = kind === 'ruido' ? st.ruido : kind === 'dose' ? st.doses : st.cerco;
    var mx = kind === 'ruido' ? 4 : kind === 'dose' ? Math.max(st.doses, 3) : 9;
    tok.set({ bar1_value: v, bar1_max: mx, showplayers_bar1: true });
    if (kind === 'ruido') tok.set('status_red', st.ruido >= 4);
  }

  /* ---------- contadores ---------- */
  function showRuido(gmOnly) {
    var st = ensureState();
    say(card('Ruído · ' + st.ruido + ' / 4',
      '<span style="' + CSS.big + '">' + pips(st.ruido, 4, '●', '○') + '</span><br>' + RUIDO_FX[st.ruido]), gmOnly);
  }
  function setRuido(v, gmOnly) {
    var st = ensureState();
    var before = st.ruido;
    st.ruido = Math.max(0, Math.min(4, v));
    syncToken('ruido');
    showRuido(gmOnly);
    if (st.ruido === 4 && before < 4 && st.cerco < 9) {
      st.cerco += 1;
      syncToken('cerco');
      say(card('Consequência', 'Alerta geral: o Cerco avança para a <b>fase ' + st.cerco + '</b> — ' + SIEGE[st.cerco - 1] + '.'), true);
    }
  }

  function showDose(gmOnly) {
    var st = ensureState();
    say(card('Pó de Kzhoba',
      '<span style="' + CSS.big + '">' + st.doses + '</span> dose' + (st.doses === 1 ? '' : 's') + ' restante' + (st.doses === 1 ? '' : 's') +
      '<br><span style="' + CSS.dim + '">3h para preparar · 2D6 PM · 2h de sono · imunidade</span>'), gmOnly);
  }
  function setDose(v, gmOnly) {
    var st = ensureState();
    var before = st.doses;
    st.doses = Math.max(0, v);
    syncToken('dose');
    showDose(gmOnly);
    if (st.doses < before) say(card('Uma dose a menos', 'Alguém acabou de ser escolhido. Alguém acabou de não ser.'), true);
  }

  function showCerco(gmOnly) {
    var st = ensureState();
    say(card('O Cerco · fase ' + st.cerco + ' de 9',
      '<span style="' + CSS.big + '">' + pips(st.cerco, 9, '▮', '▯') + '</span><br><b>' + SIEGE[st.cerco - 1] + '</b>'), gmOnly);
  }
  function setCerco(v, gmOnly) {
    var st = ensureState();
    st.cerco = Math.max(1, Math.min(9, v));
    syncToken('cerco');
    showCerco(gmOnly);
  }

  function status(gmOnly) {
    var st = ensureState();
    say(card('Rigor Mortis · estado',
      '<b>Ruído</b> ' + pips(st.ruido, 4, '●', '○') + ' &nbsp; ' +
      '<b>Pó</b> ' + st.doses + ' dose' + (st.doses === 1 ? '' : 's') + ' &nbsp; ' +
      '<b>Cerco</b> fase ' + st.cerco + '<br><span style="' + CSS.dim + '">' + SIEGE[st.cerco - 1] + '</span>'), gmOnly);
  }

  /* ---------- tabelas ---------- */
  function rollTable(name, arr, gmOnly) {
    var r = randomInteger(arr.length);
    say(card(name + ' · rolou ' + r, arr[r - 1]), gmOnly);
  }

  /* ---------- parse "+1" / "-2" / "3" ---------- */
  function applyDelta(cur, arg) {
    if (arg === undefined) return null;
    if (/^[+-]\d+$/.test(arg)) return cur + parseInt(arg, 10);
    if (/^\d+$/.test(arg)) return parseInt(arg, 10);
    if (/^(zerar|zero|reset)$/i.test(arg)) return 0;
    return null;
  }

  /* ---------- setup: rollable tables + handouts ---------- */
  function makeTable(name, items) {
    var existing = findObjs({ _type: 'rollabletable', name: name })[0];
    if (existing) return name + ' (já existia)';
    var t = createObj('rollabletable', { name: name, showplayers: false });
    items.forEach(function (txt, i) {
      createObj('tableitem', { rollabletableid: t.id, name: (i + 1) + ' — ' + txt.replace(/<[^>]+>/g, ''), weight: 1 });
    });
    return name;
  }
  function makeHandout(name, html) {
    var existing = findObjs({ _type: 'handout', name: name })[0];
    if (existing) return name + ' (já existia)';
    var h = createObj('handout', { name: name, inplayerjournals: '', archived: false });
    h.set('gmnotes', html);
    h.set('notes', '<p><i>Material do Guardião — ver GM Notes.</i></p>');
    return name;
  }

  var H_RUIDO =
    '<h3>Sistema de infiltração — o Ruído</h3>' +
    '<p>Marcador do grupo, começa em 0. Cada ação furtiva: quem age rola <b>Furtividade</b>. Falha: <b>+1</b>. Desastre (96–00): <b>+2</b>. ' +
    'Em grupo: rola quem tem a pior Furtividade (ou todos rolam; cada falha soma 1). Carregar alguém: teste <b>Difícil</b>. ' +
    'À noite, Escutar/Encontrar dos soldados valem <b>metade</b> — sem chamas, a cidade está escura de verdade. Andar sobre cinza range: falha ali é <b>+2</b>.</p>' +
    '<ul><li><b>1</b> — Um guarda vira a cabeça.</li><li><b>2</b> — Patrulha desvia a rota; próximo teste Difícil.</li>' +
    '<li><b>3</b> — Alerta local; encontro obrigatório (<code>!reacao</code>); testes Difíceis no setor.</li>' +
    '<li><b>4</b> — ALERTA GERAL; vira fuga; Cerco +1 fase.</li></ul>' +
    '<p><b>Reduzir:</b> esperar 1h escondido = −1 · diversão (fogo em outro setor, tiro longe, carro ladeira abaixo) = −2, uma vez, quem faz fica separado · ' +
    'Prestidigitação do David: 1×/cena cancela uma falha de outro personagem.</p>' +
    '<p>Comandos: <code>!ruido +1</code>, <code>!ruido -1</code>, <code>!ruido -2</code>, <code>!ruido zerar</code>.</p>';

  var H_BASE =
    '<h3>A Base de Operações — o resgate como assalto</h3>' +
    '<p><b>Prefeitura</b>: dois andares, sacos de areia nas entradas, gerador roncando nos fundos (cobre passos). Térreo: rádio, refeitório, o mapa na parede, beliches. ' +
    'Andar de cima: <b>quarto de Warren</b> — Crawford dorme numa cadeira ao lado da cama. Tenda de <b>Mendel</b> no pátio lateral (vazia à noite; caixa de amostras). ' +
    'Guarda: 2 na frente, 1 nos fundos junto ao gerador, 1 rondando dentro. Halloran dorme na sala do prefeito.</p>' +
    '<ol><li><b>Aproximação</b> — matagal → praça (Furtividade). Cinzas ajudam: fumaça rasteira, sem clarão, guardas cansados.</li>' +
    '<li><b>Entrada</b> — pelo gerador (1 guarda, barulho cobre) ou pela tenda de Mendel. Furtividade Difícil, ou Lábia com pretexto médico.</li>' +
    '<li><b>O quarto de Warren</b> — porta sem guarda. SAN 0/1D3 se Crawford estiver visivelmente no estágio 6.</li>' +
    '<li><b>A cena</b> — nenhum teste, só escolha.</li>' +
    '<li><b>Extração</b> — carregar Crawford: Furtividade Difícil. Em fúria: Agarrar antes.</li></ol>' +
    '<p><b>A CURA GRITA.</b> Dor excruciante, convulsão, depois o sono. Ninguém é curado dentro da Base — nem Crawford, nem Warren: no primeiro grito é alarme, no segundo é fuzil. <b>Resgate é tirar primeiro, curar longe.</b></p>' +
    '<p><b>Dia 4, 9h:</b> Crawford vai sedado para a <b>tenda de Mendel</b> (pátio lateral): lona, um guarda, muro de 2 m nos fundos. Entrada mais fácil da campanha; sair carregando um homem é o difícil. Sai da cidade no caminhão de Mendel ao anoitecer.</p>';

  var H_FUGA =
    '<h3>Sistema de fuga — as rotas</h3>' +
    '<p>Cada rota é uma sequência de postos; em cada um, um teste. Falha = disparo (1D10+2) e alarme geral. Um tiro ecoa por quilômetros. Cada pessoa carregada = teste Difícil por posto.</p>' +
    '<ol><li><b>A vala</b> (recomendada) — morro (Furtividade) → vala (SAN 0/1D4 + CON pelo ar) → mata (Difícil). Os soldados não chegam perto da vala: é o único buraco no anel, e foram eles que o abriram. A pé.</li>' +
    '<li><b>O matagal</b> — matagal (Furtividade) → cruzar a 249 (Difícil) → campo aberto (Extremo sem diversão). Carro só empurrado; ligar o motor = alarme.</li>' +
    '<li><b>A ferrovia</b> — chegar aos trilhos (Difícil) → passar a estação (Extremo) → reto. Só com diversão grande ou Warren abrindo.</li>' +
    '<li><b>A fazenda</b> — refúgio, não fuga: rota 3 + campo até a cervejaria (Difícil). Ninguém vai lá.</li>' +
    '<li><b>O disfarce</b> — fardas dos mortos da praça; Disfarce Difícil por interação; para um ou dois passarem no escuro, nunca para o grupo.</li>' +
    '<li><b>O caminhão de Mendel</b> — a única coisa que sai do anel. Entrar como carga ou como "espécime": Furtividade Difícil para embarcar, Extremo para não ser revistado na 165. Saltar fora depois é a perseguição.</li></ol>';

  function setup() {
    var out = [];
    out.push(makeTable('po-rapida', RAPIDA));
    out.push(makeTable('po-prolongada', PROLONGADA));
    out.push(makeTable('reacao-soldado', REACAO));
    out.push(makeHandout('Clímax · Ruído (regras)', H_RUIDO));
    out.push(makeHandout('Clímax · Assalto à Base', H_BASE));
    out.push(makeHandout('Clímax · Rotas de fuga', H_FUGA));
    say(card('Setup concluído', out.join('<br>') + '<br><span style="' + CSS.dim + '">Tabelas: /roll 1t[po-rapida] · 1t[po-prolongada] · 1t[reacao-soldado]</span>'), true);
  }


  /* ---------- fichas: despejo para o console ---------- */
  var FICHA_KEYS = ['constitution','strength','dexterity','power','size','intelligence','education','appearance',
    'hp','hp_max','sanity','sanity_max','sanity_start','mp','mp_max','luck','luck_max','mov','build','db',
    'stealth','listen','spot_hidden','disguise','sleight_of_hand','fast_talk','persuade','charm','intimidate',
    'first_aid','medicine','psychology','occult','cthulhu_mythos','archaeology','history','library_use','locksmith',
    'firearms_handgun','firearms_rifle','fighting_brawl','dodge','drive_auto','climb','jump','swim','throw','track',
    'language_own','language_other1','language_other2','language_other3','credit_rating'];
  function fichas() {
    var chars = findObjs({ _type: 'character' });
    var dump = [];
    var lines = [];
    chars.forEach(function (ch) {
      var attrs = findObjs({ _type: 'attribute', _characterid: ch.id });
      var o = { name: ch.get('name'), controlledby: ch.get('controlledby'), attrs: {} };
      attrs.forEach(function (a) {
        var n = a.get('name');
        var keep = FICHA_KEYS.indexOf(n) >= 0 ||
          /^(stealth|listen|spot|disguise|sleight|fast|persuade|charm|intimidate|first|medicine|psycho|occult|cthulhu|archaeo|history|library|lock|firearms|fighting|dodge|drive|climb|jump|swim|throw|track|language|credit|science|art|natural|navigate|survival|law|accounting|anthro|appraise)/i.test(n);
        if (!keep) return;
        var cur = a.get('current'), mx = a.get('max');
        if (cur === '' && mx === '') return;
        o.attrs[n] = (mx !== '' && mx !== undefined) ? (cur + '/' + mx) : cur;
      });
      dump.push(o);
      var A = o.attrs;
      lines.push('<b>' + o.name + '</b> — CON ' + (A.constitution || '?') + ' · SAN ' + (A.sanity || '?') + ' · PV ' + (A.hp || '?') +
        ' · PM ' + (A.mp || '?') + ' · Sorte ' + (A.luck || '?') + ' · Furtividade ' + (A.stealth || '?'));
    });
    log('RM_FICHAS_BEGIN');
    log(JSON.stringify(dump));
    log('RM_FICHAS_END');
    say(card('Fichas (' + chars.length + ')', lines.join('<br>') + '<br><span style="' + CSS.dim + '">Despejo completo no console da API.</span>'), true);
  }

  function help() {
    say(card('Rigor Mortis · comandos',
      '<code>!ruido +1 | -1 | -2 | 3 | zerar</code><br>' +
      '<code>!dose -1 | +1 | 5</code><br>' +
      '<code>!cerco +1 | -1 | 6</code><br>' +
      '<code>!insanidade rapida | prolongada</code> (+ <code>pub</code> para mostrar a todos)<br>' +
      '<code>!reacao</code> — soldado qualquer (1D6)<br>' +
      '<code>!rm status</code> · <code>!rm setup</code> · <code>!rm fichas</code> · <code>!rm vincular ruido|dose|cerco</code> (token selecionado) · <code>!rm reset sim</code><br>' +
      '<span style="' + CSS.dim + '">Acrescente <code>gm</code> ao fim de !ruido/!dose/!cerco para não anunciar.</span>'), true);
  }

  /* ---------- roteador ---------- */
  function handle(msg) {
    if (msg.type !== 'api') return;
    var parts = msg.content.trim().split(/\s+/);
    var cmd = parts[0].toLowerCase();
    if (['!rm', '!ruido', '!dose', '!cerco', '!insanidade', '!reacao'].indexOf(cmd) < 0) return;
    if (!playerIsGM(msg.playerid)) { sendChat('Rigor Mortis', '/w "' + msg.who + '" Só o Guardião mexe nesses ponteiros.'); return; }

    var args = parts.slice(1);
    var gmOnly = false;
    if (args.length && /^gm$/i.test(args[args.length - 1])) { gmOnly = true; args.pop(); }
    var pub = false;
    if (args.length && /^pub$/i.test(args[args.length - 1])) { pub = true; args.pop(); }
    var st = ensureState();
    var v;

    switch (cmd) {
      case '!ruido':
        v = applyDelta(st.ruido, args[0]);
        if (v === null) showRuido(gmOnly); else setRuido(v, gmOnly);
        break;
      case '!dose':
        v = applyDelta(st.doses, args[0]);
        if (v === null) showDose(gmOnly); else setDose(v, gmOnly);
        break;
      case '!cerco':
        v = applyDelta(st.cerco, args[0]);
        if (v === null) showCerco(gmOnly); else setCerco(v, gmOnly);
        break;
      case '!insanidade':
        if (/^pro/i.test(args[0] || '')) rollTable('Insanidade Prolongada (1D10 × 10 h)', PROLONGADA, !pub);
        else rollTable('Insanidade Rápida (1D10+4 rodadas)', RAPIDA, !pub);
        break;
      case '!reacao':
        rollTable('Reação de um soldado', REACAO, !pub);
        break;
      case '!rm':
        var sub = (args[0] || 'ajuda').toLowerCase();
        if (sub === 'status') status(gmOnly);
        else if (sub === 'setup') setup();
        else if (sub === 'vincular') {
          var kind = (args[1] || '').toLowerCase();
          if (['ruido', 'dose', 'cerco'].indexOf(kind) < 0) { say(card('Vincular', 'Use: <code>!rm vincular ruido|dose|cerco</code> com um token selecionado.'), true); break; }
          var sel = (msg.selected || [])[0];
          var tokId = sel ? sel._id : null;
          if (!tokId) {
            var rx = kind === 'ruido' ? /ru[ií]do/i : kind === 'dose' ? /dose|p[oó] de kzhoba|kzhoba/i : /cerco/i;
            var g = findObjs({ _type: 'graphic', _pageid: Campaign().get('playerpageid') }).filter(function (x) { return rx.test(x.get('name') || ''); })[0];
            if (g) tokId = g.id;
          }
          if (!tokId) { say(card('Vincular', 'Selecione um token primeiro — ou dê ao token o nome "Ruído", "Pó de Kzhoba" ou "Cerco" na página atual.'), true); break; }
          st.tokens[kind] = tokId;
          syncToken(kind);
          say(card('Vinculado', 'O token selecionado agora mostra <b>' + kind + '</b> na barra 1.'), true);
        }
        else if (sub === 'fichas') fichas();
        else if (sub === 'refazer') {
          findObjs({ _type: 'handout' }).filter(function (h) { return /^Clímax ·/.test(h.get('name')); }).forEach(function (h) { h.remove(); });
          setup();
        }
        else if (sub === 'reset') {
          if (args[1] === 'sim') { delete state.RigorMortis; ensureState(); say(card('Reset', 'Ruído 0 · 3 doses · Cerco fase 5.'), true); }
          else say(card('Reset', 'Tem certeza? <code>!rm reset sim</code>'), true);
        }
        else help();
        break;
    }
  }

  on('ready', function () {
    ensureState();
    log('Rigor Mortis API v' + VERSION + ' pronta.');
    on('chat:message', handle);
  });

  return {};
}());
