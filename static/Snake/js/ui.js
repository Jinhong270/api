function handlePrimaryAction(){
  if(Game.state === 'idle') startGame();
  else if(Game.state === 'playing') setGameState('paused');
  else if(Game.state === 'paused') setGameState('playing');
  else if(Game.state === 'gameover') startGame();
}

var toastTimer = null;
function showToast(message){
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){
    toastEl.classList.remove('visible');
  }, 1800);
}

function setupModeButtons(){
  modeButtons.forEach(function(btn){
    btn.addEventListener('click', function(){
      if(Game.state === 'playing'){
        showToast(t('toastSpeed'));
        return;
      }
      var speed = parseInt(btn.dataset.speed, 10);
      setSpeed(speed, true);
      if(isTouchDevice) btn.blur();
    });
  });
}

function setupSwatches(){
  swatchEls.forEach(function(swatch){
    swatch.addEventListener('click', function(){
      setBgColor(swatch.dataset.color, true);
      if(isTouchDevice) swatch.blur();
    });
  });
}

function applyDpadVisible(showing, persist){
  dpadEl.classList.toggle('visible', showing);
  appEl.classList.toggle('dpad-on', showing);
  stageEl.classList.toggle('with-dpad', showing);
  toggleDpadBtn.setAttribute('aria-pressed', showing ? 'true' : 'false');
  toggleDpadBtn.setAttribute('aria-label', showing ? t('hideDpad') : t('showDpad'));
  if(persist) saveSettings({dpad: showing});
  scheduleResize();
}

function initDpadVisibility(){
  var showing = Game.dpadPreference === null ? !!isTouchDevice : Game.dpadPreference;
  applyDpadVisible(showing, false);
}

function setupButtons(){
  startBtn.addEventListener('click', function(e){
    e.stopPropagation();
    startGame();
  });
  restartFromOverBtn.addEventListener('click', function(e){
    e.stopPropagation();
    startGame();
  });
  restartBtn.addEventListener('click', function(){
    startGame();
    if(isTouchDevice) restartBtn.blur();
  });
  pauseBtn.addEventListener('click', function(){
    if(Game.state === 'playing') setGameState('paused');
    else if(Game.state === 'paused') setGameState('playing');
    if(isTouchDevice) pauseBtn.blur();
  });
  toggleDpadBtn.addEventListener('click', function(){
    applyDpadVisible(!dpadEl.classList.contains('visible'), true);
    if(isTouchDevice) toggleDpadBtn.blur();
  });
}

function setupHint(){
  var canFull = fullscreenBtn && !fullscreenBtn.hidden;
  if(isTouchDevice){
    hintEl.textContent = t('hintTouch');
    idleHintEl.textContent = t('idleHintTouch');
    pausedHintEl.textContent = t('pausedHintTouch');
  }else{
    hintEl.textContent = canFull ? t('hintDesktopFull') : t('hintDesktop');
    idleHintEl.textContent = t('idleHintDesktop');
    pausedHintEl.textContent = t('pausedHintDesktop');
  }
}

function fullscreenSupported(){
  var el = document.documentElement;
  var req = el.requestFullscreen || el.webkitRequestFullscreen;
  if(!req) return false;
  if(document.fullscreenEnabled === false || document.webkitFullscreenEnabled === false) return false;
  return true;
}

function toggleFullscreen(){
  var el = document.documentElement;
  if(document.fullscreenElement || document.webkitFullscreenElement){
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if(exit) exit.call(document);
    return;
  }
  var req = el.requestFullscreen || el.webkitRequestFullscreen;
  if(!req) return;
  var result = req.call(el);
  if(result && result.catch) result.catch(function(){});
}

function syncFullscreenIcon(){
  var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  fullscreenBtn.classList.toggle('is-active', on);
  fullscreenBtn.setAttribute('aria-label', on ? t('exitFullscreen') : t('fullscreen'));
}

function setupFullscreen(){
  if(!fullscreenSupported()) return;
  fullscreenBtn.hidden = false;
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', function(){
    syncFullscreenIcon();
    scheduleResize();
  });
  document.addEventListener('webkitfullscreenchange', function(){
    syncFullscreenIcon();
    scheduleResize();
  });
}

function setupVisibility(){
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      if(Game.state === 'playing') setGameState('paused');
      return;
    }
    syncWakeLock();
    syncAppViewport();
  });
}
