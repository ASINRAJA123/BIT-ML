import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import Spinner from '../Spinner/Spinner';
import './StudentDashboard.css';

// SVG Icon for the back button
const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path>
  </svg>
);

const StudentDashboard = () => {
    const [subjects, setSubjects] = useState({});
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [loading, setLoading] = useState(true);
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchSubjectStructure = async () => {
            setLoading(true);
            try {
                const res = await fetch('http://localhost:3001/api/questions');
                setSubjects(await res.json());
            } catch (error) {
                console.error("Failed to fetch subject structure:", error);
            } finally {
                setLoading(false);
            }
        };

        if (user) {
            fetchSubjectStructure();
        } else {
            setLoading(false); // Stop loading if no user
        }
    }, [user]);

    // Navigates to the exam page
    const handleStartExam = (subject, levelNum) => {
        navigate(`/exam/${subject}/${levelNum}`);
    };

    if (loading) return <Spinner />;
    if (!user) return null; // Don't render if logged out

    // This is the view for showing the levels of a selected subject.
    if (selectedSubject) {
        // --- THIS IS THE NEW LOGIC ---
        // A flag to ensure we only show the "Start Exam" button ONCE.
        let firstUnlockedFound = false;

        return (
            <div className="container">
                <button onClick={() => setSelectedSubject(null)} className="back-button">
                    <BackIcon />
                    <span>All Subjects</span>
                </button>
                <h1 className="dashboard-title">{selectedSubject.toUpperCase()} Levels</h1>
                <div className="levels-list">
                    {subjects[selectedSubject]?.map(levelName => {
                        const levelNum = levelName.replace('level', '');
                        const status = user.progress?.[selectedSubject]?.[levelName] || 'locked';

                        // Determine if this is the very first 'unlocked' level we've encountered in the list.
                        const isFirstUnlocked = status === 'unlocked' && !firstUnlockedFound;
                        
                        // If we find it, we set the flag to true so no subsequent
                        // 'unlocked' levels get the primary "Start Exam" button.
                        if (isFirstUnlocked) {
                            firstUnlockedFound = true;
                        }
                        
                        return (
                            <div key={levelName} className={`level-card status-${status}`}>
                                <div className="level-info">
                                    <span className={`level-tag tag-${status}`}>{status}</span>
                                    <h2 className="level-title">Practice Problems: Level {levelNum}</h2>
                                    <p className="level-description">Sharpen your skills with a set of challenges.</p>
                                </div>
                                <div className="level-action">
                                    {/* Conditionally render the correct action based on status */}
                                    
                                    {/* Show "Review Exam" for any completed level */}
                                    {status === 'completed' && (
                                        <button className="start-exam-button" onClick={() => handleStartExam(selectedSubject, levelNum)}>
                                            Review Exam
                                        </button>
                                    )}

                                    {/* Show "Start Exam" ONLY for the first unlocked level */}
                                    {isFirstUnlocked && (
                                        <button className="start-exam-button" onClick={() => handleStartExam(selectedSubject, levelNum)}>
                                            Start Exam
                                        </button>
                                    )}
                                    
                                    {/* Show "Locked" text for any locked level */}
                                    {status === 'locked' && (
                                        <span className="locked-text">Locked</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // This is the main view for showing all available subjects. (No changes here)
    return (
        <div className="container">
            <h1 className="dashboard-title">Welcome, {user.username}!</h1>
            <p className="dashboard-subtitle">Choose a subject to begin your practice.</p>
            <div className="subjects-grid">
                {Object.keys(subjects).map(subject => (
                    <div key={subject} className="subject-card" onClick={() => setSelectedSubject(subject)}>
                        <div className="subject-card-content">
                            <h2 className="subject-title">{subject.toUpperCase()}</h2>
                            <p className="subject-description">{subjects[subject]?.length || 0} Levels available</p>
                        </div>
                        <span className="subject-card-cta">View Levels →</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StudentDashboard;