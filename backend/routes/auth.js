const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const router = express.Router();

const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        const { users } = JSON.parse(data);
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Don't send the password back to the client
        const { password: userPassword, ...userToReturn } = user;
        
        res.status(200).json({ message: 'Login successful!', user: userToReturn });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

module.exports = router;