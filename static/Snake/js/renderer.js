var Renderer = {
  boardSize: 0,
  cellSize: 20,
  dpr: 1,
  sizeDevice: 0
};

function drawRoundedRect(x, y, w, h, radius){
  radius = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function getInterpolatedSnake(t){
  var prev = Game.prevSnake;
  var curr = Game.snake;
  if(t >= 1 || prev.length === 0) return curr;
  var result = new Array(curr.length);
  for(var i = 0; i < curr.length; i++){
    var from = i < prev.length ? prev[i] : prev[prev.length - 1];
    var to = curr[i];
    result[i] = {x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t};
  }
  return result;
}

function drawGrid(size, grid){
  var hair = 1 / (Renderer.dpr || 1);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for(var gx = 1; gx < COLS; gx++) ctx.fillRect(gx * grid, 0, hair, size);
  for(var gy = 1; gy < ROWS; gy++) ctx.fillRect(0, gy * grid, size, hair);
}

function drawVignette(size){
  var g = ctx.createRadialGradient(size / 2, size / 2, size * 0.34, size / 2, size / 2, size * 0.74);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function draw(ts){
  var size = Renderer.boardSize;
  var grid = Renderer.cellSize;
  if(!size || !grid) return;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = Game.bgColor;
  ctx.fillRect(0, 0, size, size);
  drawGrid(size, grid);
  drawVignette(size);

  if(!Game.snake.length) return;
  if(Game.food && (Game.state === 'playing' || Game.state === 'paused' || Game.state === 'gameover' || Game.state === 'idle')){
    var pulse = 0.65 + 0.35 * Math.sin(ts / 240);
    var fx = Game.food.x * grid;
    var fy = Game.food.y * grid;
    var pad = grid * 0.16;
    ctx.save();
    ctx.shadowColor = 'rgba(255,122,89,' + (0.35 + 0.35 * pulse) + ')';
    ctx.shadowBlur = Math.min(28, grid * 0.55);
    ctx.fillStyle = '#ff7a59';
    drawRoundedRect(fx + pad, fy + pad, grid - pad * 2, grid - pad * 2, (grid - pad * 2) / 3.2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,214,199,0.75)';
    var innerPad = grid * 0.34;
    ctx.beginPath();
    ctx.arc(fx + innerPad + (grid - innerPad * 2) / 2, fy + innerPad, Math.max(0.6, (grid - innerPad * 2) / 2.6), 0, Math.PI * 2);
    ctx.fill();
  }

  var t = 1;
  if(Game.state === 'playing' && !reduceMotionQuery.matches){
    t = clamp((ts - Game.lastMoveTime) / Game.moveInterval, 0, 1);
  }
  var renderSnake = getInterpolatedSnake(t);
  var total = renderSnake.length;
  for(var idx = total - 1; idx >= 0; idx--){
    var seg = renderSnake[idx];
    var sx = seg.x * grid;
    var sy = seg.y * grid;
    var isHead = idx === 0;
    var ratio = total > 1 ? idx / (total - 1) : 0;
    var color = mixColor('#5fe89a', '#155c3b', ratio);
    ctx.save();
    if(isHead){
      ctx.shadowColor = 'rgba(95,232,154,0.65)';
      ctx.shadowBlur = Math.min(24, grid * 0.5);
    }
    ctx.fillStyle = color;
    var segPad = grid * (isHead ? 0.045 : 0.07);
    drawRoundedRect(sx + segPad, sy + segPad, grid - segPad * 2, grid - segPad * 2, grid * (isHead ? 0.34 : 0.26));
    ctx.fill();
    ctx.restore();
    if(isHead && grid >= 10) drawEyes(sx, sy, grid);
  }

  Game.particles.forEach(function(p){
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = '#ffcb80';
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, p.size), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawEyes(sx, sy, grid){
  var dir = getFacing();
  var cx = sx + grid / 2;
  var cy = sy + grid / 2;
  var offset = grid * 0.18;
  var perpX = -dir.y;
  var perpY = dir.x;
  var forwardX = dir.x * grid * 0.14;
  var forwardY = dir.y * grid * 0.14;
  var eyeR = Math.max(0.7, grid * 0.09);
  var eye1x = cx + forwardX + perpX * offset;
  var eye1y = cy + forwardY + perpY * offset;
  var eye2x = cx + forwardX - perpX * offset;
  var eye2y = cy + forwardY - perpY * offset;
  ctx.fillStyle = '#04140c';
  ctx.beginPath();
  ctx.arc(eye1x, eye1y, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eye2x, eye2y, eyeR, 0, Math.PI * 2);
  ctx.fill();
  if(grid < 16) return;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(eye1x - eyeR * 0.28, eye1y - eyeR * 0.28, eyeR * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eye2x - eyeR * 0.28, eye2y - eyeR * 0.28, eyeR * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

function mixColor(hexA, hexB, ratio){
  var a = hexToRgb(hexA);
  var b = hexToRgb(hexB);
  var r = Math.round(a.r + (b.r - a.r) * ratio);
  var g = Math.round(a.g + (b.g - a.g) * ratio);
  var bl = Math.round(a.b + (b.b - a.b) * ratio);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

function hexToRgb(hex){
  var v = hex.replace('#', '');
  return {
    r: parseInt(v.substring(0, 2), 16),
    g: parseInt(v.substring(2, 4), 16),
    b: parseInt(v.substring(4, 6), 16)
  };
}

function syncLayoutMode(){
  var show = dpadEl.classList.contains('visible');
  stageEl.classList.toggle('with-dpad', show);
  if(!show){
    stageEl.classList.remove('dpad-side');
    return;
  }
  var stageRect = stageEl.getBoundingClientRect();
  var dpadRect = dpadEl.getBoundingClientRect();
  var gap = parseFloat(getComputedStyle(stageEl).gap) || 0;
  var dW = dpadRect.width;
  var dH = dpadRect.height;
  if(stageRect.width < 8 || stageRect.height < 8 || dW < 8 || dH < 8) return;
  var bottomSquare = Math.min(stageRect.width, stageRect.height - dH - gap);
  var sideSquare = Math.min(stageRect.width - dW - gap, stageRect.height);
  stageEl.classList.toggle('dpad-side', sideSquare > bottomSquare + 4);
}

function resizeCanvas(){
  syncLayoutMode();
  var stageRect = stageEl.getBoundingClientRect();
  if(stageRect.width < 16 || stageRect.height < 16) return;
  var gap = 0;
  var usedW = 0;
  var usedH = 0;
  if(stageEl.classList.contains('with-dpad')){
    var dpadRect = dpadEl.getBoundingClientRect();
    gap = parseFloat(getComputedStyle(stageEl).gap) || 0;
    if(stageEl.classList.contains('dpad-side')) usedW = dpadRect.width + gap;
    else usedH = dpadRect.height + gap;
  }
  var availW = Math.max(0, stageRect.width - usedW - 2);
  var availH = Math.max(0, stageRect.height - usedH - 2);
  if(availW < 16 || availH < 16) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 3);
  var maxCss = Math.min(availW, availH, MAX_CANVAS_SIZE);
  var cellDevice = Math.max(1, Math.floor((maxCss * dpr) / COLS));
  var sizeDevice = cellDevice * COLS;
  var size = sizeDevice / dpr;
  if(size > maxCss){
    cellDevice = Math.max(1, cellDevice - 1);
    sizeDevice = cellDevice * COLS;
    size = sizeDevice / dpr;
  }
  if(Renderer.sizeDevice === sizeDevice && Renderer.dpr === dpr) return;

  Renderer.sizeDevice = sizeDevice;
  Renderer.boardSize = size;
  Renderer.cellSize = size / COLS;
  Renderer.dpr = dpr;
  canvasFrameEl.style.width = size + 'px';
  canvasFrameEl.style.height = size + 'px';
  canvasEl.style.width = size + 'px';
  canvasEl.style.height = size + 'px';
  canvasEl.width = sizeDevice;
  canvasEl.height = sizeDevice;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(performance.now());
}

var resizeScheduled = false;
function scheduleResize(){
  if(resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(function(){
    resizeScheduled = false;
    resizeCanvas();
  });
}

function syncAppViewport(){
  var vv = window.visualViewport;
  if(vv){
    appEl.style.top = vv.offsetTop + 'px';
    appEl.style.left = vv.offsetLeft + 'px';
    appEl.style.width = vv.width + 'px';
    appEl.style.height = vv.height + 'px';
  }else{
    appEl.style.top = '0px';
    appEl.style.left = '0px';
    appEl.style.width = window.innerWidth + 'px';
    appEl.style.height = window.innerHeight + 'px';
  }
  scheduleResize();
}

function setupViewport(){
  syncAppViewport();
  window.addEventListener('resize', syncAppViewport);
  window.addEventListener('orientationchange', function(){
    setTimeout(syncAppViewport, 60);
    setTimeout(syncAppViewport, 240);
  });
  window.addEventListener('pageshow', syncAppViewport);
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', syncAppViewport);
    window.visualViewport.addEventListener('scroll', syncAppViewport);
  }
}

function setupResize(){
  if(typeof ResizeObserver !== 'function') return;
  var observer = new ResizeObserver(function(){
    scheduleResize();
  });
  observer.observe(appEl);
  observer.observe(stageEl);
}
