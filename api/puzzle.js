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
        console.log(`[API Generator] Generating Tango puzzle for size ${size}x${size} (${difficulty})...`);

        try {
            const puzzle = generateServerTango(size, difficulty);
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
    // Loop through each of the 6 rows
    for (let r = 0; r < 6; r++) {
        let rSuns = 0, rMoons = 0;
        // Loop through each column in the current row
        for (let c = 0; c < 6; c++) {
            const val = grid[r * 6 + c]; // Map 2D coordinate (r, c) to a 1D array index (0 to 35)

            // Count symbols in this row
            if (val === '☀️') rSuns++;
            if (val === '🌙') rMoons++;
            // Rule check: A row cannot exceed 3 of either symbol
            if (rSuns > 3 || rMoons > 3) return false;

            // Rule check: Check for 3 consecutive identical symbols horizontally (current, -1, and -2)
            if (c >= 2 && grid[r * 6 + c] && grid[r * 6 + c] === grid[r * 6 + c - 1] && grid[r * 6 + c] === grid[r * 6 + c - 2]) {
                return false;
            }
        }
    }

    // Loop through each of the 6 columns
    for (let c = 0; c < 6; c++) {
        let cSuns = 0, cMoons = 0;

        // Loop through each row in the current column
        for (let r = 0; r < 6; r++) {
            const val = grid[r * 6 + c];

            // Count symbols in this column
            if (val === '☀️') cSuns++;
            if (val === '🌙') cMoons++;

            // Rule check: A column cannot exceed 3 of either symbol
            if (cSuns > 3 || cMoons > 3) return false;

            // Rule check: Check for 3 consecutive identical symbols vertically
            if (r >= 2 && grid[r * 6 + c] && grid[r * 6 + c] === grid[(r - 1) * 6 + c] && grid[r * 6 + c] === grid[(r - 2) * 6 + c]) {
                return false;
            }
        }
    }

    // If all checks pass, this board state is valid so far
    return true;
}

function solveTango(grid, index = 0) {
    // Base Case: If we've stepped past the last cell (index 36), validate the full board
    if (index === 36) return isValidTangoGrid(grid);
    
    // If the current cell already has a pre-filled symbol, skip it and move to the next index
    if (grid[index] !== '') return solveTango(grid, index + 1);

    // Try placing both symbols ('☀️' and '🌙') into the empty cell
    for (let sym of ['☀️', '🌙']) {
        grid[index] = sym; // Tentatively place the symbol
        
        // Check if the board is still valid with this choice
        if (isValidTangoGrid(grid)) {
            // Recursively attempt to solve the rest of the board from the next index
            if (solveTango(grid, index + 1)) return true; // If successful, bubble 'true' up
        }
        
        // Backtracking step: If the choice led to a dead-end, undo it (reset to '') and try the other symbol
        grid[index] = '';
    }
    
    // If neither symbol works, trigger backtracking on the previous step
    return false;
}

function generateServerTango(size, difficulty) {
    // 1. Build a valid balanced grid pattern (alternating columns/rows)
    let solution = Array(size * size).fill('');
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            solution[r * size + c] = ((r + c) % 2 === 0) ? '☀️' : '🌙';
        }
    }

    // 2. Generate boundary constraints (= and ×) between adjacent pairs
    const constraints = { horizontal: [], vertical: [] };
    
    // Horizontal constraints (between col c and c+1 for each row)
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size - 1; c++) {
            const current = solution[r * size + c];
            const next = solution[r * size + (c + 1)];
            const type = (current === next) ? '=' : '×';
            constraints.horizontal.push({ r, c, type });
        }
    }

    // Vertical constraints (between row r and r+1 for each col)
    for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size; c++) {
            const current = solution[r * size + c];
            const next = solution[(r + 1) * size + c];
            const type = (current === next) ? '=' : '×';
            constraints.vertical.push({ r, c, type });
        }
    }

    // 3. Carve out puzzle board based on difficulty
    const board = Array(size * size).fill('');
    const givens = Array(size * size).fill(false);
    const keepRatio = difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.35 : 0.25;
    const keepCount = Math.floor((size * size) * keepRatio);

    let indices = Array.from({ length: size * size }, (_, i) => i).sort(() => Math.random() - 0.5);
    for (let i = 0; i < keepCount; i++) {
        let idx = indices[i];
        board[idx] = solution[idx];
        givens[idx] = true;
    }

    return { size, board, givens, solution, constraints };
}

// --- Server-Side Queens Generator Logic ---
function generateServerQueens(size) {
    // Generates valid non-attacking queen placements per row
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
    // Build color regions assignment for the Queens board
    let regions = Array(size * size).fill(0);
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            regions[r * size + c] = (r + c) % Math.min(size, 5); // Simple generated region grouping
        }
    }

    return { size, board, regions };
}