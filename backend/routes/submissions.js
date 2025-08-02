const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const submissionsPath = path.join(__dirname, '..', 'data', 'submissions');

// GET all submissions, grouped by subject and level
router.get('/', async (req, res) => {
    const groupedSubmissions = {};
    try {
        await fs.mkdir(submissionsPath, { recursive: true });
        const files = await fs.readdir(submissionsPath);

        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = await fs.readFile(path.join(submissionsPath, file), 'utf8');
                const submission = JSON.parse(data);
                
                const { subject, level } = submission;

                if (!groupedSubmissions[subject]) {
                    groupedSubmissions[subject] = {};
                }
                if (!groupedSubmissions[subject][level]) {
                    groupedSubmissions[subject][level] = [];
                }
                groupedSubmissions[subject][level].push(submission);
            }
        }
        
        // Sort submissions within each level by timestamp (most recent first)
        for (const subject in groupedSubmissions) {
            for (const level in groupedSubmissions[subject]) {
                groupedSubmissions[subject][level].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }
        }
        
        res.status(200).json(groupedSubmissions);
    } catch (error) {
        console.error("Error fetching submissions:", error);
        res.status(500).json({ message: "Failed to fetch submissions." });
    }
});

module.exports = router;