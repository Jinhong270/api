const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOVE_ANIMATION_MS = REDUCED_MOTION ? 0 : 120;

let tiles = [];
let nextTileId = 1;
let score = 0;
let best = 0;
let inputLocked = false;
let pendingMoveTimeout = null;
let cachedCellMetrics = null;

const tileElements = new Map();

function createTileObject(r, c, value) {
    return { id: nextTileId++, r, c, value };
}

function getEmptyCells() {
    const occupied = new Set(tiles.map(t => `${t.r},${t.c}`));
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (!occupied.has(`${r},${c}`)) cells.push({ r, c });
        }
    }
    return cells;
}

function addRandomTile() {
    const emptyCells = getEmptyCells();
    if (emptyCells.length === 0) return null;
    const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    const tile = createTileObject(r, c, value);
    tiles.push(tile);
    return tile;
}

function getCurrentMaxValue() {
    let max = 0;
    for (const tile of tiles) if (tile.value > max) max = tile.value;
    return max;
}

function invalidateCellMetrics() {
    cachedCellMetrics = null;
}

function getCellMetrics() {
    if (cachedCellMetrics) return cachedCellMetrics;
    const boardEl = document.getElementById('board');
    const styles = getComputedStyle(boardEl);
    const size = parseFloat(styles.getPropertyValue('--cell-size')) || 100;
    const gap = parseFloat(styles.getPropertyValue('--cell-gap')) || 12;
    cachedCellMetrics = { size, gap };
    return cachedCellMetrics;
}

function getTilePixelPosition(r, c) {
    const { size, gap } = getCellMetrics();
    return { x: c * (size + gap), y: r * (size + gap) };
}

function updateTileTransform(el, tile) {
    const { x, y } = getTilePixelPosition(tile.r, tile.c);
    el.style.transform = `translate(${x}px, ${y}px)`;
}

function placeTileInstantly(el, tile) {
    el.style.transition = 'none';
    updateTileTransform(el, tile);
    void el.offsetWidth;
    el.style.transition = '';
}

function renderTile(tile, isNew) {
    const layer = document.getElementById('tilesLayer');
    const { size } = getCellMetrics();

    const outer = document.createElement('div');
    outer.className = 'tile';
    outer.style.width = `${size}px`;
    outer.style.height = `${size}px`;

    const inner = document.createElement('div');
    inner.className = `tile-inner tile-${tile.value}`;
    inner.textContent = String(tile.value);
    if (isNew) inner.classList.add('pop-in');

    outer.appendChild(inner);
    layer.appendChild(outer);
    tileElements.set(tile.id, outer);
    placeTileInstantly(outer, tile);
}

function updateTileValue(el, value) {
    const inner = el.querySelector('.tile-inner');
    inner.className = `tile-inner tile-${value}`;
    inner.textContent = String(value);
    void inner.offsetWidth;
    inner.classList.add('merge-pop');
}

function removeTileElement(id) {
    const el = tileElements.get(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    tileElements.delete(id);
}

function clearTileElements() {
    const layer = document.getElementById('tilesLayer');
    layer.innerHTML = '';
    tileElements.clear();
}

function repositionAllTiles() {
    invalidateCellMetrics();
    const { size } = getCellMetrics();
    for (const tile of tiles) {
        const el = tileElements.get(tile.id);
        if (!el) continue;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        placeTileInstantly(el, tile);
    }
}

function createGridCells() {
    const gridEl = document.getElementById('grid');
    gridEl.innerHTML = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        gridEl.appendChild(cell);
    }
}

function initBoard() {
    if (pendingMoveTimeout !== null) {
        clearTimeout(pendingMoveTimeout);
        pendingMoveTimeout = null;
    }
    tiles = [];
    score = 0;
    best = loadBestScore();
    gameOver = false;
    winNotified = false;
    inputLocked = false;
    clearTileElements();
    invalidateCellMetrics();
    addRandomTile();
    addRandomTile();
    for (const tile of tiles) renderTile(tile, true);
    updateScoreDisplay(score, best);
    hideAllDialogs();
}

function applyScoreGain(amount) {
    if (amount <= 0) return;
    score += amount;
    if (score > best) {
        best = score;
        persistBestScore(best);
    }
    updateScoreDisplay(score, best);
    showScoreGain(amount);
}

function move(direction) {
    if (gameOver || dialogOpen || inputLocked) return;
    const result = performMove(direction, tiles);
    if (!result.moved) {
        checkAndShowGameOver();
        return;
    }
    inputLocked = true;
    applyScoreGain(result.gained);
    animateMove(result);
}

function animateMove(result) {
    for (const tile of tiles) {
        const el = tileElements.get(tile.id);
        if (el) updateTileTransform(el, tile);
    }

    pendingMoveTimeout = window.setTimeout(() => {
        pendingMoveTimeout = null;

        for (const id of result.removedIds) removeTileElement(id);
        tiles = tiles.filter(t => !result.removedIds.includes(t.id));

        for (const id of result.mergedIds) {
            const tile = tiles.find(t => t.id === id);
            const el = tileElements.get(id);
            if (tile && el) updateTileValue(el, tile.value);
        }

        const newTile = addRandomTile();
        if (newTile) renderTile(newTile, true);

        inputLocked = false;
        finalizeAfterMove();
    }, MOVE_ANIMATION_MS);
}

function finalizeAfterMove() {
    const maxValue = getCurrentMaxValue();
    if (maxValue >= 2048 && !winNotified && !gameOver) {
        winNotified = true;
        showWinDialog();
        return;
    }
    if (!gameOver && isGameOver(buildValueGrid(tiles))) {
        gameOver = true;
        showGameOverDialog();
    }
}

function checkAndShowGameOver() {
    if (!gameOver && !dialogOpen && isGameOver(buildValueGrid(tiles))) {
        gameOver = true;
        showGameOverDialog();
    }
}
