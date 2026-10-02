var Game = {
  state: 'idle',
  snake: [],
  prevSnake: [],
  dir: {x:1, y:0},
  inputQueue: [],
  food: null,
  score: 0,
  moveInterval: 130,
  lastMoveTime: 0,
  particles: [],
  bestScores: {},
  bgColor: '#0b0b0b',
  wakeLock: null,
  dpadPreference: null
};

function loadBestScores(){
  try{
    var raw = localStorage.getItem(BEST_SCORES_KEY);
    Game.bestScores = raw ? JSON.parse(raw) : {};
  }catch(e){
    Game.bestScores = {};
  }
}

function loadSettings(){
  try{
    var raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    return {};
  }
}

function saveSettings(partial){
  var current = loadSettings();
  var keys = Object.keys(partial);
  for(var i = 0; i < keys.length; i++) current[keys[i]] = partial[keys[i]];
  try{
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
  }catch(e){}
}

function getBestScore(interval){
  return Game.bestScores[interval] || 0;
}

function saveBestScoreIfNeeded(){
  var key = Game.moveInterval;
  var current = Game.bestScores[key] || 0;
  if(Game.score > current){
    Game.bestScores[key] = Game.score;
    try{
      localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(Game.bestScores));
    }catch(e){}
    return true;
  }
  return false;
}

function updateScoreDisplay(animate){
  currentScoreEl.textContent = Game.score;
  if(!animate) return;
  currentScoreEl.classList.remove('bump');
  void currentScoreEl.offsetWidth;
  currentScoreEl.classList.add('bump');
}

function updateBestDisplay(){
  bestScoreEl.textContent = getBestScore(Game.moveInterval);
}

function setSpeed(interval, persist){
  Game.moveInterval = interval;
  modeButtons.forEach(function(btn){
    var speed = parseInt(btn.dataset.speed, 10);
    btn.classList.toggle('active', speed === interval);
    btn.setAttribute('aria-pressed', speed === interval ? 'true' : 'false');
  });
  updateBestDisplay();
  if(persist) saveSettings({speed: interval});
}

function setBgColor(color, persist){
  var matched = false;
  swatchEls.forEach(function(s){
    var on = s.dataset.color === color;
    if(on) matched = true;
    s.classList.toggle('active', on);
    s.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if(!matched) return false;
  Game.bgColor = color;
  if(persist) saveSettings({bg: color});
  if(typeof draw === 'function' && Renderer.boardSize) draw(performance.now());
  return true;
}

function applySavedSettings(){
  var settings = loadSettings();
  var speed = parseInt(settings.speed, 10);
  if(SPEED_STEPS.indexOf(speed) === -1) speed = 130;
  setSpeed(speed, false);
  if(!settings.bg || !setBgColor(settings.bg, false)) setBgColor(Game.bgColor, false);
  Game.dpadPreference = typeof settings.dpad === 'boolean' ? settings.dpad : null;
}

function vibrate(ms){
  try{
    if(navigator.vibrate) navigator.vibrate(ms);
  }catch(e){}
}

function cloneSeg(seg){
  return {x:seg.x, y:seg.y};
}

function clearInputQueue(){
  Game.inputQueue.length = 0;
}

function getFacing(){
  if(Game.inputQueue.length) return Game.inputQueue[0];
  return Game.dir;
}

function buildInitialSnake(){
  var startX = Math.floor(COLS / 4);
  var startY = Math.floor(ROWS / 2);
  return [
    {x:startX + 2, y:startY},
    {x:startX + 1, y:startY},
    {x:startX, y:startY}
  ];
}

function showIdlePreview(){
  Game.snake = buildInitialSnake();
  Game.prevSnake = Game.snake.map(cloneSeg);
  Game.dir = {x:1, y:0};
  clearInputQueue();
  Game.food = {x: Math.min(COLS - 2, Math.floor(COLS * 0.72)), y: Math.floor(ROWS / 2)};
  Game.particles = [];
}

function spawnFood(){
  var occupied = {};
  Game.snake.forEach(function(seg){
    occupied[seg.x + ',' + seg.y] = true;
  });
  var free = [];
  for(var x = 0; x < COLS; x++){
    for(var y = 0; y < ROWS; y++){
      if(!occupied[x + ',' + y]) free.push({x:x, y:y});
    }
  }
  if(free.length === 0){
    endGame();
    return;
  }
  Game.food = free[Math.floor(Math.random() * free.length)];
}

function spawnParticles(x, y){
  var cell = Renderer.cellSize || 20;
  var originX = x * cell + cell / 2;
  var originY = y * cell + cell / 2;
  for(var i = 0; i < 8; i++){
    var angle = (Math.PI * 2 / 8) * i + Math.random() * 0.4;
    var speed = cell * (0.045 + Math.random() * 0.07);
    Game.particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.018 + Math.random() * 0.02,
      size: cell * (0.08 + Math.random() * 0.08)
    });
  }
}

function updateParticles(dt){
  var factor = (dt || 16.67) / 16.67;
  for(var i = Game.particles.length - 1; i >= 0; i--){
    var p = Game.particles[i];
    p.x += p.vx * factor;
    p.y += p.vy * factor;
    p.life -= p.decay * factor;
    if(p.life <= 0) Game.particles.splice(i, 1);
  }
}

function isOutOfBounds(pos){
  return pos.x < 0 || pos.x >= COLS || pos.y < 0 || pos.y >= ROWS;
}

function hitsSelf(pos, willEat){
  var limit = Game.snake.length - (willEat ? 0 : 1);
  for(var i = 0; i < limit; i++){
    if(Game.snake[i].x === pos.x && Game.snake[i].y === pos.y) return true;
  }
  return false;
}

function setDirection(dx, dy, fromTouch){
  if(Game.state !== 'playing') return;
  if(dx !== 0 && dy !== 0) return;
  if(dx === 0 && dy === 0) return;
  var pending = Game.inputQueue;
  var ref = pending.length ? pending[pending.length - 1] : Game.dir;
  if(dx === ref.x && dy === ref.y) return;
  if(dx === -ref.x && dy === -ref.y) return;
  if(pending.length >= 2){
    var base = pending[0];
    if(dx === -base.x && dy === -base.y) return;
    pending[1] = {x:dx, y:dy};
  }else{
    pending.push({x:dx, y:dy});
  }
  if(fromTouch) vibrate(6);
}

function applyQueuedDirection(){
  while(Game.inputQueue.length){
    var next = Game.inputQueue.shift();
    var reverse = next.x === -Game.dir.x && next.y === -Game.dir.y;
    if(reverse && Game.snake.length > 1) continue;
    Game.dir = next;
    return;
  }
}

function step(){
  if(Game.state !== 'playing') return;
  applyQueuedDirection();
  Game.prevSnake = Game.snake.map(cloneSeg);
  var head = Game.snake[0];
  var newHead = {x: head.x + Game.dir.x, y: head.y + Game.dir.y};
  var willEat = !!(Game.food && newHead.x === Game.food.x && newHead.y === Game.food.y);
  if(isOutOfBounds(newHead) || hitsSelf(newHead, willEat)){
    endGame();
    return;
  }
  Game.snake.unshift(newHead);
  if(willEat){
    Game.score += 10;
    updateScoreDisplay(true);
    spawnParticles(Game.food.x, Game.food.y);
    spawnFood();
    vibrate(12);
    if(Game.state !== 'playing') return;
  }else{
    Game.snake.pop();
  }
}

function syncWakeLock(){
  if(!navigator.wakeLock) return;
  if(Game.state === 'playing'){
    if(Game.wakeLock) return;
    navigator.wakeLock.request('screen').then(function(lock){
      if(Game.state !== 'playing'){
        lock.release().catch(function(){});
        return;
      }
      Game.wakeLock = lock;
      lock.addEventListener('release', function(){
        if(Game.wakeLock === lock) Game.wakeLock = null;
      });
    }).catch(function(){});
    return;
  }
  if(!Game.wakeLock) return;
  var lock = Game.wakeLock;
  Game.wakeLock = null;
  lock.release().catch(function(){});
}

function endGame(){
  var isNewBest = saveBestScoreIfNeeded();
  if(Game.snake.length) spawnParticles(Game.snake[0].x, Game.snake[0].y);
  finalScoreEl.textContent = Game.score;
  newBestBadge.classList.toggle('visible', isNewBest);
  updateBestDisplay();
  vibrate(60);
  setGameState('gameover');
}

function startGame(){
  clearInputQueue();
  Game.snake = buildInitialSnake();
  Game.prevSnake = Game.snake.map(cloneSeg);
  Game.dir = {x:1, y:0};
  Game.score = 0;
  Game.particles = [];
  updateScoreDisplay(false);
  spawnFood();
  Game.lastMoveTime = performance.now();
  setGameState('playing');
}

function setGameState(next){
  var prev = Game.state;
  Game.state = next;
  if(next !== 'playing') clearInputQueue();
  if(next === 'playing' && (prev === 'paused' || prev === 'idle' || prev === 'gameover')){
    Game.lastMoveTime = performance.now();
  }
  renderState(next);
  syncWakeLock();
}

function renderState(state){
  overlayIdle.classList.toggle('visible', state === 'idle');
  overlayPaused.classList.toggle('visible', state === 'paused');
  overlayGameOver.classList.toggle('visible', state === 'gameover');
  pauseBtn.disabled = state === 'idle' || state === 'gameover';
  pauseBtn.classList.toggle('is-resume', state === 'paused');
  pauseBtn.querySelector('.btn-label').textContent = state === 'paused' ? t('resume') : t('pause');
  restartBtn.textContent = state === 'idle' ? t('start') : t('restart');
  dpadEl.classList.toggle('is-live', state === 'playing');
  var centerLabel = t('dpadStart');
  if(state === 'playing') centerLabel = t('dpadPause');
  else if(state === 'paused') centerLabel = t('dpadResume');
  else if(state === 'gameover') centerLabel = t('dpadRestart');
  dpadCenterBtn.setAttribute('aria-label', centerLabel);
  modeButtons.forEach(function(btn){
    var locked = state === 'playing';
    btn.classList.toggle('is-locked', locked);
    btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
  });
  if(state === 'playing' || state === 'paused') document.title = t('docTitleScore').replace('{score}', String(Game.score));
  else document.title = t('docTitle');
}
