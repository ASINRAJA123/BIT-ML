import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import './Header.css';

const Header = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/dashboard" className="header-logo">CodePlatform</Link>
        <div className="header-nav">
          <span className="user-info">Welcome, {user.username} ({user.role})</span>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
      </div>
    </header>
  );
};

export default Header;