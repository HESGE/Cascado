import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {mechanicalDetents,rotationDetentDelta} from '../src/detents.js';
import {magnetizeAngle} from '../src/magnet.js';
const normalizeAngle=angle=>((angle%360)+360)%360;
const nextAngle=(wheel,angle,sign)=>normalizeAngle(angle+rotationDetentDelta(wheel,angle,sign));
const closeAngle=(a,b,tolerance=1e-7)=>Math.min(normalizeAngle(a-b),normalizeAngle(b-a))<tolerance;
// Native input coordinates may be quantized to screen subpixels.
const followsAngle=(actual,expected)=>closeAngle(actual,expected,.3);
const assertDetentStep=(wheel,before,after,sign)=>{
  const distance=normalizeAngle(sign*(after-before));
  assert.ok(distance>0&&distance<=6+1e-7,'le pas suit le sens physique demandé sans dépasser 6 degrés');
  assert.ok(closeAngle(after,nextAngle(wheel,before,sign)),'le pas s’arrête sur le premier alignement exact rencontré ou à 6 degrés');
};
const {chromium,webkit}=await import(process.env.DDC_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.DDC_BROWSER_TEST_URL||'http://127.0.0.1:4173';
await mkdir('output/recette',{recursive:true});
const report=[];

for(const type of [chromium,webkit]){
  const browser=await type.launch({headless:true});
  const context=await browser.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const saved=()=>page.evaluate(async()=>(await import('./src/storage.js')).loadGame());
  const mask=async()=>{
    assert.equal(await page.locator('.game-board').count(),0,'aucun plateau dans le masque');
    assert.equal(await page.locator('[data-wheel]').count(),0,'aucune roue accessible sous le masque');
    assert.equal(await page.locator('.result').count(),0,'aucun résultat sous le masque');
    assert.equal(await page.locator('[data-magnet-feedback]').count(),0,'aucun halo d’alignement sous le masque');
  };
  const reveal=async()=>{await page.waitForTimeout(330);await page.locator('[data-action="identify"]').click();};
  const wheelGeometry=async id=>page.locator(`[data-wheel="${id}"] .wheel-hit`).evaluate(hit=>{
    const svg=hit.ownerSVGElement;
    const center=svg.createSVGPoint();
    center.x=Number(hit.getAttribute('cx'));center.y=Number(hit.getAttribute('cy'));
    const edge=svg.createSVGPoint();edge.x=center.x+Number(hit.getAttribute('r'));edge.y=center.y;
    const matrix=svg.getScreenCTM();
    const screen=center.matrixTransform(matrix);const screenEdge=edge.matrixTransform(matrix);
    return {x:screen.x,y:screen.y,radius:Math.hypot(screenEdge.x-screen.x,screenEdge.y-screen.y)};
  });
  const pointOn=(wheel,degrees,radius=.7)=>({
    x:wheel.x+wheel.radius*radius*Math.cos(degrees*Math.PI/180),
    y:wheel.y+wheel.radius*radius*Math.sin(degrees*Math.PI/180),
  });
  const moveArc=async(wheel,from,to,{radius=.7,steps=18}={})=>{
    for(let step=1;step<=steps;step++){
      const point=pointOn(wheel,from+(to-from)*step/steps,radius);
      await page.mouse.move(point.x,point.y);
    }
  };
  const dragArc=async(id,from,to,{outside=false}={})=>{
    const before=(await saved()).game;
    const expected=normalizeAngle(magnetizeAngle(id,before.angles[id-1]+(to-from)*(before.active===0?1:-1)));
    const wheel=await wheelGeometry(id);const start=pointOn(wheel,from);
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    const radius=outside?1.35:.7;
    if(outside){const point=pointOn(wheel,from,radius);await page.mouse.move(point.x,point.y);}
    await moveArc(wheel,from,to,{radius});await page.mouse.up();
    await page.waitForTimeout(80);
    return expected;
  };
  const outsidePoint=async()=>{
    const strip=await page.locator('.progress').boundingBox();
    return {x:strip.x+strip.width-16,y:strip.y+strip.height/2};
  };
  const checkedStep=async(wheel,sign,action)=>{
    const before=(await saved()).game.angles[wheel-1];
    await action();
    const after=(await saved()).game.angles[wheel-1];
    assertDetentStep(wheel,before,after,sign);
    return after;
  };
  const checkTraySlope=async()=>{
    const slots=await page.locator('[data-tray-slot]').evaluateAll(nodes=>nodes.map(node=>({
      number:Number(node.dataset.traySlot),
      label:node.querySelector('text')?.textContent,
      x:Number(node.querySelector('circle')?.getAttribute('cx')),
      y:Number(node.querySelector('circle')?.getAttribute('cy')),
    })));
    assert.deepEqual(slots.map(slot=>slot.number),[1,2,3,4,5,6,7,8,9,10],'les dix places des deux séries sont présentes sur cette face');
    for(const [index,slot] of slots.entries()){
      assert.equal(slot.label,String(index%5+1),'chaque série porte les numéros de 1 à 5');
      if(index%5){
        assert.ok(slot.x>slots[index-1].x,'les places sont ordonnées de gauche à droite');
        assert.ok(slot.y<slots[index-1].y,'le rail remonte vers le 5, le 1 reste au point bas');
      }
    }
  };
  const record=name=>{report.push({browser:type.name(),name,status:'passed'});console.log(`✓ ${type.name()} · ${name}`);};
  try{
    await page.goto(base);
    await page.locator('[data-action="new"]').waitFor();
    await page.locator('[data-action="new"]').click();
    await page.locator('[name="player1"]').fill('Camille');
    await page.locator('[name="player2"]').fill('Léa');
    await page.getByRole('button',{name:'Commencer la partie',exact:true}).click();
    await page.locator('.handoff').waitFor();await mask();
    assert.match(await page.locator('h1').innerText(),/Camille/);
    record('nouvelle partie masquée');

    assert.equal(await page.locator('[data-action="identify"]').count(),1,'un seul bouton de validation du passage');
    assert.equal(await page.locator('[data-action="confirm"],.confirmation').count(),0,'aucune deuxième confirmation');
    await page.screenshot({path:`output/recette/${type.name()}-passage-un-appui.png`});
    await reveal();await page.locator('.play').waitFor();
    record('un seul appui révèle directement le plateau autorisé');
    await page.locator('[data-action="pause"]').click();await page.locator('.handoff').waitFor();await mask();
    await page.reload();await page.locator('.handoff').waitFor();await mask();
    record('interruption et rechargement reviennent au masque');
    await reveal();await page.locator('.play').waitFor();
    assert.match(await page.locator('.player-title').innerText(),/Camille/);
    assert.equal(await page.locator('[data-wheel]').count(),5);
    assert.equal(await page.locator('#app').getAttribute('data-rotation-mode'),'wheel-drag-magnet');
    assert.equal(await page.locator('#app').getAttribute('data-passage-mode'),'overlap-20');
    assert.equal(await page.locator('#app').getAttribute('data-alignment-feedback'),'halo-haptic');
    assert.equal(await page.locator('#app').getAttribute('data-tray-mode'),'slope-one-low');
    assert.equal(await page.locator('#app').getAttribute('data-handoff-mode'),'single-confirmation');
    assert.equal(await page.locator('#app').getAttribute('data-player-mode'),'human-or-ai');
    await checkTraySlope();
    assert.equal(await page.locator('[data-direction],.dial,.controls').count(),0,'les anciens boutons et la molette sont retirés');
    const end=await page.locator('[data-action="end"]').boundingBox();
    assert.ok(end.y+end.height<=640,'bouton de fin visible en 9:16');
    assert.equal(await page.locator('[data-action="end"]').isDisabled(),true);
    await page.screenshot({path:`output/recette/${type.name()}-plateau-a.png`});
    record('plateau 9:16 et fin désactivée sans mouvement');

    const firstWheel=await wheelGeometry(1);
    const firstContact=pointOn(firstWheel,0);
    await page.mouse.move(firstContact.x,firstContact.y);await page.mouse.down();
    await page.waitForTimeout(400);
    // Sub-threshold angular noise must not engage a wheel or accumulate drift.
    await moveArc(firstWheel,0,.4,{steps:2});await moveArc(firstWheel,.4,-.4,{steps:4});
    await moveArc(firstWheel,-.4,0,{steps:2});await page.mouse.up();
    let state=await saved();
    assert.equal(state.game.selectedWheel,1);assert.equal(state.game.engaged,null);
    assert.deepEqual(state.game.angles,[0,0,0,0,0],'le maintien immobile et le tremblement initial ne tournent pas la roue');
    await page.locator('[data-wheel="2"] .wheel-hit').click();
    state=await saved();
    assert.equal(state.game.selectedWheel,2);assert.equal(state.game.engaged,null);
    assert.deepEqual(state.game.angles,[0,0,0,0,0],'on peut changer la sélection avant le premier mouvement');
    record('contact maintenu immobile, petit tremblement et sélection libre avant engagement');

    await page.locator('[data-wheel="1"]').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#rotation-readout').evaluate(node=>node===document.activeElement),true,'la sélection clavier place le focus sur le contrôle stable');
    state=await saved();assert.equal(state.game.selectedWheel,1);assert.equal(state.game.engaged,null);
    const outside=await outsidePoint();
    await page.mouse.move(outside.x,outside.y);await page.mouse.down();
    await page.mouse.move(outside.x-35,outside.y+8);await page.waitForTimeout(400);await page.mouse.up();
    assert.deepEqual((await saved()).game.angles,[0,0,0,0,0],'un contact hors des roues ne tourne pas la sélection');
    // A single initial gesture on the wheel selects and rotates it. Capture
    // keeps following the same center even after the pointer leaves the disk.
    const expectedA=await dragArc(1,0,90,{outside:true});
    state=await saved();
    assert.equal(state.game.engaged,1);assert.ok(followsAngle(state.game.angles[0],expectedA),'un arc horaire suit le doigt sur A avec la correction magnétique prévue');
    const releasedA=state.game.angles[0];await page.waitForTimeout(250);
    assert.equal((await saved()).game.angles[0],releasedA,'aucune inertie ou correction finale après relâchement');
    const reversedA=await dragArc(1,90,0);
    assert.ok(followsAngle((await saved()).game.angles[0],reversedA),'le geste inverse reste continu sans recalage final');
    record('glisser sur A, deux sens, capture hors disque et arrêt sans inertie');

    const stop=mechanicalDetents(1)[0];
    const beforeMagnet=(await saved()).game.angles[0];
    await dragArc(1,0,stop-beforeMagnet-.2);
    const attracted=(await saved()).game.angles[0];
    assert.ok(closeAngle(attracted,stop),'un geste proche de l’alignement atteint le petit plateau exact de l’aimant');
    assert.equal(await page.locator('[data-magnet-feedback="1"]').count(),1,'l’arrivée tactile sur l’aimant affiche le halo de cette roue');
    await page.waitForTimeout(180);
    assert.equal((await saved()).game.angles[0],attracted,'le relâchement n’ajoute aucune correction');
    const magnetWheel=await wheelGeometry(1);const magnetContact=pointOn(magnetWheel,0);
    await page.mouse.move(magnetContact.x,magnetContact.y);await page.mouse.down();
    await page.waitForTimeout(220);
    assert.equal((await saved()).game.angles[0],attracted,'reprendre immobile sur l’aimant ne déplace pas la roue');
    assert.equal(await page.locator('[data-magnet-feedback]').count(),0,'le halo expire et l’appui immobile ne le rejoue pas');
    await moveArc(magnetWheel,0,4);await page.mouse.up();await page.waitForTimeout(80);
    const escaped=(await saved()).game.angles[0];
    assert.ok(followsAngle(escaped,magnetizeAngle(1,attracted+4)),'continuer le geste permet de quitter l’aimant sans verrou');
    await dragArc(1,0,-escaped);
    assert.ok(followsAngle((await saved()).game.angles[0],0),'le geste retrouve la référence avant les essais suivants');
    record('aimantation légère exacte, reprise immobile sans dérive et sortie de l’aimant');

    const centered=await wheelGeometry(1);
    await page.mouse.move(centered.x,centered.y);await page.mouse.down();
    await page.waitForTimeout(400);await page.mouse.move(centered.x+8,centered.y);
    assert.ok(followsAngle((await saved()).game.angles[0],0),'le centre neutre ne produit aucun angle');
    const reference=pointOn(centered,0);await page.mouse.move(reference.x,reference.y);
    assert.ok(followsAngle((await saved()).game.angles[0],0),'sortir du centre fixe une référence sans saut');
    await moveArc(centered,0,90);await page.mouse.up();await page.waitForTimeout(80);
    assert.ok(followsAngle((await saved()).game.angles[0],magnetizeAngle(1,90)),'l’arc commence depuis la nouvelle référence avec la même assistance');
    await dragArc(1,90,0);
    await page.locator('#rotation-readout').focus();
    await checkedStep(1,1,()=>page.locator('#rotation-readout').press('ArrowRight'));
    await checkedStep(1,-1,()=>page.locator('#rotation-readout').press('ArrowLeft'));
    assert.equal(await page.locator('#rotation-readout').evaluate(node=>node===document.activeElement),true,'le focus clavier survit au remplacement du SVG');
    record('zone centrale de 12 pixels sans saut et alternative clavier assistée');

    const lockedAngles=(await saved()).game.angles;
    await dragArc(2,0,90);
    state=await saved();
    assert.deepEqual(state.game.angles,lockedAngles,'une autre roue ne fait tourner aucun axe après engagement');
    assert.equal(state.game.engaged,1);assert.equal(state.game.selectedWheel,1);
    assert.equal(await page.locator('[data-action="end"]').isEnabled(),true);
    record('une seule roue engagée, autres contacts sans rotation indirecte');

    const beforeSound=(await saved()).game.angles;
    assert.equal(await page.locator('[data-action="sound"]').count(),0,'le son temporairement coupé ne propose aucun bouton de réactivation');
    await page.locator('[data-action="pause"]').click();await page.locator('.handoff').waitFor();await mask();
    assert.deepEqual((await saved()).game.angles,beforeSound,'le bouton pause masque sans tourner');
    await reveal();await page.locator('.play').waitFor();
    assert.equal((await saved()).game.engaged,1);
    record('son temporairement coupé, pause sans rotation et reprise protégée');

    const beforeEnd=(await saved()).game.angles;
    await page.locator('[data-action="end"]').click();await page.locator('.handoff').waitFor();await mask();
    assert.deepEqual((await saved()).game.angles,beforeEnd,'terminer le tour ne déclenche aucune rotation');
    assert.match(await page.locator('h1').innerText(),/Léa/);
    await page.screenshot({path:`output/recette/${type.name()}-passage.png`});
    await reveal();await page.locator('.play').waitFor();
    assert.match(await page.locator('.player-title').innerText(),/Léa/);
    state=await saved();assert.equal(state.game.active,1);assert.equal(state.game.lastWheel,1);
    await checkTraySlope();
    await page.screenshot({path:`output/recette/${type.name()}-plateau-b.png`});
    record('passage au bon joueur et face opposée');

    const expectedB=await dragArc(2,0,90);
    state=await saved();
    assert.equal(state.game.engaged,2);
    assert.ok(followsAngle(state.game.angles[1],expectedB),'un quart horaire apparent garde le signe physique inverse et l’assistance sur B');
    const reversedB=await dragArc(2,90,0);
    assert.ok(followsAngle((await saved()).game.angles[1],reversedB),'l’inversion du geste reste continue sur B');
    record('glisser assisté sur la face B avec signe physique inverse');

    const beforeHold=(await saved()).game.angles[1];
    await page.locator('#rotation-readout').focus();await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(620);await page.keyboard.up('ArrowRight');
    state=await saved();
    const bAngle=state.game.angles[1];
    const distance=normalizeAngle(beforeHold-bAngle);
    assert.ok(distance>0&&distance<=42+1e-7,'le maintien clavier sur B reste limité aux crans assistés');
    let candidate=beforeHold;let reached=false;
    for(let count=1;count<=7;count++){
      const next=nextAngle(2,candidate,-1);assertDetentStep(2,candidate,next,-1);
      candidate=next;if(closeAngle(bAngle,candidate))reached=true;
    }
    assert.ok(reached,'le clavier enchaîne les pas assistés depuis l’angle courant');
    await page.waitForTimeout(180);
    assert.equal((await saved()).game.angles[1],bAngle,'aucun mouvement après le relâchement clavier');
    record('maintien clavier accessible et absence de cran final');

    // Cancelling the active pointer must discard subsequent coordinates.
    await page.evaluate(()=>document.addEventListener('pointerdown',event=>{
      document.documentElement.dataset.testPointerId=String(event.pointerId);
    },{once:true,capture:true}));
    const cancelWheel=await wheelGeometry(2);const cancelStart=pointOn(cancelWheel,0);
    await page.mouse.move(cancelStart.x,cancelStart.y);await page.mouse.down();
    await moveArc(cancelWheel,0,45);
    await page.evaluate(()=>{
      const pointerId=Number(document.documentElement.dataset.testPointerId);
      delete document.documentElement.dataset.testPointerId;
      document.dispatchEvent(new PointerEvent('pointercancel',{pointerId,bubbles:true}));
    });
    await page.waitForTimeout(80);const cancelled=(await saved()).game.angles[1];
    await moveArc(cancelWheel,45,90);await page.waitForTimeout(280);await page.mouse.up();
    assert.equal((await saved()).game.angles[1],cancelled,'annuler le contact arrête le glisser sans rotation supplémentaire');
    await page.locator('[data-action="pause"]').click();await mask();
    await reveal();assert.equal((await saved()).game.engaged,2);
    record('annulation du glisser, pause et reprise protégée');

    await page.setViewportSize({width:640,height:360});await page.locator('.landscape').waitFor();await mask();
    await page.setViewportSize({width:360,height:640});await page.locator('.handoff').waitFor();await mask();
    await reveal();
    record('paysage suspendu puis retour masqué');

    await page.evaluate(async()=>{
      const storage=await import('./src/storage.js');const s=await storage.loadGame();
      s.game.verdict={winner:0,reason:'complete',snapshot:{}};
      s.phase='open';await storage.saveGame(s,{type:'fixture-hidden-verdict'});
    });
    await page.reload();await page.locator('.handoff').waitFor();await reveal();
    await page.locator('.play').waitFor();
    assert.equal(await page.locator('.result').count(),0);
    await page.locator('[data-action="end"]').click();await page.locator('.handoff').waitFor();await mask();
    assert.equal(await page.locator('.result').count(),0);await reveal();await page.locator('.result').waitFor();
    assert.match(await page.locator('h1').innerText(),/Camille gagne/);
    await page.reload();await page.locator('.handoff').waitFor();await reveal();await page.locator('.result').waitFor();
    record('verdict différé, reprise non transmise et résultat irréversible');

    await page.locator('[data-action="home"]').click();
    await page.getByText('Prêt hors ligne',{exact:false}).waitFor({timeout:15000});
    if(type.name()==='webkit'&&process.platform==='darwin'){
      // Playwright #42775: macOS WebKit's offline emulation fails before the
      // worker responds. tests/pwa.test.js verifies it with the origin stopped.
      report.push({browser:type.name(),name:'émulation hors ligne Playwright',status:'skipped',reason:'WebKit macOS #42775 ; test réel sans serveur dans pwa.test.js'});
      console.log('↪ webkit · hors ligne couvert séparément avec le serveur arrêté');
    }else{
      await context.setOffline(true);await page.reload();await page.locator('.handoff').waitFor();await reveal();await page.locator('.result').waitFor();
      await page.locator('[data-action="home"]').click();await page.locator('[data-action="new"]').click();
      await page.getByRole('button',{name:'Remplacer et commencer',exact:true}).click();await page.locator('.handoff').waitFor();await reveal();await page.locator('.play').waitFor();
      record('rechargement, reprise et nouvelle partie entièrement hors ligne');
      await context.setOffline(false);
    }

    // Separate browser contexts keep the human duel above and its storage intact.
    for(const {duel,human} of [{duel:false,human:0},{duel:false,human:1},{duel:true,human:null}]){
      const aiContext=await browser.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});
      const aiPage=await aiContext.newPage();
      aiPage.on('pageerror',error=>errors.push(error.message));
      const aiSaved=()=>aiPage.evaluate(async()=>(await import('./src/storage.js')).loadGame());
      try{
        await aiPage.goto(base);await aiPage.locator('[data-action="new"]').click();
        assert.equal(await aiPage.locator('[name="level1"]').isDisabled(),true);
        assert.equal(await aiPage.locator('[name="level1"]').isVisible(),false,'niveau masqué pour un humain');
        await aiPage.locator('[name="player1"]').fill(duel?'Atlas':human===0?'Camille':'Nova');
        await aiPage.locator('[name="player2"]').fill(!duel&&human===1?'Camille':'Nova');
        for(const seat of [0,1])await aiPage.locator(`[name="controller${seat+1}"]`).selectOption(duel||seat!==human?'ai':'human');
        const speed=aiPage.getByRole('combobox',{name:'Vitesse des IA',exact:true});
        assert.equal(await speed.getAttribute('name'),'ai-speed');
        assert.equal(await speed.isVisible(),true,'le réglage de vitesse apparaît lorsqu’une place est confiée à une IA');
        assert.deepEqual(await speed.locator('option').allTextContents(),['Lent','Normal','Rapide','Full']);
        assert.deepEqual(await speed.locator('option').evaluateAll(options=>options.map(option=>option.value)),['slow','normal','fast','full']);
        assert.equal(await speed.inputValue(),'normal','la préférence absente choisit le rythme Normal');
        if(duel)await speed.selectOption('slow');
        assert.equal(await aiPage.locator('[name="level2"]').isVisible(),duel||human!==1);
        assert.equal(await aiPage.locator('[name="level2"]').isDisabled(),!duel&&human===1);
        assert.deepEqual(await aiPage.locator('[name="level2"] option').allTextContents(),['Facile','Normal','Difficile']);
        for(const seat of [0,1])if(duel||seat!==human)await aiPage.locator(`[name="level${seat+1}"]`).selectOption(duel?(seat===0?'easy':'normal'):'hard');
        await aiPage.locator('[name="starter"]').selectOption(String(duel?0:1-human));
        await aiPage.getByRole('button',{name:'Commencer la partie',exact:true}).click();
        if(duel){
          await aiPage.locator('.play.is-ai-play').waitFor();
          assert.equal(await aiPage.locator('.game-board').count(),1,'une seule face active en mode spectateur');
          assert.equal(await aiPage.locator('[data-action="end"]').count(),0,'le spectateur ne termine pas les tours IA');
          assert.equal(await aiPage.locator('#app').getAttribute('data-ai-motion'),'progressive');
          assert.equal(await speed.inputValue(),'slow','la vitesse choisie dans la préparation accompagne le duel');
          assert.equal(await aiPage.locator('#app').getAttribute('data-ai-speed'),'slow');
          await aiPage.locator('#app[data-ai-phase="rotating"]').waitFor({timeout:15000});
          const movingWheel=await aiPage.locator('[data-wheel][aria-pressed="true"]').getAttribute('data-wheel');
          const movingTurn=await aiPage.locator('#rotation-readout').innerText();
          const rotor=aiPage.locator(`[data-wheel-rotor="${movingWheel}"]`);
          const intermediateAngles=[];
          for(let attempt=0;attempt<60&&intermediateAngles.length<3;attempt++){
            assert.equal(await aiPage.locator('#rotation-readout').innerText(),movingTurn,'le tour reste le même pendant la progression de la roue');
            const transform=await rotor.getAttribute('transform');
            const angle=Number(transform.match(/^rotate\(([-\d.]+)/)?.[1]);
            assert.ok(Number.isFinite(angle),'le rotor expose un angle visible');
            if(!intermediateAngles.some(previous=>closeAngle(previous,angle,.001)))intermediateAngles.push(angle);
            if(intermediateAngles.length<3)await aiPage.waitForTimeout(75);
          }
          assert.equal(intermediateAngles.length,3,'au moins trois positions distinctes rendent la rotation IA progressive');
          for(const value of ['fast','normal','slow']){
            await speed.selectOption(value);
            assert.equal(await aiPage.locator('#app').getAttribute('data-ai-speed'),value,'la vitesse courante est modifiée sans quitter le plateau');
            assert.equal(await aiPage.locator('#rotation-readout').innerText(),movingTurn,'le changement de vitesse ne redémarre pas le tour');
            assert.equal((await aiSaved()).game.engaged,Number(movingWheel),'le changement de vitesse conserve la roue engagée');
          }
          await aiPage.screenshot({path:`output/recette/${type.name()}-ia-contre-ia.png`});
          await aiPage.getByRole('button',{name:'Mettre le duel en pause',exact:true}).click();
          await aiPage.locator('.ai-ready').waitFor();
          const paused=await aiSaved();
          assert.equal(paused.game.engaged,Number(movingWheel),'la pause conserve la roue déjà engagée');
          assert.equal(await aiPage.locator('#app').getAttribute('data-ai-phase'),'paused');
          await aiPage.waitForTimeout(600);
          assert.deepEqual((await aiSaved()).game.angles,paused.game.angles,'aucune rotation IA pendant la pause');
          assert.equal((await aiSaved()).game.turn,paused.game.turn,'aucun tour IA pendant la pause');
          for(const value of ['full','fast']){
            await speed.selectOption(value);
            assert.equal(await aiPage.locator('#app').getAttribute('data-ai-speed'),value,'la vitesse reste réglable depuis la pause IA');
            assert.deepEqual((await aiSaved()).game.angles,paused.game.angles,'changer la vitesse à la pause ne déplace pas les roues');
            assert.equal((await aiSaved()).game.turn,paused.game.turn,'changer la vitesse à la pause ne transmet pas le tour');
          }
          await aiPage.reload();await aiPage.locator('.ai-ready').waitFor();
          assert.equal(await aiPage.locator('.game-board').count(),0,'rechargement du duel sous masque');
          assert.equal(await speed.inputValue(),'fast','la vitesse globale est conservée au rechargement');
          assert.equal(await aiPage.locator('#app').getAttribute('data-ai-speed'),'fast');
          await aiPage.waitForTimeout(600);
          assert.deepEqual((await aiSaved()).game.angles,paused.game.angles,'le rechargement ne relance pas le duel');
          await speed.selectOption('slow');
          await aiPage.locator('[data-action="ai-start"]').click();
          await aiPage.locator('.play.is-ai-play').waitFor();
          assert.deepEqual((await aiSaved()).game.angles,paused.game.angles,'la reprise prépare le coup depuis les angles partiels sauvegardés');
          assert.equal((await aiSaved()).game.engaged,paused.game.engaged,'la reprise garde la même roue engagée');
          await aiPage.locator('#app[data-ai-phase="rotating"]').waitFor({timeout:15000});
          await speed.selectOption('full');
          assert.equal(await aiPage.locator('#app').getAttribute('data-ai-speed'),'full','Full est sélectionnable pendant le mouvement');
          await aiPage.getByRole('button',{name:'Mettre le duel en pause',exact:true}).click();await aiPage.locator('.ai-ready').waitFor();
          assert.equal(await speed.inputValue(),'full','la pause conserve aussi le mode Full');
          const fullPaused=await aiSaved();
          await aiPage.waitForTimeout(150);
          assert.deepEqual((await aiSaved()).game.angles,fullPaused.game.angles,'la pause reste effective après un passage en Full');
          await speed.selectOption('slow');
          assert.deepEqual((await aiSaved()).game.angles,fullPaused.game.angles,'revenir à Lent ne rembobine pas le mouvement accepté en Full');
          await aiPage.locator('[data-action="home"]').click();
          await aiPage.locator('[data-action="new"]').click();
          assert.equal(await speed.inputValue(),'slow','la préparation d’une nouvelle partie conserve la vitesse globale');
          await aiPage.getByRole('button',{name:'Remplacer et commencer',exact:true}).click();
          await aiPage.locator('.play.is-ai-play').waitFor();
          assert.equal(await speed.inputValue(),'slow','le démarrage d’une nouvelle partie ne rétablit pas la vitesse par défaut');
          await aiPage.getByRole('button',{name:'Mettre le duel en pause',exact:true}).click();await aiPage.locator('.ai-ready').waitFor();
          record('deux IA, quatre vitesses modifiables pendant la rotation, Full suspendable et préférence conservée après rechargement');
        }else{
          await aiPage.locator('.play.is-ai-play').waitFor();
          const surface=await aiPage.locator('.play').elementHandle();
          const boardWrap=await aiPage.locator('.board-wrap').elementHandle();
          const assertSameSurface=async()=>{
            assert.equal(await surface.evaluate(node=>node.isConnected),true,'le même écran reste connecté pendant tout le passage de tour');
            assert.equal(await boardWrap.evaluate(node=>node.isConnected),true,'le conteneur du plateau reste en place');
            assert.equal(await aiPage.locator('.play').getAttribute('data-face-index'),String(human),'la face affichée reste celle de l’humain');
            assert.equal(await aiPage.locator('.game-board').count(),1,'une seule projection est présentée');
            assert.match(await aiPage.locator('.game-board').getAttribute('aria-label'),/Plateau de Camille/);
            assert.equal(await aiPage.locator('.handoff,.ai-running,.result').count(),0,'aucun écran de passage ou résultat pendant le tour normal');
          };
          await assertSameSurface();
          assert.match(await aiPage.locator('#rotation-readout').innerText(),/Tour de l’IA · Nova/);
          assert.equal(await aiPage.locator('[data-wheel][aria-disabled="true"][tabindex="-1"]').count(),5,'les cinq roues humaines sont en lecture seule pendant le tour IA');
          assert.equal(await aiPage.locator('[data-action="end"]').isDisabled(),true);
          await speed.selectOption('slow');
          await aiPage.locator('#app[data-ai-phase="rotating"]').waitFor({timeout:15000});
          const movingWheel=await aiPage.locator('[data-wheel][aria-pressed="true"]').getAttribute('data-wheel');
          const rotor=aiPage.locator(`[data-wheel-rotor="${movingWheel}"]`);
          const positions=[];
          for(let attempt=0;attempt<60&&positions.length<3;attempt++){
            await assertSameSurface();
            const transform=await rotor.getAttribute('transform');
            if(!positions.includes(transform))positions.push(transform);
            if(positions.length<3)await aiPage.waitForTimeout(75);
          }
          assert.equal(positions.length,3,'le mouvement IA anime progressivement les roues communes sur la face humaine');
          await speed.selectOption('fast');
          assert.equal(await aiPage.locator('#app').getAttribute('data-ai-speed'),'fast');
          await assertSameSurface();
          const configured=await aiSaved();
          assert.deepEqual(configured.game.players.map(player=>[player.controller,player.level]),[0,1].map(index=>index===human?['human','normal']:['ai','hard']));
          await aiPage.locator('.play:not(.is-ai-play)').waitFor({timeout:30000});
          await assertSameSurface();
          assert.equal(await aiPage.locator('[data-action="identify"]').count(),0,'le retour au joueur humain ne demande aucune validation');
          assert.match(await aiPage.locator('.player-title').innerText(),/Camille/);
          assert.equal(await speed.inputValue(),'fast','la vitesse est également réglable pendant le tour humain d’une partie mixte');
          const humanBeforeSpeed=await aiSaved();
          await speed.selectOption('slow');
          assert.deepEqual((await aiSaved()).game.angles,humanBeforeSpeed.game.angles,'régler les IA ne déplace aucune roue pendant un tour humain');
          assert.equal((await aiSaved()).game.engaged,humanBeforeSpeed.game.engaged);
          const allowed=aiPage.locator('[data-wheel][aria-disabled="false"]').first();
          await allowed.focus();await aiPage.keyboard.press('Enter');
          await aiPage.locator('#rotation-readout').press('ArrowRight');
          assert.equal(await aiPage.locator('[data-action="end"]').isEnabled(),true,'le joueur humain reprend les commandes');
          await aiPage.getByRole('button',{name:'Terminer mon tour',exact:true}).click();
          await aiPage.locator('.play.is-ai-play').waitFor();
          await assertSameSurface();
          assert.equal(await aiPage.locator('[data-wheel][aria-disabled="true"]').count(),5);
          await aiPage.locator('.play:not(.is-ai-play)').waitFor({timeout:30000});
          await assertSameSurface();
          await aiPage.screenshot({path:`output/recette/${type.name()}-humain-face-${human}-contre-ia.png`});
          await aiPage.locator('[data-action="pause"]').click();await aiPage.locator('.handoff').waitFor();
          assert.equal(await aiPage.locator('.game-board').count(),0,'la pause explicite masque le plateau en partie mixte');
          assert.equal(await aiPage.getByRole('button',{name:'Reprendre la partie',exact:true}).count(),1);
          record(`humain sur face ${human}, même plateau animé pendant les tours IA, commandes bloquées et retour direct, pause masquée`);
        }
      }finally{await aiContext.close();}
    }
    assert.deepEqual(errors,[],'aucune erreur JavaScript');
    record('aucune erreur JavaScript');
  }catch(error){
    report.push({browser:type.name(),status:'failed',error:error.message});
    await page.screenshot({path:`output/recette/${type.name()}-echec.png`,fullPage:true});
    console.error(error);process.exitCode=1;
  }finally{await context.close();await browser.close();}
}
await writeFile('output/recette/browser-results.json',JSON.stringify(report,null,2));
