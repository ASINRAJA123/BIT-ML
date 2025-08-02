// frontend/src/components/AdminDashboard/AdminDashboard.jsx

import React, { useState, useEffect, useRef } from 'react';
import Spinner from '../Spinner/Spinner';
import './AdminDashboard.css';

// --- Reusable CSVUploader Component (Unchanged) ---
const CSVUploader = ({ title, endpoint, templateName, onUploadComplete }) => {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => { setFile(e.target.files[0]); setMessage({ type: '', text: '' }); };
    const handleUpload = async () => {
        if (!file) { setMessage({ type: 'error', text: 'Please select a file first.' }); return; }
        setIsUploading(true);
        setMessage({ type: '', text: '' });
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`http://localhost:3001/api/admin${endpoint}`, { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setMessage({ type: 'success', text: data.message });
            if (onUploadComplete) onUploadComplete();
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Upload failed.' });
        } finally {
            setIsUploading(false);
            setFile(null);
            if(fileInputRef.current) fileInputRef.current.value = "";
        }
    };
    return (
        <div className="csv-uploader">
            <h4>{title}</h4>
            <p>Upload a CSV file. <a href={`/templates/${templateName}`} download>Download Template</a></p>
            <div className="uploader-controls">
                <input type="file" accept=".csv" onChange={handleFileChange} ref={fileInputRef} />
                <button onClick={handleUpload} disabled={isUploading || !file}>{isUploading ? 'Uploading...' : 'Upload'}</button>
            </div>
            {message.text && <p className={`message ${message.type}`}>{message.text}</p>}
        </div>
    );
};

// --- User Management Tab Content (Unchanged) ---
const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/users');
            if (res.ok) setUsers(await res.json());
        } catch (error) { console.error("Failed to fetch users:", error); }
        setIsLoading(false);
    };
    useEffect(() => { fetchUsers(); }, []);
    return (
        <div className="admin-section">
            <div className="admin-form-section">
                <CSVUploader title="Upload New Users via CSV" endpoint="/upload-users" templateName="users_template.csv" onUploadComplete={fetchUsers}/>
            </div>
            <h3>All Users ({users.length})</h3>
            {isLoading ? <Spinner /> : (
                 <div className="user-table-container">
                    <table className="user-table">
                        <thead><tr><th>Username</th><th>Role</th></tr></thead>
                        <tbody>
                            {users.map(user => (<tr key={user.username}><td>{user.username}</td><td>{user.role}</td></tr>))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// --- Question Management Tab Content (Unchanged) ---
const QuestionManagement = () => {
    const [subjectsData, setSubjectsData] = useState({});
    const [subject, setSubject] = useState('');
    const [level, setLevel] = useState('');
    const [id, setId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [template, setTemplate] = useState('def function_name(param):\n    # Your code here\n    pass');
    const [testCases, setTestCases] = useState([{ description: '', code_to_run: '', expected_output: '' }]);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchSubjects = async () => {
        const res = await fetch('http://localhost:3001/api/questions');
        const data = await res.json();
        setSubjectsData(data);
        if (Object.keys(data).length > 0) {
            const firstSubject = Object.keys(data)[0];
            setSubject(firstSubject);
            if(data[firstSubject]?.[0]) setLevel(data[firstSubject][0].replace('level', ''));
        }
    };
    useEffect(() => { fetchSubjects() }, []);

    const handleTestCaseChange = (index, field, value) => {
        const newTestCases = [...testCases];
        newTestCases[index][field] = value;
        setTestCases(newTestCases);
    };
    const addTestCase = () => {
        if (testCases.length < 5) setTestCases([...testCases, { description: '', code_to_run: '', expected_output: '' }]);
    };
    const removeTestCase = (index) => {
        setTestCases(testCases.filter((_, i) => i !== index));
    };
    const handleAddQuestion = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage({ type: '', text: '' });
        const newQuestion = {
            id, title, description, template,
            test_cases: testCases.filter(tc => tc.code_to_run.trim() !== '' && tc.expected_output.trim() !== '')
        };
        try {
            const res = await fetch('http://localhost:3001/api/questions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, level, newQuestion }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setMessage({ type: 'success', text: data.message});
            setId(''); setTitle(''); setDescription(''); setTemplate('def function_name(param):\n    # Your code here\n    pass');
            setTestCases([{ description: '', code_to_run: '', expected_output: '' }]);
        } catch(err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <div className="admin-section">
            <div className="admin-form-section">
                <h3>Add Single Question</h3>
                 <form onSubmit={handleAddQuestion} className="admin-form-grid">
                    <div className="form-group"><label>Subject</label><select value={subject} onChange={e => setSubject(e.target.value)} required>{Object.keys(subjectsData).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select></div>
                    <div className="form-group"><label>Level</label><select value={level} onChange={e => setLevel(e.target.value)} required>{subjectsData[subject]?.map(l => { const n=l.replace('level',''); return <option key={l} value={n}>{n}</option>})}</select></div>
                    <div className="form-group full-width"><label>Question ID (e.g., q3, find_average)</label><input type="text" value={id} onChange={e => setId(e.target.value)} required /></div>
                    <div className="form-group full-width"><label>Question Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} required /></div>
                    <div className="form-group full-width"><label>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} required /></div>
                    <div className="form-group full-width"><label>Code Template</label><textarea className="code-input" value={template} onChange={e => setTemplate(e.target.value)} required /></div>
                    <div className="form-group full-width">
                        <label>Test Cases (Max 5, first is visible)</label>
                        <div className="test-case-list">{testCases.map((tc, index) => (
                            <div key={index} className="test-case-row">
                                <input type="text" value={tc.description} onChange={e => handleTestCaseChange(index, 'description', e.target.value)} placeholder={index === 0 ? "Visible Test Description" : `Hidden Test ${index} Desc.`}/>
                                <textarea className="code-input" value={tc.code_to_run} onChange={e => handleTestCaseChange(index, 'code_to_run', e.target.value)} placeholder={`Test Code (e.g., print(my_func(1)))`} rows="2" required/>
                                <textarea className="code-input" value={tc.expected_output} onChange={e => handleTestCaseChange(index, 'expected_output', e.target.value)} placeholder={`Expected Output`} rows="2" required/>
                                {testCases.length > 1 && (<button type="button" className="remove-tc-btn" onClick={() => removeTestCase(index)}>Remove</button>)}
                            </div>))}
                        </div>
                        {testCases.length < 5 && (<button type="button" className="add-tc-btn" onClick={addTestCase}>+ Add Test Case</button>)}
                    </div>
                    <button type="submit" className="full-width" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Add Question'}</button>
                </form>
                {message.text && <p className={`message ${message.type}`}>{message.text}</p>}
            </div>
            <div className="admin-form-section">
                <CSVUploader title="Upload Questions via CSV" endpoint="/upload-questions" templateName="questions_template.csv" onUploadComplete={fetchSubjects}/>
            </div>
        </div>
    );
};

// --- Subject Management Tab Content (Unchanged) ---
const SubjectManagement = () => {
    const [subjectName, setSubjectName] = useState('');
    const [numLevels, setNumLevels] = useState(3);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const handleCreate = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage({ type: '', text: '' });
        try {
            const res = await fetch('http://localhost:3001/api/admin/create-subject', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subjectName, numLevels: parseInt(numLevels) })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setMessage({ type: 'success', text: data.message });
            setSubjectName('');
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Failed to create subject.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <div className="admin-section">
            <h3>Create New Subject</h3>
            <p>This will create the necessary folder structure and update all existing users.</p>
            <form onSubmit={handleCreate} className="admin-form-grid">
                <div className="form-group"><label>New Subject Name (e.g., dsa, web_dev)</label><input type="text" value={subjectName} onChange={e => setSubjectName(e.target.value)} required /></div>
                <div className="form-group"><label>Number of Levels to Create</label><input type="number" value={numLevels} onChange={e => setNumLevels(e.target.value)} min="1" required /></div>
                <button type="submit" className="full-width" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Subject'}</button>
            </form>
            {message.text && <p className={`message ${message.type}`}>{message.text}</p>}
        </div>
    );
};

// --- NEW SUBMISSIONS VIEWER COMPONENT ---
const SubmissionsViewer = () => {
    const [submissions, setSubmissions] = useState({});
    const [subjects, setSubjects] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedLevel, setSelectedLevel] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSubmissions = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/submissions');
                const data = await res.json();
                setSubmissions(data);
                const availableSubjects = Object.keys(data);
                setSubjects(availableSubjects);
                if (availableSubjects.length > 0) {
                    setSelectedSubject(availableSubjects[0]);
                }
            } catch (error) {
                console.error("Error fetching submissions", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSubmissions();
    }, []);
    
    const levelsForSubject = selectedSubject ? Object.keys(submissions[selectedSubject] || {}) : [];
    const displayedSubmissions = (selectedSubject && selectedLevel && submissions[selectedSubject]?.[selectedLevel]) || [];

    return (
        <div className="admin-section">
            <h3>View Student Submissions</h3>
            {isLoading ? <Spinner /> : (
                <>
                    <div className="submission-filters">
                        <div className="form-group">
                            <label>Select Subject</label>
                            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                                <option value="">-- Subjects --</option>
                                {subjects.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Select Level</label>
                            <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)} disabled={!selectedSubject}>
                                <option value="">-- Levels --</option>
                                {levelsForSubject.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="user-table-container">
                        <table className="user-table">
                            <thead><tr><th>Username</th><th>Status</th><th>Timestamp</th></tr></thead>
                            <tbody>
                                {displayedSubmissions.length > 0 ? (
                                    displayedSubmissions.map((sub, index) => (
                                        <tr key={index}>
                                            <td>{sub.username}</td>
                                            <td><span className={`status-badge status-${sub.status}`}>{sub.status}</span></td>
                                            <td>{new Date(sub.timestamp).toLocaleString()}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="3">No submissions for this selection.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};


// --- Main Admin Dashboard Component (MODIFIED) ---
const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('users');
    const tabs = {
        users: { label: "User Management", component: <UserManagement /> },
        questions: { label: "Question Management", component: <QuestionManagement /> },
        subjects: { label: "Subject Management", component: <SubjectManagement /> },
        submissions: { label: "Submissions", component: <SubmissionsViewer /> } // <-- ADD NEW TAB
    };
    return (
        <div className="container">
            <h1 className="dashboard-title">Admin Panel</h1>
            <div className="admin-tabs">{Object.entries(tabs).map(([key, {label}]) => (<button key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? 'active' : ''}>{label}</button>))}</div>
            <div className="admin-content">{tabs[activeTab].component}</div>
        </div>
    );
};

export default AdminDashboard;