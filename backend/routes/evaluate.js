// routes/evaluation.js

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const router = express.Router();
const EXECUTION_SEPARATOR = "---EXECUTION_CELL_SEPARATOR---"; // Same constant here


// ... (paths and runPythonCode function remain the same)
const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');
const submissionsPath = path.join(__dirname, '..', 'data', 'submissions');
const questionsBasePath = path.join(__dirname, '..', 'data', 'questions');

const runPythonCode = (code, inputStr = '', timeout = 7000) => {
    return new Promise((resolve, reject) => {
        const py = spawn('python', ['-u', '-c', code]);
        let output = '', errorOutput = '';
        py.stdout.on('data', data => output += data.toString());
        py.stderr.on('data', data => errorOutput += data.toString());
        py.on('close', () => {
            if (errorOutput) reject(errorOutput);
            else resolve(output.trim());
        });
        if (inputStr) py.stdin.write(inputStr + '\n');
        py.stdin.end();
        setTimeout(() => { py.kill(); reject('Execution timed out.'); }, timeout);
    });
};

// This endpoint for "Run" is fine. It just executes whatever code it receives.
router.post('/run-cell', async (req, res) => {
    const { cellCode, customInput } = req.body;
    try {
        const rawOutput = await runPythonCode(cellCode, customInput);

        // Check for our separator.
        const parts = rawOutput.split(EXECUTION_SEPARATOR);

        // If the separator was found, the real output is the last part.
        // Otherwise (for the first cell), the output is the whole thing.
        const finalOutput = parts.length > 1 ? parts.pop().trim() : rawOutput;

        res.json({ output: finalOutput, error: null });
    } catch (error) {
        // Errors should be passed through regardless of the separator.
        const parts = error.toString().split(EXECUTION_SEPARATOR);
        const finalError = parts.length > 1 ? parts.pop().trim() : error.toString();
        res.json({ output: null, error: finalError });
    }
});

// This endpoint for "Validate" is also fine. It's stateless.
router.post('/validate-cell', async (req, res) => {
    const { subject, level, questionId, cellCode } = req.body;
    try {
        const qFilePath = path.join(questionsBasePath, subject, `level${level}`, 'questions.json');
        const questions = JSON.parse(await fs.readFile(qFilePath, 'utf8'));
        const question = questions.find(q => q.id === questionId);
        if (!question) return res.status(404).json({ message: 'Question not found.' });
        const test_results = [];
        for (const tc of question.test_cases) {
            try {
                const output = await runPythonCode(cellCode, tc.input);
                test_results.push(output === tc.expected_output);
            } catch {
                test_results.push(false);
            }
        }
        res.json({ test_results });
    } catch (error) {
        res.status(500).json({ test_results: [], error: error.toString() });
    }
});


// Helper function for the /submit route
const transformCodeForStateSetup = (code, testCaseInput) => {
    // First, replace input() calls
    const inputLines = testCaseInput.split('\n');
    let i = 0;
    let transformedCode = code.replace(/input\(\)/g, () => {
        if (i < inputLines.length) {
            const value = inputLines[i];
            i++;
            // JSON.stringify correctly wraps strings in quotes, etc.
            return JSON.stringify(value);
        }
        return '""';
    });

    // Second, remove all basic print() statements
    // This regex finds 'print' followed by optional space and parentheses.
    // It will remove the entire line containing the print statement.
    transformedCode = transformedCode.replace(/^[ \t]*print\s*\(.*\)\s*$/gm, '');

    return transformedCode;
};


// THIS IS THE CORRECTED SUBMISSION ENDPOINT
router.post('/submit', async (req, res) => {
    const { username, subject, level, answers } = req.body;
    let updatedUser = null;
    
    try {
        const levelDir = `level${level}`;
        const qFilePath = path.join(questionsBasePath, subject, levelDir, 'questions.json');
        const questionsForLevel = JSON.parse(await fs.readFile(qFilePath, 'utf8'));
        const presentedQuestionIds = Object.keys(answers);
        
        let allQuestionsPassed = true;
        // This will hold the SILENT, transformed code from previous cells.
        const silentSetupCode = [];

        for (const questionId of presentedQuestionIds) {
            const studentCode = answers[questionId] || 'pass';
            const questionData = questionsForLevel.find(q => q.id === questionId);

            if (!questionData) {
                allQuestionsPassed = false;
                break;
            }
            
            // 1. Build the setup script from the silent code of all previous cells.
            const setupScript = silentSetupCode.join('\n\n');
            
            // 2. Test the current student's code against ALL its test cases.
            for (const tc of questionData.test_cases) {
                // Combine the silent setup script with the actual student code for this question.
                const scriptToRun = `${setupScript}\n\n${studentCode}`;
                try {
                    const output = await runPythonCode(scriptToRun, tc.input);
                    if (output !== tc.expected_output) {
                        allQuestionsPassed = false;
                        break; 
                    }
                } catch {
                    allQuestionsPassed = false;
                    break;
                }
            }
            if (!allQuestionsPassed) break;

            // 3. THE FIX: If all tests passed, transform this cell's code into a
            //    SILENT version and add it to our setup list for the *next* question.
            const firstTestCaseInput = questionData.test_cases[0]?.input || '';
            const silentVersionOfCode = transformCodeForStateSetup(studentCode, firstTestCaseInput);
            silentSetupCode.push(silentVersionOfCode);
        }

        // --- Rest of submission logic (saving, updating user) remains the same ---
        const status = allQuestionsPassed ? 'passed' : 'failed';
        // ... (the rest of the function for saving submissions and updating users is correct)





        const submission = {
            subject,
            level: levelDir,
            status,
            timestamp: new Date().toISOString()
        };

        const userSubmissionFile = path.join(submissionsPath, `${username}.json`);
        await fs.mkdir(submissionsPath, { recursive: true });

        let userSubmissions = [];
        try {
            const fileContent = await fs.readFile(userSubmissionFile, 'utf8');
            userSubmissions = JSON.parse(fileContent);
        } catch (err) {
            // If file doesn't exist, start with empty array
            if (err.code !== 'ENOENT') {
                throw err; // If it's another error, throw it
            }
        }

        userSubmissions.push(submission);
        await fs.writeFile(userSubmissionFile, JSON.stringify(userSubmissions, null, 2));

        if (allQuestionsPassed) {
            const usersJson = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
            const userIndex = usersJson.users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                const user = usersJson.users[userIndex];
                user.progress[subject][levelDir] = "completed";
                const nextLevelNum = parseInt(level, 10) + 1;
                const nextLevelDir = `level${nextLevelNum}`;
                if (user.progress[subject]?.[nextLevelDir] === "locked") {
                    user.progress[subject][nextLevelDir] = "unlocked";
                }
                const { password, ...userToReturn } = user;
                updatedUser = userToReturn;
                usersJson.users[userIndex] = user;
                await fs.writeFile(usersFilePath, JSON.stringify(usersJson, null, 2));
            }
        }

        res.json({
            success: allQuestionsPassed,
            message: allQuestionsPassed ? "Congratulations! Level passed and progress saved." : "Submission recorded. Some tests failed.",
            updatedUser
        });

    } catch (error) {
        console.error("Submission Error:", error);
        res.status(500).json({ success: false, message: "A server error occurred." });
    }
});

module.exports = router;