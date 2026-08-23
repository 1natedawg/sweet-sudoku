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
            const openingHint = req.query.openingHint === 'true';
            const sizeParam = parseInt(req.query.size) || (difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 9);
            const size = Math.max(6, Math.min(14, sizeParam));
            const clueLimit = difficulty === 'easy' ? Math.ceil(size * 0.45) : difficulty === 'hard' ? Math.ceil(size * 0.30) : Math.ceil(size * 0.35);
            let puzzle;
            for (let attempt = 0; attempt < 25; attempt++) {
                const candidate = generateServerQueens(size, difficulty, openingHint);
                const clueCount = candidate.rows.flat().filter(value => value === 2).length;
                if (!puzzle || clueCount < puzzle.rows.flat().filter(value => value === 2).length) puzzle = candidate;
                if (clueCount <= clueLimit) break;
            }
            console.log(`[API Generator] Queens ${size}x${size} puzzle generated successfully.`);
            return res.status(200).json(puzzle);
        } catch (err) {
            console.error('[API Generator] Queens generation error:', err);
            return res.status(500).json({ error: 'Failed to generate Queens puzzle.' });
        }
    }
    else if (game === 'crossword') {
        console.log('[API Generator] Generating Crossword puzzle server-side...');
        try {
            const puzzle = generateCrossword(difficulty);
            console.log('[API Generator] Crossword puzzle generated successfully.');
            return res.status(200).json(puzzle);
        } catch (err) {
            console.error('[API Generator] Crossword generation error:', err);
            return res.status(500).json({ error: 'Failed to generate Crossword puzzle.' });
        }
    }

    return res.status(400).json({ error: 'Invalid game type requested.' });
}

// --- Server-Side Tango Generator & Solver Logic ---
function generateServerTango(size, difficulty, density) {
    console.log(`Server generating Tango puzzle for size ${size} with density ${density}%`);

    // A fresh seed makes each request dynamic, while the seeded generator makes
    // the backtracking choices reproducible for logging and debugging.
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    let randomState = seed || 1;
    const random = () => {
        randomState = (1664525 * randomState + 1013904223) >>> 0;
        return randomState / 0x100000000;
    };

    const solution = Array.from({ length: size }, () => Array(size).fill(-1));
    const rowCounts = Array.from({ length: size }, () => [0, 0, 0]);
    const columnCounts = Array.from({ length: size }, () => [0, 0, 0]);

    function isValidTangoPuzzle(rows, horizontalConnectors, verticalConnectors, difficulty, density) {
        /*
        Each entry in rows is a list of integers representing the symbols in that row.
        Each element in that row's list is an integer representing a symbol (0, 1, 2).
        Horizontal connectors are represented as a list of objects with {r, c, type} where type is either 'x' or '='.
         r = row index, c = column index, type = connector type
        For horizontal connectors, r is the row index and c is the column index of the left cell.
        The frontend will calculate the right cell as (r, c+1).
        For vertical connectors, r is the row index and c is the column index of the top cell.
        The frontend will calculate the bottom cell as (r+1, c).
        
        So, we need to validate that the rows and columns follow the standard Tango rules when filled:
            - Each row AND column MUST contain an equal number of each symbol (1 or 2)
            - Each row AND column MAY NOT contain more than two of the same symbol in a row (no three+ in a row)
            - An '=' connector between two cells means the symbols in those cells must be the same.
            - An 'x' connector between two cells means the symbols in those cells must be different.
            - The number of connectors should be proportional to the density parameter (e.g., 30% density means ~30% of possible connectors are present).
        
        1. Check that each row has the correct number of symbols.
        2. Check that each column has the correct number of symbols.
        3. Check that no row or column has more than two of the same symbol in a row.
        4. Check that all '=' connectors connect cells with the same symbol.
        5. Check that all 'x' connectors connect cells with different symbols.
        6. Check that the number of connectors is within an acceptable range based on the density parameter.
        */

        const size = rows.length;
        const totalCells = size * size;
        const maxSymbolsPerRowOrCol = 0.5 * size; // Each symbol should appear half the time in a row/column for a valid Tango puzzle.
        const maxConnectors = Math.floor((size * (size - 1)) * (density / 100)); // Max connectors based on density
        console.debug(`[Tango Validation] Size: ${size}, Max Symbols/Row/Col: ${maxSymbolsPerRowOrCol}, Max Connectors: ${maxConnectors}`);
        console.debug(`[Tango Validation] Data: Rows: ${JSON.stringify(rows)}, Horizontal Connectors: ${JSON.stringify(horizontalConnectors)}, Vertical Connectors: ${JSON.stringify(verticalConnectors)}`);
        // 1. Check rows for symbol counts and consecutive symbols
        for (let r = 0; r < size; r++) {
            const symbolCount = {};
            let consecutiveCount = 1;
            for (let c = 0; c < size; c++) {
                const symbol = rows[r][c];
                symbolCount[symbol] = (symbolCount[symbol] || 0) + 1;

                if (c > 0 && rows[r][c] === rows[r][c - 1]) {
                    consecutiveCount++;
                    if (consecutiveCount > 2) {
                        console.debug(`[Tango Validation] Row ${r} rejected: More than two of the same symbol in a row at column ${c}.`);
                        return false; // More than two of the same symbol in a row
                    }
                } else {
                    consecutiveCount = 1;
                }
            }
            if (Object.values(symbolCount).some(count => count > maxSymbolsPerRowOrCol)) {
                console.debug(`[Tango Validation] Row ${r} rejected: Too many of one symbol in a row.`);
                return false;
            }
        }
        // 2. Check columns for symbol counts and consecutive symbols
        for (let c = 0; c < size; c++) {
            const symbolCount = {};
            let consecutiveCount = 1;
            for (let r = 0; r < size; r++) {
                const symbol = rows[r][c];
                symbolCount[symbol] = (symbolCount[symbol] || 0) + 1;

                if (r > 0 && rows[r][c] === rows[r - 1][c]) {
                    consecutiveCount++;
                    if (consecutiveCount > 2) {
                        console.debug(`[Tango Validation] Column ${c} rejected: More than two of the same symbol in a column at row ${r}.`);
                        return false; // More than two of the same symbol in a column
                    }
                } else {
                    consecutiveCount = 1;
                }
            }
            if (Object.values(symbolCount).some(count => count > maxSymbolsPerRowOrCol)) {
                console.debug(`[Tango Validation] Column ${c} rejected: Too many of one symbol in a column.`);
                return false;
            }
        }
        // 3. Check '=' connectors
        for (const conn of horizontalConnectors) {
            if (conn.type === '=' && rows[conn.r][conn.c] !== rows[conn.r][conn.c + 1]) {
                console.debug(`[Tango Validation] Horizontal '=' connector at (${conn.r}, ${conn.c}) rejected: Symbols do not match.`);
                return false; // '=' connector does not match
            }
        }
        for (const conn of verticalConnectors) {
            if (conn.type === '=' && rows[conn.r][conn.c] !== rows[conn.r + 1][conn.c]) {
                console.debug(`[Tango Validation] Vertical '=' connector at (${conn.r}, ${conn.c}) rejected: Symbols do not match.`);
                return false; // '=' connector does not match
            }
        }
        // 4. Check 'x' connectors
        for (const conn of horizontalConnectors) {
            if (conn.type === 'x' && rows[conn.r][conn.c] === rows[conn.r][conn.c + 1]) {
                console.debug(`[Tango Validation] Horizontal 'x' connector at (${conn.r}, ${conn.c}) rejected: Symbols match.`);
                return false; // 'x' connector matches
            }
        }
        for (const conn of verticalConnectors) {
            if (conn.type === 'x' && rows[conn.r][conn.c] === rows[conn.r + 1][conn.c]) {
                console.debug(`[Tango Validation] Vertical 'x' connector at (${conn.r}, ${conn.c}) rejected: Symbols match.`);
                return false; // 'x' connector matches
            }
        }
        // 5. Check number of connectors
        const totalConnectors = horizontalConnectors.length + verticalConnectors.length;
        if (totalConnectors > maxConnectors) {
            console.debug(`[Tango Validation] Rejected: Too many connectors (${totalConnectors}) for density ${density}%.`);
            return false; // Too many connectors for the given density
        }

        console.debug('[Tango Validation] Puzzle is valid.');
        return true; // All checks passed   

    }

    function canPlace(row, column, symbol) {
        if (rowCounts[row][symbol] >= size / 2 || columnCounts[column][symbol] >= size / 2) {
            return false;
        }
        if (column >= 2 && solution[row][column - 1] === symbol && solution[row][column - 2] === symbol) {
            return false;
        }
        if (row >= 2 && solution[row - 1][column] === symbol && solution[row - 2][column] === symbol) {
            return false;
        }
        return true;
    }

    function fillSolution(position) {
        if (position === size * size) return true;

        const row = Math.floor(position / size);
        const column = position % size;
        const symbols = random() < 0.5 ? [1, 2] : [2, 1];

        for (const symbol of symbols) {
            if (!canPlace(row, column, symbol)) continue;

            solution[row][column] = symbol;
            rowCounts[row][symbol]++;
            columnCounts[column][symbol]++;

            if (fillSolution(position + 1)) return true;

            solution[row][column] = -1;
            rowCounts[row][symbol]--;
            columnCounts[column][symbol]--;
        }
        return false;
    }

    function isSolvable(rows, horizontalConnectors, verticalConnectors) {
        // eventually implement a backtracking solver to check if the puzzle is solvable
        return true; // For now, assume it's solvable
    }

    function generateUserPuzzle(solution, horizontalConnectors, verticalConnectors, difficulty) {
        const rows = Array.from({ length: size }, () => Array(size).fill(0));
        const totalCells = size * size;
        let cellsToReveal;

        switch (difficulty) {
            case 'easy':
                cellsToReveal = Math.floor(totalCells * 0.5);
                break;
            case 'medium':
                cellsToReveal = Math.floor(totalCells * 0.35);
                break;
            case 'hard':
                cellsToReveal = Math.floor(totalCells * 0.2);
                break;
            default:
                cellsToReveal = Math.floor(totalCells * 0.35);
        }
        console.debug(`[Tango Puzzle Generation] Revealing ${cellsToReveal} cells for difficulty '${difficulty}'`);
        const revealedPositions = new Set();
        while (revealedPositions.size < cellsToReveal) {
            const r = Math.floor(random() * size);
            const c = Math.floor(random() * size);
            revealedPositions.add(`${r},${c}`);
        }

        for (const pos of revealedPositions) {
            const [r, c] = pos.split(',').map(Number);
            rows[r][c] = solution[r][c];
        }

        return rows;
    }

    if (!fillSolution(0)) {
        throw new Error(`Unable to generate a ${size}x${size} Tango solution.`);
    }

    const horizontalCandidates = [];
    const verticalCandidates = [];
    const connectorChance = Math.max(0, Math.min(100, density)) / 100;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (c < size - 1 && random() < connectorChance) {
                horizontalCandidates.push({ r, c, type: solution[r][c] === solution[r][c + 1] ? '=' : 'x', orientation: 'horizontal' });
            }
            if (r < size - 1 && random() < connectorChance) {
                verticalCandidates.push({ r, c, type: solution[r][c] === solution[r + 1][c] ? '=' : 'x', orientation: 'vertical' });
            }
        }
    }

    const maxConnectors = Math.floor(size * (size - 1) * (Math.max(0, density) / 100));
    const candidates = [...horizontalCandidates, ...verticalCandidates];
    for (let index = candidates.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }
    const selectedConnectors = candidates.slice(0, maxConnectors);
    const horizontalConnectors = selectedConnectors
        .filter(conn => conn.orientation === 'horizontal')
        .map(({ r, c, type }) => ({ r, c, type }));
    const verticalConnectors = selectedConnectors
        .filter(conn => conn.orientation === 'vertical')
        .map(({ r, c, type }) => ({ r, c, type }));

    if (!isValidTangoPuzzle(solution, horizontalConnectors, verticalConnectors, difficulty, density)) {
        throw new Error(`Generated Tango solution failed validation for seed ${seed}.`);
    }

    const rows = generateUserPuzzle(solution, horizontalConnectors, verticalConnectors, difficulty);
    return { size, rows, solution, horizontalConnectors, verticalConnectors, seed };
}

// --- Server-Side Queens Generator Logic ---
function generateServerQueens(size, difficulty, openingHint = true) {
    let board = Array(size).fill(-1);
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    let randomState = seed || 1;
    const random = () => {
        randomState = (1664525 * randomState + 1013904223) >>> 0;
        return randomState / 0x100000000;
    };

    function solveQueens(row) {
        if (row === size) return true;
        let cols = Array.from({ length: size }, (_, i) => i).sort(() => random() - 0.5);
        for (let col of cols) {
            let safe = true;
            for (let prevRow = 0; prevRow < row; prevRow++) {
                let prevCol = board[prevRow];
                const touching = Math.abs(prevRow - row) <= 1 && Math.abs(prevCol - col) <= 1;
                if (prevCol === col || touching) {
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

    if (!solveQueens(0)) {
        throw new Error(`Unable to generate a ${size}x${size} Queens placement.`);
    }

    // Grow one orthogonally connected color region from each crown.
    const regions = Array(size * size).fill(-1);
    const frontier = [];
    for (let row = 0; row < size; row++) {
        const crownIndex = row * size + board[row];
        regions[crownIndex] = row;
        frontier.push({ index: crownIndex, region: row });
    }
    while (frontier.length > 0) {
        const frontierIndex = Math.floor(random() * frontier.length);
        const current = frontier.splice(frontierIndex, 1)[0];
        const row = Math.floor(current.index / size);
        const column = current.index % size;
        const neighbors = [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]];
        for (const [neighborRow, neighborColumn] of neighbors) {
            if (neighborRow < 0 || neighborRow >= size || neighborColumn < 0 || neighborColumn >= size) continue;
            const neighborIndex = neighborRow * size + neighborColumn;
            if (regions[neighborIndex] !== -1) continue;
            regions[neighborIndex] = current.region;
            frontier.push({ index: neighborIndex, region: current.region });
        }
    }

    const palette = [
        '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#bde0fe',
        '#cdb4db', '#ffc6ff', '#f4a261', '#e9c46a', '#2a9d8f', '#06d6a0',
        '#f15bb5', '#8338ec'
    ];
    const rows = Array.from({ length: size }, () => Array(size).fill(0));
    const solution = Array.from({ length: size }, () => Array(size).fill(1));
    for (let row = 0; row < size; row++) {
        rows[row][board[row]] = 0;
        solution[row][board[row]] = 2;
    }

    const units = [];
    for (let row = 0; row < size; row++) units.push(Array.from({ length: size }, (_, column) => row * size + column));
    for (let column = 0; column < size; column++) units.push(Array.from({ length: size }, (_, row) => row * size + column));
    for (let region = 0; region < size; region++) units.push(regions.reduce((cells, value, index) => {
        if (value === region) cells.push(index);
        return cells;
    }, []));

    function solveQueensByDeduction(clues) {
        const candidates = Array.from({ length: size * size }, (_, index) => new Set([index]));
        const crowns = new Set();

        function eliminate(index) {
            const row = Math.floor(index / size);
            const column = index % size;
            for (let cell = 0; cell < size * size; cell++) {
                const cellRow = Math.floor(cell / size);
                const cellColumn = cell % size;
                const touching = Math.abs(cellRow - row) <= 1 && Math.abs(cellColumn - column) <= 1;
                if (cell !== index && (cellRow === row || cellColumn === column || touching || regions[cell] === regions[index])) {
                    candidates[cell].clear();
                }
            }
            candidates[index] = new Set([index]);
        }

        for (const clue of clues) {
            if (crowns.has(clue)) continue;
            if (candidates[clue].size === 0) return false;
            crowns.add(clue);
            eliminate(clue);
        }

        let changed = true;
        while (changed) {
            changed = false;
            for (const unit of units) {
                const possible = unit.filter(index => candidates[index].size > 0 && !crowns.has(index));
                if (possible.length === 0 && !unit.some(index => crowns.has(index))) return false;
                if (possible.length === 1) {
                    const clue = possible[0];
                    if (!crowns.has(clue)) {
                        crowns.add(clue);
                        eliminate(clue);
                        changed = true;
                    }
                }
            }
        }

        return crowns.size === size && board.every((column, row) => crowns.has(row * size + column));
    }

    const cluePositions = board.map((column, row) => row * size + column);
    const clueOrder = [...cluePositions].sort(() => random() - 0.5);
    const clues = new Set(cluePositions);
    const targetClues = difficulty === 'easy' ? Math.ceil(size * 0.10) : difficulty === 'hard' ? Math.ceil(size * 0.045) : Math.ceil(size * 0.075);
    for (const clue of clueOrder) {
        if (clues.size <= targetClues) break;
        clues.delete(clue);
        if (!solveQueensByDeduction([...clues])) clues.add(clue);
    }
    if (!solveQueensByDeduction([...clues])) {
        throw new Error(`Unable to create a deduction-solvable ${size}x${size} Queens puzzle.`);
    }
    if (openingHint) {
        for (const clue of clues) {
            rows[Math.floor(clue / size)][clue % size] = 2;
        }
    }

    return {
        size,
        rows,
        solution,
        colors: regions.map(region => palette[region % palette.length]),
        board,
        regions,
        seed
    };

    function generateCrossword(difficulty) {
        // List all json files in the ./crosswords directory, recursively
        const fs = require('fs');
        const path = require('path');
        const crosswordDir = path.join(process.cwd(), 'crosswords');
        console.log(`[API Generator] Searching for crossword JSON files in: ${crosswordDir}`);
        const files = fs.readdirSync(crosswordDir).filter(file => file.endsWith('.json'));
        if (files.length === 0) {
            throw new Error('No crossword JSON files found in the crosswords directory.');
        }
        // Randomly select a crossword file
        const randomIndex = Math.floor(Math.random() * files.length);
        const selectedFile = files[randomIndex];
        console.log(`[API Generator] Selected crossword file: ${selectedFile}`);
        const crosswordPath = path.join(crosswordDir, selectedFile);
        const crosswordData = JSON.parse(fs.readFileSync(crosswordPath, 'utf-8'));
        return crosswordData;
    }
}