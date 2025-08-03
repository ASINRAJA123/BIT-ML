const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const submissionsPath = path.join(__dirname, '..', 'data', 'submissions');

// --- MODIFIED: GET all submissions, aggregated for the "Aggregate View" ---
// This endpoint now correctly handles the new data structure where each file is an array of submissions.
router.get('/', async (req, res) => {
    const groupedSubmissions = {};
    try {
        await fs.mkdir(submissionsPath, { recursive: true });
        const files = await fs.readdir(submissionsPath);

        for (const file of files) {
            if (file.endsWith('.json')) {
                // The filename is the username (e.g., "student1.json" -> "student1")
                const username = path.basename(file, '.json');
                const filePath = path.join(submissionsPath, file);
                const fileContent = await fs.readFile(filePath, 'utf8');
                
                // CRITICAL CHANGE: Parse the file content as an array of submissions
                const studentSubmissions = JSON.parse(fileContent);

                // Now, loop through each submission within that student's file
                for (const submission of studentSubmissions) {
                    const { subject, level } = submission;

                    // Ensure the object has the required fields
                    if (!subject || !level) continue;

                    // Initialize the data structure if it doesn't exist
                    if (!groupedSubmissions[subject]) {
                        groupedSubmissions[subject] = {};
                    }
                    if (!groupedSubmissions[subject][level]) {
                        groupedSubmissions[subject][level] = [];
                    }

                    // Add the username to the submission object and push it
                    groupedSubmissions[subject][level].push({
                        ...submission, // Copy original properties (status, timestamp, etc.)
                        username: username // Add the username from the filename
                    });
                }
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
        console.error("Error fetching and aggregating submissions:", error);
        res.status(500).json({ message: "Failed to fetch submissions." });
    }
});

// --- NEW: GET submissions for a specific student for the "Student View" ---
// This endpoint is required by the new "Student View" functionality on the frontend.
router.get('/:username', async (req, res) => {
    const { username } = req.params;
    const studentFilePath = path.join(submissionsPath, `${username}.json`);

    try {
        // Read the specific student's submission file
        const data = await fs.readFile(studentFilePath, 'utf8');
        const submissions = JSON.parse(data);
        res.status(200).json(submissions);
    } catch (error) {
        // Handle cases where the file doesn't exist (e.g., student not found)
        if (error.code === 'ENOENT') {
            return res.status(404).json({ message: `Submissions for user '${username}' not found.` });
        }
        // Handle other errors (e.g., malformed JSON)
        console.error(`Error fetching submissions for user ${username}:`, error);
        res.status(500).json({ message: "Failed to fetch student submissions." });
    }
});


module.exports = router;