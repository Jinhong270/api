function setupDpad(){
  dpadButtons.forEach(function(btn){
    btn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      if(Game.state === 'idle' || Game.state === 'gameover') startGame();
      else if(Game.state === 'paused') setGameState('playing');
      var dir = btn.dataset.dir;
      if(dir === 'up') setDirection(0, -1, true);
      else if(dir === 'down') setDirection(0, 1, true);
      else if(dir === 'left') setDirection(-1, 0, true);
      else if(dir === 'right') setDirection(1, 0, true);
    });
  });
  dpadCenterBtn.addEventListener('pointerdown', function(e){
    e.preventDefault();
    e.stopPropagation();
    handlePrimaryAction();
  });
  dpadEl.addEventListener('contextmenu', function(e){ e.preventDefault(); });
}

function setupPointerControls(){
  var pointerStart = null;
  var threshold = isTouchDevice ? 24 : 10;

  canvasFrameEl.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  canvasFrameEl.addEventListener('pointerdown', function(e){
    if(e.target.closest('button')) return;
    pointerStart = {x:e.clientX, y:e.clientY, id:e.pointerId};
    try{ canvasFrameEl.setPointerCapture(e.pointerId); }catch(err){}
  });
  canvasFrameEl.addEventListener('pointerup', function(e){
    if(!pointerStart || pointerStart.id !== e.pointerId){
      pointerStart = null;
      return;
    }
    var dx = e.clientX - pointerStart.x;
    var dy = e.clientY - pointerStart.y;
    var dist = Math.max(Math.abs(dx), Math.abs(dy));
    pointerStart = null;
    if(dist < threshold){
      handlePrimaryAction();
      return;
    }
    if(Game.state === 'idle' || Game.state === 'gameover') startGame();
    else if(Game.state === 'paused') setGameState('playing');
    if(Game.state !== 'playing') return;
    if(Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 1 : -1, 0, true);
    else setDirection(0, dy > 0 ? 1 : -1, true);
  });
  canvasFrameEl.addEventListener('pointercancel', function(){
    pointerStart = null;
  });
}

function setupKeyboard(){
  var navKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '];
  document.addEventListener('keydown', function(e){
    var lower = e.key.toLowerCase();
    var onButton = e.target && e.target.closest && e.target.closest('button');
    if((lower === ' ' || lower === 'enter') && onButton) return;
    if(navKeys.indexOf(lower) !== -1) e.preventDefault();
    if(e.repeat) return;
    if(lower === ' ' || lower === 'enter'){
      handlePrimaryAction();
      return;
    }
    if(e.key === 'Escape'){
      if(document.fullscreenElement || document.webkitFullscreenElement) return;
      if(Game.state === 'playing') setGameState('paused');
      return;
    }
    if(lower === 'f'){
      if(fullscreenBtn && !fullscreenBtn.hidden) toggleFullscreen();
      return;
    }
    if(Game.state !== 'playing') return;
    if(lower === 'arrowup' || lower === 'w') setDirection(0, -1, false);
    else if(lower === 'arrowdown' || lower === 's') setDirection(0, 1, false);
    else if(lower === 'arrowleft' || lower === 'a') setDirection(-1, 0, false);
    else if(lower === 'arrowright' || lower === 'd') setDirection(1, 0, false);
  });
}
