const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const questionsRoutes = require('./routes/questions');
const evaluateRoutes = require('./routes/evaluate');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin'); 
const submissionsRoutes = require('./routes/submissions');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/evaluate', evaluateRoutes); // This now correctly points to your evaluate.js file
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes); 
app.use('/api/submissions', submissionsRoutes);

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