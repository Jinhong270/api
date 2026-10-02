const BEST_SCORE_KEY = '2048_best_score';

let gameOver = false;
let winNotified = false;
let dialogOpen = false;

const scoreValueEl = document.getElementById('scoreValue');
const bestValueEl = document.getElementById('bestValue');
const winModal = document.getElementById('winModal');
const gameOverModal = document.getElementById('gameOverModal');
const liveRegion = document.getElementById('liveRegion');

function hideAllDialogs() {
    winModal.style.display = 'none';
    gameOverModal.style.display = 'none';
    dialogOpen = false;
}

function showWinDialog() {
    dialogOpen = true;
    winModal.style.display = 'flex';
    announce('恭喜！你达到了2048！');
}

function showGameOverDialog() {
    dialogOpen = true;
    gameOverModal.style.display = 'flex';
    announce('游戏结束，没有可移动的格子了');
}

function announce(message) {
    liveRegion.textContent = message;
}

function loadBestScore() {
    try {
        const saved = localStorage.getItem(BEST_SCORE_KEY);
        const parsed = saved ? parseInt(saved, 10) : 0;
        return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
        return 0;
    }
}

function persistBestScore(value) {
    try {
        localStorage.setItem(BEST_SCORE_KEY, String(value));
    } catch (error) {
        return;
    }
}

function updateScoreDisplay(scoreValue, bestValue) {
    scoreValueEl.textContent = scoreValue;
    bestValueEl.textContent = bestValue;
    scoreValueEl.classList.remove('score-pulse');
    void scoreValueEl.offsetWidth;
    scoreValueEl.classList.add('score-pulse');
}

function showScoreGain(amount) {
    const box = scoreValueEl.closest('.score-box');
    const indicator = document.createElement('div');
    indicator.className = 'score-gain';
    indicator.textContent = `+${amount}`;
    box.appendChild(indicator);
    indicator.addEventListener('animationend', () => indicator.remove());
}

let touchStartX = 0;
let touchStartY = 0;

function initTouchSupport() {
    document.addEventListener('touchstart', (e) => {
        if (dialogOpen) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (dialogOpen) return;
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (dialogOpen) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const minSwipe = 30;

        if (Math.max(absDx, absDy) < minSwipe) return;

        if (absDx > absDy) {
            move(dx > 0 ? 'right' : 'left');
        } else {
            move(dy > 0 ? 'down' : 'up');
        }
    }, { passive: true });
}

function initEventListeners() {
    document.getElementById('continueBtn').addEventListener('click', () => {
        hideAllDialogs();
        if (!gameOver && isGameOver(buildValueGrid(tiles))) {
            gameOver = true;
            showGameOverDialog();
        }
    });

    document.getElementById('newGameFromWinBtn').addEventListener('click', () => {
        initBoard();
        hideAllDialogs();
    });

    document.getElementById('newGameFromOverBtn').addEventListener('click', () => {
        initBoard();
        hideAllDialogs();
    });

    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', () => move(btn.dataset.dir));
    });

    document.getElementById('resetBtn').addEventListener('click', initBoard);

    window.addEventListener('keydown', (e) => {
        if (dialogOpen) {
            e.preventDefault();
            return;
        }
        const key = e.key;
        if (key === 'ArrowUp' || key === 'w' || key === 'W') { e.preventDefault(); move('up'); }
        else if (key === 'ArrowDown' || key === 's' || key === 'S') { e.preventDefault(); move('down'); }
        else if (key === 'ArrowLeft' || key === 'a' || key === 'A') { e.preventDefault(); move('left'); }
        else if (key === 'ArrowRight' || key === 'd' || key === 'D') { e.preventDefault(); move('right'); }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(repositionAllTiles, 150);
    });

    initTouchSupport();
}
