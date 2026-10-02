var animationId = null;
var lastFrame = 0;

function frame(ts){
  var dt = lastFrame ? Math.min(48, ts - lastFrame) : 16.67;
  lastFrame = ts;
  if(Game.state === 'playing'){
    if(ts - Game.lastMoveTime >= Game.moveInterval){
      step();
      Game.lastMoveTime = ts;
    }
  }
  if(Game.state === 'playing' || Game.state === 'gameover'){
    if(Game.particles.length) updateParticles(dt);
  }
  draw(ts);
  animationId = requestAnimationFrame(frame);
}

function init(){
  loadBestScores();
  applySavedSettings();
  initDpadVisibility();
  setupModeButtons();
  setupSwatches();
  setupButtons();
  setupDpad();
  setupPointerControls();
  setupKeyboard();
  setupFullscreen();
  setupHint();
  setupVisibility();
  setupResize();
  setupViewport();
  showIdlePreview();
  setGameState('idle');
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);
  animationId = requestAnimationFrame(frame);
}

init();
