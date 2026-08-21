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
        console.log('[API Generator] Generating Tango puzzle server-side...');
        try {
            const puzzle = generateServerTango(difficulty);
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
function isValidTangoGrid(grid) {
    for (let r = 0; r < 6; r++) {
        let rSuns = 0, rMoons = 0;
        for (let c = 0; c < 6; c++) {
            const val = grid[r * 6 + c];
            if (val === '☀️') rSuns++;
            if (val === '🌙') rMoons++;
            if (rSuns > 3 || rMoons > 3) return false;
            if (c >= 2 && grid[r * 6 + c] && grid[r * 6 + c] === grid[r * 6 + c - 1] && grid[r * 6 + c] === grid[r * 6 + c - 2]) return false;
        }
    }
    for (let c = 0; c < 6; c++) {
        let cSuns = 0, cMoons = 0;
        for (let r = 0; r < 6; r++) {
            const val = grid[r * 6 + c];
            if (val === '☀️') cSuns++;
            if (val === '🌙') cMoons++;
            if (cSuns > 3 || cMoons > 3) return false;
            if (r >= 2 && grid[r * 6 + c] && grid[r * 6 + c] === grid[(r - 1) * 6 + c] && grid[r * 6 + c] === grid[(r - 2) * 6 + c]) return false;
        }
    }
    return true;
}

function solveTango(grid, index = 0) {
    if (index === 36) return isValidTangoGrid(grid);
    if (grid[index] !== '') return solveTango(grid, index + 1);

    for (let sym of ['☀️', '🌙']) {
        grid[index] = sym;
        if (isValidTangoGrid(grid)) {
            if (solveTango(grid, index + 1)) return true;
        }
        grid[index] = '';
    }
    return false;
}

function generateServerTango(difficulty) {
    let grid = Array(36).fill('');
    grid[Math.floor(Math.random() * 36)] = '☀️';
    grid[Math.floor(Math.random() * 36)] = '🌙';

    if (!solveTango(grid, 0)) {
        // Fallback standard valid template if random seed hits dead-end
        grid = [
            '☀️','🌙','☀️','🌙','🌙','☀️',
            '🌙','☀️','🌙','☀️','☀️','🌙',
            '☀️','🌙','☀️','🌙','🌙','☀️',
            '🌙','☀️','🌙','☀️','☀️','🌙',
            '☀️','🌙','☀️','🌙','🌙','☀️',
            '🌙','☀️','🌙','☀️','☀️','🌙'
        ];
    }

    const solution = [...grid];
    const board = Array(36).fill('');
    const givens = Array(36).fill(false);
    const keepCount = difficulty === 'easy' ? 16 : difficulty === 'medium' ? 12 : 9;
    
    let indices = Array.from({length: 36}, (_, i) => i).sort(() => Math.random() - 0.5);
    for (let i = 0; i < keepCount; i++) {
        let idx = indices[i];
        board[idx] = solution[idx];
        givens[idx] = true;
    }

    return { board, givens, solution };
}

// --- Server-Side Queens Generator Logic ---
function generateServerQueens(size) {
    // Generates valid non-attacking queen placements per row
    let board = Array(size).fill(-1);
    
    function solveQueens(row) {
        if (row === size) return true;
        let cols = Array.from({length: size}, (_, i) => i).sort(() => Math.random() - 0.5);
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
    // Build color regions assignment for the Queens board
    let regions = Array(size * size).fill(0);
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            regions[r * size + c] = (r + c) % Math.min(size, 5); // Simple generated region grouping
        }
    }

    return { size, board, regions };
}