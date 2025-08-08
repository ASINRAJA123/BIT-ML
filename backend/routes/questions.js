

// backend/routes/questions.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const questionsBasePath = path.join(__dirname, '..', 'data', 'questions');

// --- (GET routes remain the same) ---
// GET all available subjects and levels
router.get('/', async (req, res) => {
    try {
        const subjects = await fs.readdir(questionsBasePath);
        const structure = {};

        for (const subject of subjects) {
            const subjectPath = path.join(questionsBasePath, subject);
            const stats = await fs.stat(subjectPath);
            if (stats.isDirectory()) {
                const levels = await fs.readdir(subjectPath);
                // Filter for directories and sort them naturally
                const levelDirs = levels
                    .filter(level => level.startsWith('level'))
                    .sort((a, b) => {
                        const numA = parseInt(a.replace('level', ''), 10);
                        const numB = parseInt(b.replace('level', ''), 10);
                        return numA - numB;
                    });
                structure[subject] = levelDirs;
            }
        }
        res.status(200).json(structure);
    } catch (error) {
        console.error("Error fetching question structure:", error);
        res.status(500).json({ message: "Failed to fetch question structure." });
    }
});

// GET questions for a specific subject and level
router.get('/:subject/:level', async (req, res) => {
    const { subject, level } = req.params;
    const filePath = path.join(questionsBasePath, subject, `level${level}`, 'questions.json');

    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.status(200).json(JSON.parse(data));
    } catch (error) {
        console.error(`Error reading questions for ${subject}/level${level}:`, error);
        res.status(404).json({ message: 'Questions not found for the specified subject and level.' });
    }
});


// POST to upload a new question (SIMPLIFIED)
router.post('/', async (req, res) => {
    const { subject, level, newQuestion } = req.body;
    if (!subject || !level || !newQuestion || !newQuestion.id) {
        return res.status(400).json({ message: "Subject, level, and question data with an ID are required." });
    }

    const levelDir = `level${level}`;
    const filePath = path.join(questionsBasePath, subject, levelDir, 'questions.json');

    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        let questions = [];
        try {
            const data = await fs.readFile(filePath, 'utf8');
            questions = JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        if (questions.some(q => q.id === newQuestion.id)) {
            return res.status(409).json({ message: `Question with ID '${newQuestion.id}' already exists.` });
        }

        questions.push(newQuestion);
        await fs.writeFile(filePath, JSON.stringify(questions, null, 2));

        // The complex user update logic is REMOVED from here.
        // It's handled by the evaluation route.

        res.status(201).json({ message: "Question added successfully." });

    } catch (error) {
        console.error("Error uploading question:", error);
        res.status(500).json({ message: "Failed to upload question." });
    }
});

module.exports = router;