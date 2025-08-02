// backend/utils/progressHelper.js
const fs = require('fs').promises;
const path = require('path');

const questionsBasePath = path.join(__dirname, '..', 'data', 'questions');

/**
 * Scans the entire /data/questions directory and builds a complete
 * level-based progress object. Level 1 is unlocked, others are locked.
 * @returns {Promise<object>} A promise that resolves to the initial progress object.
 */
const buildInitialProgress = async () => {
    const initialProgress = {};
    try {
        const subjects = await fs.readdir(questionsBasePath);

        for (const subject of subjects) {
            const subjectPath = path.join(questionsBasePath, subject);
            const stats = await fs.stat(subjectPath);
            if (stats.isDirectory()) {
                initialProgress[subject] = {};
                const levels = await fs.readdir(subjectPath);
                
                // Sort levels numerically
                const sortedLevels = levels
                    .filter(l => l.startsWith('level'))
                    .sort((a, b) => parseInt(a.replace('level',''), 10) - parseInt(b.replace('level',''), 10));

                sortedLevels.forEach((level, index) => {
                    // Level 1 is unlocked, all subsequent levels are locked
                    initialProgress[subject][level] = (index === 0) ? "unlocked" : "locked";
                });
            }
        }
    } catch (error) {
        console.error("Error building initial progress:", error);
    }
    return initialProgress;
};

module.exports = { buildInitialProgress };