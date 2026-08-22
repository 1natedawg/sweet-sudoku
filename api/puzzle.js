export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
function generateServerTango(size, difficulty, density) {
    console.log(`Server generating Tango puzzle for size ${size} with density ${density}%`);
    //horizontalConnectors, verticalConnectors, solution, size, board
    const rows = [
    [0, 1, 2, 0, 1, 2],
    [2, 0, 1, 2, 0, 1],
    [1, 2, 0, 1, 2, 0],
    [0, 1, 2, 0, 1, 2], 
    [2, 0, 1, 2, 0, 1],
    [1, 2, 0, 1, 2, 0]
  ];
  const solution = [
    [1, 2, 1, 2, 1, 2],
    [2, 1, 2, 1, 2, 1],
    [1, 2, 1, 2, 1, 2],
    [2, 1, 2, 1, 2, 1],
    [1, 2, 1, 2, 1, 2],
    [2, 1, 2, 1, 2, 1]
  ];
  const horizontalConnectors = [
    { "r": 0, "c": 0, "type": "=" },
    { "r": 0, "c": 1, "type": "x" }
  ];
  const verticalConnectors = [
    { "r": 0, "c": 0, "type": "x" },
    { "r": 1, "c": 0, "type": "=" }
  ];


    return { size, rows, solution, horizontalConnectors, verticalConnectors };
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