// backend/routes/users.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const { buildInitialProgress } = require('../utils/progressHelper'); // <-- IMPORT
const router = express.Router();

const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');
const saltRounds = 10;

// GET all users (for admin view)
router.get('/', async (req, res) => {
    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        const { users } = JSON.parse(data);
        const usersToReturn = users.map(u => {
            const { password, ...user } = u;
            return user;
        });
        res.status(200).json(usersToReturn);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch users." });
    }
});

// POST to create a new user (for admin)
router.post('/create', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }

    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        const usersJson = JSON.parse(data);

        if (usersJson.users.some(u => u.username === username)) {
            return res.status(409).json({ message: "Username already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // --- MODIFIED PART: Build full progress object ---
        const initialProgress = await buildInitialProgress();

        const newUser = {
            username,
            password: hashedPassword,
            role: "student",
            progress: initialProgress // <-- USE THE BUILT PROGRESS
        };
        // --- END MODIFIED PART ---

        usersJson.users.push(newUser);
        await fs.writeFile(usersFilePath, JSON.stringify(usersJson, null, 2));

        const { password: _, ...userToReturn } = newUser;
        res.status(201).json({ message: "User created successfully!", user: userToReturn });

    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Server error during user creation." });
    }
});

module.exports = router;