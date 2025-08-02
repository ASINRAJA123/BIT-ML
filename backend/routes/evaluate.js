const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const router = express.Router();

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
        py.stdin.write(inputStr + '\n');
        py.stdin.end();
        setTimeout(() => { py.kill(); reject('Execution timed out.'); }, timeout);
    });
};

// This endpoint is for the "Run with Custom Input" button. It is STATELESS.
router.post('/run-cell', async (req, res) => {
    const { cellCode, customInput } = req.body;
    try {
        const output = await runPythonCode(cellCode, customInput);
        res.json({ output, error: null });
    } catch (error) {
        res.json({ output: null, error: error.toString() });
    }
});

// --- THIS IS THE FIX: This endpoint is now STATELESS. ---
router.post('/validate-cell', async (req, res) => {
    // It now correctly expects 'cellCode' from the frontend.
    const { subject, level, questionId, cellCode } = req.body; 
    try {
        const qFilePath = path.join(questionsBasePath, subject, `level${level}`, 'questions.json');
        const questions = JSON.parse(await fs.readFile(qFilePath, 'utf8'));
        const question = questions.find(q => q.id === questionId);
        if (!question) return res.status(404).json({ message: 'Question not found.' });
        
        const test_results = [];
        for (const tc of question.test_cases) {
            try {
                // It executes ONLY the current cell's code, fixing the bug.
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

// This endpoint is for the final "Submit" button. This remains STATEFUL.
router.post('/submit', async (req, res) => {
    const { username, subject, level, answers } = req.body;
    let updatedUser = null;

    try {
        const levelDir = `level${level}`;
        const qFilePath = path.join(questionsBasePath, subject, levelDir, 'questions.json');
        const questionsForLevel = JSON.parse(await fs.readFile(qFilePath, 'utf8'));
        const presentedQuestionIds = Object.keys(answers);
        let allQuestionsPassed = true;

        for (const questionId of presentedQuestionIds) {
            const studentCode = answers[questionId];
            if (!studentCode) {
                allQuestionsPassed = false;
                break;
            }

            const questionData = questionsForLevel.find(q => q.id === questionId);
            if (!questionData) {
                allQuestionsPassed = false;
                break;
            }

            for (const tc of questionData.test_cases) {
                try {
                    const output = await runPythonCode(studentCode, tc.input);
                    if (output.trim() !== tc.expected_output.trim()) {
                        allQuestionsPassed = false;
                        break;
                    }
                } catch {
                    allQuestionsPassed = false;
                    break;
                }
            }

            if (!allQuestionsPassed) break;
        }

        const status = allQuestionsPassed ? 'passed' : 'failed';
        const submission = { username, subject, level: levelDir, status, timestamp: new Date().toISOString() };
        const filename = `${username}_${subject}_${levelDir}_${status}_${Date.now()}.json`;
        await fs.mkdir(submissionsPath, { recursive: true });
        await fs.writeFile(path.join(submissionsPath, filename), JSON.stringify(submission, null, 2));

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
            message: allQuestionsPassed ? "Congratulations! Level passed." : "Submission recorded. Some tests failed.",
            updatedUser
        });

    } catch (error) {
        console.error("Submission Error:", error);
        res.status(500).json({ success: false, message: "A server error occurred." });
    }
});


module.exports = router;

