// routes/evaluation.js

const express = require('express');
// The correct way to import both fs modules
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const csv = require('csv-parser');
const router = express.Router();

const EXECUTION_SEPARATOR = "---EXECUTION_CELL_SEPARATOR---";

// --- Paths ---
const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');
const submissionsPath = path.join(__dirname, '..', 'data', 'submissions');
const questionsBasePath = path.join(__dirname, '..', 'data', 'questions');

// --- Helper for running Python code ---
const runPythonCode = (code, inputStr = '', timeout = 20000) => {
    return new Promise((resolve, reject) => {
        const py = spawn('python', ['-u', '-c', code], { cwd: path.join(__dirname, '..') });
        let output = '', errorOutput = '';
        py.stdout.on('data', data => output += data.toString());
        py.stderr.on('data', data => errorOutput += data.toString());
        py.on('close', () => {
            if (errorOutput && !output) { reject(errorOutput); }
            else { resolve(output.trim()); }
        });
        if (inputStr) py.stdin.write(inputStr + '\n');
        py.stdin.end();
        setTimeout(() => { py.kill(); reject('Execution timed out.'); }, timeout);
    });
};

// --- Helper for comparing CSV files (for Level 2 style exams) ---
const compareCsvFiles = (studentFilePath, solutionFilePath, keyColumns, threshold) => {
    return new Promise((resolve) => {
        const result = { passed: false, similarity: 0, error: null };
        const solutionData = {};

        fs.createReadStream(solutionFilePath)
            .on('error', (err) => {
                result.error = `Critical: Solution file not found: ${err.message}`;
                resolve(result);
            })
            .pipe(csv())
            .on('data', (row) => { solutionData[row[keyColumns[0]]] = parseFloat(row[keyColumns[1]]); })
            .on('end', () => {
                let matchCount = 0;
                fs.createReadStream(studentFilePath)
                    .on('error', () => {
                        result.error = 'Student submission.csv was not created.';
                        resolve(result);
                    })
                    .pipe(csv())
                    .on('data', (studentRow) => {
                        const id = studentRow[keyColumns[0]];
                        const studentPrice = parseFloat(studentRow[keyColumns[1]]);
                        const solutionPrice = solutionData[id];
                        if (solutionPrice !== undefined && !isNaN(studentPrice)) {
                            const tolerance = 0.20 * solutionPrice;
                            if (Math.abs(studentPrice - solutionPrice) <= tolerance) {
                                matchCount++;
                            }
                        }
                    })
                    .on('end', () => {
                        const solutionTotal = Object.keys(solutionData).length;
                        if (solutionTotal === 0) { result.passed = true; return resolve(result); }
                        const similarity = matchCount / solutionTotal;
                        result.similarity = similarity;
                        result.passed = similarity >= threshold;
                        console.log(`CSV Similarity: ${similarity.toFixed(3)} (Threshold: ${threshold})`);
                        resolve(result);
                    });
            });
    });
};

// --- Helper for stateful execution (for Level 1 style exams) ---
const transformCodeForStateSetup = (code, testCaseInput) => {
    const inputLines = testCaseInput.split('\n'); let i = 0;
    let transformedCode = code.replace(/input\(\)/g, () => {
        if (i < inputLines.length) { return JSON.stringify(inputLines[i++]); }
        return '""';
    });
    transformedCode = transformedCode.replace(/^[ \t]*print\s*\(.*\)\s*$/gm, '');
    return transformedCode;
};


// --- Standard /run-cell and /validate-cell routes with fixes ---
router.post('/run-cell', async (req, res) => {
    const { cellCode, customInput } = req.body;
    try {
        const rawOutput = await runPythonCode(cellCode, customInput);
        const parts = rawOutput.split(EXECUTION_SEPARATOR);
        const finalOutput = parts.length > 1 ? parts.pop().trim() : rawOutput;
        res.json({ output: finalOutput, error: null });
    } catch (error) {
        const parts = error.toString().split(EXECUTION_SEPARATOR);
        const finalError = parts.length > 1 ? parts.pop().trim() : error.toString();
        res.json({ output: null, error: finalError });
    }
});

router.post('/validate-cell', async (req, res) => {
    const { subject, level, questionId, cellCode } = req.body;
    try {
        const qFilePath = path.join(questionsBasePath, subject, `level${level}`, 'questions.json');
        const questions = JSON.parse(await fsPromises.readFile(qFilePath, 'utf8'));
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


// --- THE GRAND UNIFIED SUBMISSION ENDPOINT ---
router.post('/submit', async (req, res) => {
    const { username, subject, level, answers } = req.body;
    let updatedUser = null;
    let overallPassStatus = true;
    let submissionDetails = {};

    const presentedQuestionIds = Object.keys(answers);
    const studentCsvPath = path.join(__dirname, '..', 'submission.csv');
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');

    try {
        const levelDir = `level${level}`;
        const qFilePath = path.join(questionsBasePath, subject, levelDir, 'questions.json');
        const questionsForLevel = JSON.parse(await fsPromises.readFile(qFilePath, 'utf8'));

        // DETECT EXAM TYPE: More than one answer means it's a stateful, multi-cell exam
        const isStatefulMultiCell = presentedQuestionIds.length > 1;

        if (isStatefulMultiCell) {
            // --- EXECUTION PATH 1: STATEFUL, MULTI-CELL (Your working Level 1 Logic) ---
            console.log("Executing in Stateful, Multi-Cell mode.");
            const silentSetupCode = [];
            for (const questionId of presentedQuestionIds) {
                const studentCode = answers[questionId] || 'pass';
                const questionData = questionsForLevel.find(q => q.id === questionId);
                if (!questionData) { overallPassStatus = false; break; }

                const setupScript = silentSetupCode.join('\n\n');
                for (const tc of questionData.test_cases) {
                    const scriptToRun = `${setupScript}\n\n${studentCode}`;
                    try {
                        const output = await runPythonCode(scriptToRun, tc.input);
                        if (output !== tc.expected_output) {
                            overallPassStatus = false; break;
                        }
                    } catch {
                        overallPassStatus = false; break;
                    }
                }
                if (!overallPassStatus) break;

                const firstTestCaseInput = questionData.test_cases[0]?.input || '';
                const silentVersionOfCode = transformCodeForStateSetup(studentCode, firstTestCaseInput);
                silentSetupCode.push(silentVersionOfCode);
            }
            submissionDetails = { subject, level: levelDir, status: overallPassStatus ? 'passed' : 'failed' };

        } else {
            // --- EXECUTION PATH 2: STATELESS, SINGLE-CELL (New Level 2 Logic) ---
            console.log("Executing in Stateless, Single-Cell mode.");
            const questionId = presentedQuestionIds[0];
            const studentCode = answers[questionId] || 'pass';
            const questionData = questionsForLevel.find(q => q.id === questionId);
            if (!questionData) throw new Error(`Question ID '${questionId}' not found.`);

            let testsPassedCount = 0;
            let csvSimilarityScore = null;

            try {
                const scriptOutput = await runPythonCode(studentCode);
                for (const tc of questionData.test_cases) {
                    if (tc.type === 'output_contains') {
                        if (scriptOutput.includes(tc.expected_substring)) { testsPassedCount++; }
                    } else if (tc.type === 'csv_comparison') {
                        const csvResult = await compareCsvFiles(studentCsvPath, path.join(__dirname, '..', tc.solution_file), tc.key_columns, tc.similarity_threshold);
                        csvSimilarityScore = csvResult.similarity;
                        if (!csvResult.error) {
                            const userSubmissionsDir = path.join(submissionsPath, username, subject, levelDir);
                            await fsPromises.mkdir(userSubmissionsDir, { recursive: true });
                            const savedSubmissionPath = path.join(userSubmissionsDir, `${timestamp}-submission.csv`);
                            await fsPromises.copyFile(studentCsvPath, savedSubmissionPath);
                        }
                        if (csvResult.passed) { testsPassedCount++; }
                    }
                }
                const passThreshold = questionData.pass_threshold || questionData.test_cases.length;
                if (testsPassedCount < passThreshold) { overallPassStatus = false; }
            } catch (error) {
                overallPassStatus = false;
            }

            submissionDetails = {
                subject, level: levelDir, status: overallPassStatus ? 'passed' : 'failed',
                tests_passed: testsPassedCount, total_tests: questionData.test_cases.length,
                csv_similarity: csvSimilarityScore
            };
        }

        // --- COMMON LOGIC: Save submission log and update user progress ---
        submissionDetails.timestamp = new Date().toISOString();
        const userSubmissionLogFile = path.join(submissionsPath, `${username}.json`);
        await fsPromises.mkdir(path.dirname(userSubmissionLogFile), { recursive: true });
        let userSubmissions = [];
        try { userSubmissions = JSON.parse(await fsPromises.readFile(userSubmissionLogFile, 'utf8')); }
        catch (err) { if (err.code !== 'ENOENT') throw err; }
        userSubmissions.push(submissionDetails);
        await fsPromises.writeFile(userSubmissionLogFile, JSON.stringify(userSubmissions, null, 2));

        if (overallPassStatus) {
            const usersJson = JSON.parse(await fsPromises.readFile(usersFilePath, 'utf8'));
            const userIndex = usersJson.users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                const user = usersJson.users[userIndex];
                const levelDir = `level${level}`;
                user.progress[subject][levelDir] = "completed";
                const nextLevelNum = parseInt(level, 10) + 1;
                const nextLevelDir = `level${nextLevelNum}`;
                if (user.progress[subject]?.[nextLevelDir] === "locked") {
                    user.progress[subject][nextLevelDir] = "unlocked";
                }
                const { password, ...userToReturn } = user;
                updatedUser = userToReturn;
                usersJson.users[userIndex] = user;
                await fsPromises.writeFile(usersFilePath, JSON.stringify(usersJson, null, 2));
            }
        }

        res.json({
            success: overallPassStatus,
            message: overallPassStatus ? "Congratulations! Level passed and progress saved." : "Submission recorded. You met some, but not all, of the requirements to pass.",
            updatedUser
        });

    } catch (error) {
        console.error("Submission Error:", error);
        res.status(500).json({ success: false, message: "A server error occurred." });
    } finally {
        await fsPromises.unlink(studentCsvPath).catch(() => {});
    }
});

module.exports = router;