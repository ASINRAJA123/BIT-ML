const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const questionsRoutes = require('./routes/questions');
const evaluateRoutes = require('./routes/evaluate');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin'); // <-- Add this
const submissionsRoutes = require('./routes/submissions'); // <-- ADD THIS


const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/evaluate', evaluateRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes); // <-- Add this
app.use('/api/submissions', submissionsRoutes); // <-- ADD THIS


// Serve static assets if in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
});