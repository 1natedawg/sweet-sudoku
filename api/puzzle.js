export default async function handler(req, res) {
    const { game = 'sudoku', difficulty = 'medium' } = req.query;
    console.log(`[API Generator] Request received for game: '${game}', difficulty: '${difficulty}'`);

    if (game === 'sudoku') {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            console.warn('[API Generator] API_KEY not configured. Falling back to local mock Sudoku.');
            return res.status(500).json({ error: 'API key is not configured on the server.' });
        }

        try {
            console.log(`[API Generator] Fetching Sudoku from external service (Difficulty: ${difficulty})`);
            const apiResponse = await fetch(`https://api.api-ninjas.com/v1/sudokugenerate?difficulty=${difficulty}`, {
                headers: { 'X-Api-Key': apiKey }
            });

            const data = await apiResponse.json();
            if (!apiResponse.ok) {
                throw new Error(data.error || 'Failed to fetch from API Ninjas');
            }

            console.log('[API Generator] Successfully retrieved Sudoku puzzle.');
            return res.status(200).json(data);
        } catch (error) {
            console.error('[API Generator] Sudoku proxy error:', error);
            return res.status(500).json({ error: 'Internal server error while fetching Sudoku puzzle.' });
        }
    }

    else if (game === 'tango') {
        // Determine grid size based on difficulty/size param (default 6x6, scaling up to 14x14)
        const sizeParam = parseInt(req.query.size) || 6;
        const size = Math.max(6, Math.min(14, sizeParam));
        const density = parseInt(req.query.density) || 30; // Default density percentage for Tango puzzle
        console.log(`[API Generator] Generating Tango puzzle for size ${size}x${size} (${difficulty}), density ${density}%...`);

        try {
            const puzzle = generateServerTango(size, difficulty, density);
            console.log('[API Generator] Tango puzzle generated successfully.');
            return res.status(200).json(puzzle);
        } catch (err) {
            console.error('[API Generator] Tango generation error:', err);
            return res.status(500).json({ error: 'Failed to generate Tango puzzle.' });
        }
    }

    else if (game === 'queens') {
        console.log('[API Generator] Generating Queens puzzle server-side...');
        try {
            const size = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 9;
            const puzzle = generateServerQueens(size);
            console.log(`[API Generator] Queens ${size}x${size} puzzle generated successfully.`);
            return res.status(200).json(puzzle);
        } catch (err) {
            console.error('[API Generator] Queens generation error:', err);
            return res.status(500).json({ error: 'Failed to generate Queens puzzle.' });
        }
    }

    return res.status(400).json({ error: 'Invalid game type requested.' });
}

// --- Server-Side Tango Generator & Solver Logic ---

function isValidTangoGrid(grid, size) {
    const half = size / 2;
    for (let r = 0; r < size; r++) {
        let rSuns = 0, rMoons = 0;
        for (let c = 0; c < size; c++) {
            const val = grid[r * size + c];
            if (val === '☀️') rSuns++;
            if (val === '🌙') rMoons++;
            if (rSuns > half || rMoons > half) return false;

            if (c >= 2 && grid[r * size + c] && 
                grid[r * size + c] === grid[r * size + c - 1] && 
                grid[r * size + c] === grid[r * size + c - 2]) {
                return false;
            }
        }
    }

    for (let c = 0; c < size; c++) {
        let cSuns = 0, cMoons = 0;
        for (let r = 0; r < size; r++) {
            const val = grid[r * size + c];
            if (val === '☀️') cSuns++;
            if (val === '🌙') cMoons++;
            if (cSuns > half || cMoons > half) return false;

            if (r >= 2 && grid[r * size + c] && 
                grid[r * size + c] === grid[(r - 1) * size + c] && 
                grid[r * size + c] === grid[(r - 2) * size + c]) {
                return false;
            }
        }
    }
    return true;
}

function solveTango(grid, index = 0, size = 6) {
    if (index === size * size) return isValidTangoGrid(grid, size);
    if (grid[index] !== '') return solveTango(grid, index + 1, size);

    for (let sym of ['☀️', '🌙']) {
        grid[index] = sym;
        if (isValidTangoGrid(grid, size)) {
            if (solveTango(grid, index + 1, size)) return true;
        }
        grid[index] = '';
    }
    return false;
}

// Deduction Engine: Tests if a board can be solved purely through rules without guessing
function canBeSolvedByDeduction(givens, size, constraints) {
    let board = [...givens];
    let changed = true;

    while (changed) {
        changed = false;

        // 1. Apply '=' and '×' constraints explicitly
        for (let constraint of constraints.horizontal) {
            let idx1 = constraint.r * size + constraint.c;
            let idx2 = constraint.r * size + (constraint.c + 1);
            if (board[idx1] && !board[idx2]) {
                board[idx2] = constraint.type === '=' ? board[idx1] : (board[idx1] === '☀️' ? '🌙' : '☀️');
                changed = true;
            } else if (!board[idx1] && board[idx2]) {
                board[idx1] = constraint.type === '=' ? board[idx2] : (board[idx2] === '☀️' ? '🌙' : '☀️');
                changed = true;
            }
        }

        for (let constraint of constraints.vertical) {
            let idx1 = constraint.r * size + constraint.c;
            let idx2 = (constraint.r + 1) * size + constraint.c;
            if (board[idx1] && !board[idx2]) {
                board[idx2] = constraint.type === '=' ? board[idx1] : (board[idx1] === '☀️' ? '🌙' : '☀️');
                changed = true;
            } else if (!board[idx1] && board[idx2]) {
                board[idx1] = constraint.type === '=' ? board[idx2] : (board[idx2] === '☀️' ? '🌙' : '☀️');
                changed = true;
            }
        }

        // 2. Doublet rules (Two identical symbols side-by-side force outer cells)
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                let idx = r * size + c;
                // Horizontal triplets check
                if (c < size - 2 && board[idx] && board[idx] === board[idx + 1] && !board[idx + 2]) {
                    board[idx + 2] = board[idx] === '☀️' ? '🌙' : '☀️';
                    changed = true;
                }
                if (c > 1 && board[idx] && board[idx] === board[idx - 1] && !board[idx - 2]) {
                    board[idx - 2] = board[idx] === '☀️' ? '🌙' : '☀️';
                    changed = true;
                }
                // Sandwich / Gap rule: Symbol [?] Symbol -> [?] must be opposite
                if (c < size - 2 && board[idx] && board[idx] === board[idx + 2] && !board[idx + 1]) {
                    board[idx + 1] = board[idx] === '☀️' ? '🌙' : '☀️';
                    changed = true;
                }
                
                // Vertical triplets check
                if (r < size - 2 && board[idx] && board[idx] === board[idx + size] && !board[idx + 2 * size]) {
                    board[idx + 2 * size] = board[idx] === '☀️' ? '🌙' : '☀️';
                    changed = true;
                }
                if (r > 1 && board[idx] && board[idx] === board[idx - size] && !board[idx - 2 * size]) {
                    board[idx - 2 * size] = board[idx] === '☀️' ? '🌙' : '☀️';
                    changed = true;
                }
                if (r < size - 2 && board[idx] && board[idx] === board[idx + 2 * size] && !board[idx + size]) {
                    board[idx + size] = board[idx] === '☀️' ? '🌙' : '☀️';
                    changed = true;
                }
            }
        }

        // 3. Count and complete lines if a symbol hits limit (size / 2)
        const limit = size / 2;
        for (let r = 0; r < size; r++) {
            let rowSuns = 0, rowMoons = 0, emptyIdxs = [];
            for (let c = 0; c < size; c++) {
                let val = board[r * size + c];
                if (val === '☀️') rowSuns++;
                else if (val === '🌙') rowMoons++;
                else emptyIdxs.push(r * size + c);
            }
            if (rowSuns === limit && rowMoons < limit) {
                emptyIdxs.forEach(i => { if (board[i] !== '🌙') { board[i] = '🌙'; changed = true; } });
            }
            if (rowMoons === limit && rowSuns < limit) {
                emptyIdxs.forEach(i => { if (board[i] !== '☀️') { board[i] = '☀️'; changed = true; } });
            }
        }

        for (let c = 0; c < size; c++) {
            let colSuns = 0, colMoons = 0, emptyIdxs = [];
            for (let r = 0; r < size; r++) {
                let val = board[r * size + c];
                if (val === '☀️') colSuns++;
                else if (val === '🌙') colMoons++;
                else emptyIdxs.push(r * size + c);
            }
            if (colSuns === limit && colMoons < limit) {
                emptyIdxs.forEach(i => { if (board[i] !== '🌙') { board[i] = '🌙'; changed = true; } });
            }
            if (colMoons === limit && colSuns < limit) {
                emptyIdxs.forEach(i => { if (board[i] !== '☀️') { board[i] = '☀️'; changed = true; } });
            }
        }
    }

    return board.every(cell => cell !== '');
}

function generateServerTango(size, difficulty, density) {
    console.log(`Server generating Tango puzzle for size ${size} with density ${density}%`);
    
    let solution = Array(size * size).fill('');
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            solution[r * size + c] = ((r + c) % 2 === 0) ? '☀️' : '🌙';
        }
    }

    const constraints = { horizontal: [], vertical: [] };
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size - 1; c++) {
            constraints.horizontal.push({ r, c, type: solution[r * size + c] === solution[r * size + (c + 1)] ? '=' : '×' });
        }
    }
    for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size; c++) {
            constraints.vertical.push({ r, c, type: solution[r * size + c] === solution[(r + 1) * size + c] ? '=' : '×' });
        }
    }

    const targetCluesCount = Math.floor((size * size) * (density / 100));
    let board = Array(size * size).fill('');
    let givens = Array(size * size).fill(false);

    let indices = Array.from({ length: size * size }, (_, i) => i).sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < size * size; i++) {
        let idx = indices[i];
        board[idx] = solution[idx];
        givens[idx] = true;

        if (i >= targetCluesCount && canBeSolvedByDeduction(board, size, constraints)) {
            break;
        }
    }

    return { size, board, givens, solution, constraints };
}

// --- Server-Side Queens Generator Logic ---
function generateServerQueens(size) {
    let board = Array(size).fill(-1);

    function solveQueens(row) {
        if (row === size) return true;
        let cols = Array.from({ length: size }, (_, i) => i).sort(() => Math.random() - 0.5);
        for (let col of cols) {
            let safe = true;
            for (let prevRow = 0; prevRow < row; prevRow++) {
                let prevCol = board[prevRow];
                if (prevCol === col || Math.abs(prevRow - row) === Math.abs(prevCol - col)) {
                    safe = false;
                    break;
                }
            }
            if (safe) {
                board[row] = col;
                if (solveQueens(row + 1)) return true;
                board[row] = -1;
            }
        }
        return false;
    }

    solveQueens(0);
    let regions = Array(size * size).fill(0);
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            regions[r * size + c] = (r + c) % Math.min(size, 5);
        }
    }

    return { size, board, regions };
}