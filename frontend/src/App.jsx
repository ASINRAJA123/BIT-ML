// frontend/src/App.jsx

import React, { useState, createContext } from 'react';
// MODIFICATION: 1. Import useLocation to read the current URL
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage/LoginPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import ExamPage from './pages/ExamPage/ExamPage';
import Header from './components/Header/Header';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

// Create a context to hold user authentication state
export const AuthContext = createContext(null);

function App() {
  // Try to get user from sessionStorage, otherwise it's null
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // MODIFICATION: 2. Get the current location object
  // This hook must be used inside a component rendered by your <Router>
  const location = useLocation();

  // MODIFICATION: 3. Create a boolean to check if we are on an exam page
  // This will be true for any URL like /exam/python/1, /exam/javascript/3, etc.
  const isExamPage = location.pathname.startsWith('/exam/');


  const handleLogin = (userData) => {
    sessionStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('user');
    setUser(null);
  };

  const updateUserSession = (updatedUserData) => {
      if (user) {
        sessionStorage.setItem('user', JSON.stringify(updatedUserData));
        setUser(updatedUserData);
      }
  };
  
  const authContextValue = {
    user,
    login: handleLogin,
    logout: handleLogout,
    updateUserSession
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {/* 
        MODIFICATION: 4. Add a conditional class to the main div.
        This allows you to adjust styles in App.css for the exam view
        (e.g., removing padding-top that was there for the header).
      */}
      <div className={`app ${isExamPage ? 'in-exam' : ''}`}>
        
        {/*
          MODIFICATION: 5. Update the rendering logic for the Header.
          It now only renders if a user is logged in AND they are NOT on an exam page.
        */}
        {user && !isExamPage && <Header />}

        <main className="main-content">
          <Routes>
            {/* --- Public Route: Login Page --- */}
            <Route 
              path="/login" 
              element={user ? <Navigate to="/dashboard" /> : <LoginPage />} 
            />
            
            {/* --- Protected Routes --- */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/exam/:subject/:level" 
              element={
                <ProtectedRoute>
                  <ExamPage />
                </ProtectedRoute>
              } 
            />

            {/* --- Catch-all Route --- */}
            <Route 
              path="*" 
              element={<Navigate to={user ? "/dashboard" : "/login"} />} 
            />
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  );
}

// NOTE: For this to work, your App component must be a child of <BrowserRouter>.
// This is typically done in your `main.jsx` or `index.js` file like this:
/*
  // In main.jsx
  import { BrowserRouter } from 'react-router-dom';

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
*/

export default App;