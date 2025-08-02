
const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const bcrypt = require('bcrypt');
const { buildInitialProgress } = require('../utils/progressHelper');
const router = express.Router();

const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');
const questionsBasePath = path.join(__dirname, '..', 'data', 'questions');
const saltRounds = 10;
const upload = multer({ dest: 'uploads/' });

// --- (create-subject and upload-users routes are unchanged) ---
// --- Subject Management (HEAVILY MODIFIED) ---
router.post('/create-subject', async (req, res) => {
    const { subjectName, numLevels } = req.body;
    if (!subjectName || !numLevels || numLevels < 1) {
        return res.status(400).json({ message: "Valid subject name and number of levels are required." });
    }

    try {
        // 1. Create the folder structure
        for (let i = 1; i <= numLevels; i++) {
            const levelPath = path.join(questionsBasePath, subjectName, `level${i}`);
            await fs.mkdir(levelPath, { recursive: true });
            await fs.writeFile(path.join(levelPath, 'questions.json'), '[]', 'utf8');
        }

        // 2. Update all existing users with the new subject
        const usersData = await fs.readFile(usersFilePath, 'utf8');
        const usersJson = JSON.parse(usersData);

        usersJson.users.forEach(user => {
            if (user.role === 'student') {
                if (!user.progress) user.progress = {};
                user.progress[subjectName] = {};
                for (let i = 1; i <= numLevels; i++) {
                    user.progress[subjectName][`level${i}`] = (i === 1) ? "unlocked" : "locked";
                }
            }
        });
        
        await fs.writeFile(usersFilePath, JSON.stringify(usersJson, null, 2));

        res.status(201).json({ message: `Subject '${subjectName}' created and all users updated.` });
    } catch (error) {
        console.error("Error creating subject:", error);
        res.status(500).json({ message: "Failed to create subject." });
    }
});

// --- CSV Upload for Users (MODIFIED) ---
router.post('/upload-users', upload.single('file'), async (req, res) => {
    const results = [];
    const filePath = req.file.path;

    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        const usersJson = JSON.parse(data);
        const existingUsernames = new Set(usersJson.users.map(u => u.username));
        const initialProgress = await buildInitialProgress();

        const stream = fsSync.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                // ... (processing logic remains the same, just uses the new initialProgress)
                let createdCount = 0;
                let skippedCount = 0;
                for (const user of results) {
                    if (!user.username || !user.password || existingUsernames.has(user.username)) {
                        skippedCount++;
                        continue;
                    }
                    const hashedPassword = await bcrypt.hash(user.password, saltRounds);
                    const newUser = {
                        username: user.username,
                        password: hashedPassword,
                        role: "student",
                        progress: initialProgress // USES THE NEW HELPER
                    };
                    usersJson.users.push(newUser);
                    existingUsernames.add(user.username);
                    createdCount++;
                }
                await fs.writeFile(usersFilePath, JSON.stringify(usersJson, null, 2));
                fsSync.unlinkSync(filePath);
                res.status(201).json({ 
                    message: `Upload complete. Created ${createdCount} new users. Skipped ${skippedCount} users.` 
                });
            });
    } catch (error) {
        fsSync.unlinkSync(filePath);
        res.status(500).json({ message: "An error occurred during user upload." });
    }
});

// --- CSV Upload for Questions (HEAVILY MODIFIED) ---
router.post('/upload-questions', upload.single('file'), (req, res) => {
    const results = [];
    const filePath = req.file.path;

    fsSync.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                let addedCount = 0;
                let skippedCount = 0;

                for (const row of results) {
                    const { subject, level, id, title, description } = row;
                    if (!subject || !level || !id || !title || !description) {
                        skippedCount++;
                        continue;
                    }
                    
                    const levelDir = `level${level}`;
                    const qFilePath = path.join(questionsBasePath, subject, levelDir, 'questions.json');

                    await fs.mkdir(path.dirname(qFilePath), { recursive: true }).catch(() => {});
                    let questions = await fs.readFile(qFilePath, 'utf8').then(JSON.parse).catch(() => []);
                    
                    if (questions.some(existingQ => existingQ.id === id)) {
                        skippedCount++;
                        continue;
                    }

                    // --- NEW LOGIC: Construct test_cases array from flat columns ---
                    const newTestCases = [];
                    for (let i = 1; i <= 5; i++) { // Enforce 5 test case limit
                        const desc = row[`tc${i}_desc`];
                        const code = row[`tc${i}_code`];
                        const expected = row[`tc${i}_expected`];
                        // Only add the test case if code and expected output are present
                        if (code && expected) {
                            newTestCases.push({
                                description: desc || `Test Case ${i}`,
                                code_to_run: code,
                                expected_output: expected
                            });
                        }
                    }

                    questions.push({
                        id,
                        title,
                        description,
                        template: "def function_name(param):\n    # Your code here\n    pass",
                        test_cases: newTestCases
                    });
                    // --- END NEW LOGIC ---

                    await fs.writeFile(qFilePath, JSON.stringify(questions, null, 2));
                    addedCount++;
                }

                fsSync.unlinkSync(filePath);
                res.status(201).json({ 
                    message: `Upload complete. Added ${addedCount} new questions. Skipped ${skippedCount} questions.`
                });
            } catch (error) {
                if(fsSync.existsSync(filePath)) fsSync.unlinkSync(filePath);
                console.error("Error processing questions CSV:", error);
                res.status(500).json({ message: "An error occurred during question upload." });
            }
        });
});

module.exports = router;