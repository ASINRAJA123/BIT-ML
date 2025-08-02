// frontend/src/App.jsx

import React, { useState, createContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage/LoginPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import ExamPage from './pages/ExamPage/ExamPage';
import Header from './components/Header/Header';
import ProtectedRoute from './components/ProtectedRoute'; // <-- IMPORT THE NEW COMPONENT
import './App.css';

// Create a context to hold user authentication state
export const AuthContext = createContext(null);

function App() {
  // Try to get user from sessionStorage, otherwise it's null
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const handleLogin = (userData) => {
    sessionStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('user');
    setUser(null);
  };

  // This function can be used to refresh the user state in the session
  // after a level is completed, if the backend returns the updated user object.
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
    updateUserSession // <-- Expose the update function
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      <div className="app">
        {user && <Header />}
        <main className="main-content">
          <Routes>
            {/* --- Public Route: Login Page --- */}
            {/* If a user is already logged in, redirect them away from the login page. */}
            <Route 
              path="/login" 
              element={user ? <Navigate to="/dashboard" /> : <LoginPage />} 
            />
            
            {/* --- Protected Routes --- */}
            {/* All routes inside this section are now protected by the ProtectedRoute component. */}
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
            {/* Redirects any unknown URL to the correct starting page based on auth status. */}
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

export default App;