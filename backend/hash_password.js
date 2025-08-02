// backend/hash_password.js
const bcrypt = require('bcrypt');
const saltRounds = 10;
const plainPassword = 'password123'; // The password for your users

bcrypt.hash(plainPassword, saltRounds, function(err, hash) {
    if (err) {
        console.error("Error hashing password:", err);
        return;
    }
    console.log("Hashed Password:", hash);
});