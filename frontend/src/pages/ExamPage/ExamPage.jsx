// components/ExamPage/ExamPage.js

import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import Spinner from '../Spinner/Spinner';
import './ExamPage.css';
import Editor from "@monaco-editor/react";

const EXECUTION_SEPARATOR = "---EXECUTION_CELL_SEPARATOR---";
const MAX_WARNINGS = 3;

// (The CodeCell component remains unchanged)
const CodeCell = ({ question, cellCode, onCodeChange, onRun, onValidate, runResult, isRunning, isValidated }) => {
    const [customInput, setCustomInput] = useState('');
    useEffect(() => { if (question?.test_cases?.[0]?.input) { setCustomInput(question.test_cases[0].input); } }, [question]);
    return (
        <div className="code-cell">
            <div className="problem-panel">
                <h3>{question.title} {isValidated && <span className="validation-checkmark" title="All test cases passed validation">✅</span>}</h3>
                <p dangerouslySetInnerHTML={{ __html: question.description.replace(/\n/g, '<br/>') }} />
            </div>
            <div className="editor-panel">
                <Editor height="200px" language="python" theme="vs-dark" value={cellCode} onChange={(value) => onCodeChange({ target: { value: value || '' } })} options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, wordWrap: 'on' }} />
            </div>
            <div className="cell-actions">
                <div className="run-controls">
                    <label className="custom-input-label">Custom Input (for 'Run Code')</label>
                    <textarea className="custom-input-cell" value={customInput} onChange={e => setCustomInput(e.target.value)} placeholder="Enter input here for the 'Run Code' button." rows="3" />
                    <button className="run-code-btn" onClick={() => onRun(customInput)} disabled={isRunning}>{isRunning ? 'Running...' : 'Run Code'}</button>
                </div>
                <div className="validate-controls">
                     <button className="validate-btn" onClick={onValidate} disabled={isRunning}>{isRunning ? 'Validating...' : 'Validate'}</button>
                </div>
            </div>
            {runResult && (
                 <div className="output-container">
                    {runResult.test_results ? (
                        <div className="validation-results">
                            <h4>Validation Results ({runResult.test_results.filter(Boolean).length}/{runResult.test_results.length} passed)</h4>
                            {runResult.test_results.map((passed, i) => ( <div key={i} className={`test-result-item ${passed ? 'passed' : 'failed'}`}>{`Test Case ${i + 1}: ${passed ? 'Passed ✔' : 'Failed ❌'}`}</div> ))}
                        </div>
                    ) : (
                        <div className={`output-box ${runResult.error ? 'failed' : 'passed'}`}>
                            <p><strong>Output:</strong></p><pre>{runResult.output ?? 'No output produced.'}</pre>
                            {runResult.error && <p><strong>Error:</strong><pre className="error-text">{runResult.error}</pre></p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


// Main Exam Page component
const ExamPage = () => {
    const { subject, level } = useParams();
    const navigate = useNavigate();
    const { user, updateUserSession } = useContext(AuthContext);

    const [questions, setQuestions] = useState([]);
    const [allCode, setAllCode] = useState({});
    const [runOutputs, setRunOutputs] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationStatus, setValidationStatus] = useState({});
    const [examStarted, setExamStarted] = useState(false);
    const [warningInfo, setWarningInfo] = useState({ show: false, message: '' });
    const [warnings, setWarnings] = useState(0);

    const hasSubmitted = useRef(false);
    const isExitingProgrammatically = useRef(false);

    useEffect(() => {
        const fetchAndPrepareQuestions = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`http://localhost:3001/api/questions/${subject}/${level}`);
                const data = await res.json();
                const shuffled = data.sort(() => 0.5 - Math.random());
                const numQuestionsToSelect = data.some(q => q.test_cases.some(tc => tc.type)) ? 1 : 2;
                const selectedQuestions = shuffled.slice(0, numQuestionsToSelect);
                setQuestions(selectedQuestions);
                const initialCode = {};
                selectedQuestions.forEach(q => { initialCode[q.id] = q.starter_code || ''; });
                setAllCode(initialCode);
            } catch (error) { console.error("Failed to fetch questions:", error); }
            finally { setIsLoading(false); }
        };
        fetchAndPrepareQuestions();
    }, [subject, level]);
    
    const handleCodeChange = (questionId, newCode) => { setAllCode(prev => ({ ...prev, [questionId]: newCode })); setValidationStatus(prev => ({ ...prev, [questionId]: false })); };
    
    // Run Cell logic remains stateful for interactive development
    const handleRunCell = async (questionId, customInput) => {
        setIsLoading(true);
        setRunOutputs(prev => ({ ...prev, [questionId]: null }));
        try {
            const currentIndex = questions.findIndex(q => q.id === questionId);
            const setupCodeParts = [];
            for (let i = 0; i < currentIndex; i++) {
                const prevQuestion = questions[i];
                const prevCode = allCode[prevQuestion.id] || 'pass';
                setupCodeParts.push(prevCode);
            }
            const setupCode = setupCodeParts.join(`\n\nprint("${EXECUTION_SEPARATOR}")\n\n`);
            const currentCode = allCode[questionId] || 'pass';
            const cumulativeCode = setupCode ? `${setupCode}\n\nprint("${EXECUTION_SEPARATOR}")\n\n${currentCode}` : currentCode;
            const res = await fetch('http://localhost:3001/api/evaluate/run-cell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cellCode: cumulativeCode, customInput: customInput || '' }), });
            const result = await res.json();
            setRunOutputs(prev => ({ ...prev, [questionId]: result }));
        } catch (error) { setRunOutputs(prev => ({ ...prev, [questionId]: { error: 'Failed to connect to the execution server.' } })); }
        finally { setIsLoading(false); }
    };

    // --- MODIFIED VALIDATE CELL LOGIC ---
    const handleValidateCell = async (questionId) => {
        setIsLoading(true);
        setRunOutputs(prev => ({ ...prev, [questionId]: null }));
        const questionData = questions.find(q => q.id === questionId);
        if (!questionData) { setIsLoading(false); return; }

        // Detect if this is a complex, single-script question (like Level 2)
        const isComplexSingleScript = questionData.test_cases.some(tc => tc.type);
        let codeToValidate = '';

        if (isComplexSingleScript) {
            // For Level 2, combine all code into one script for validation
            codeToValidate = questions.map(q => allCode[q.id] || 'pass').join('\n\n# --- Cell Boundary ---\n\n');
        } else {
            // For Level 1, just use the code from the current cell
            codeToValidate = allCode[questionId] || 'pass';
        }

        try {
            const res = await fetch(`http://localhost:3001/api/evaluate/validate-cell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, level, questionId, cellCode: codeToValidate }),
            });
            const result = await res.json();
            setRunOutputs(prev => ({ ...prev, [questionId]: result }));
            if (result.test_results) {
                const allPassed = result.test_results.every(p => p === true);
                setValidationStatus(prev => ({ ...prev, [questionId]: allPassed }));
            }
        } catch (error) {
            setRunOutputs(prev => ({ ...prev, [questionId]: { error: 'Failed to connect to the validation server.' } }));
        } finally {
            setIsLoading(false);
        }
    };


    // --- The handleSubmitExam function is already correct from our last fix ---
    const handleSubmitExam = useCallback(async (isAutoSubmit = false) => {
        if (hasSubmitted.current) return;
        hasSubmitted.current = true;
        const confirmSubmit = isAutoSubmit ? true : window.confirm("Are you sure you want to submit your final answers?");
        if (!confirmSubmit) { hasSubmitted.current = false; return; }
        setIsSubmitting(true);
        if (isAutoSubmit) alert(`Exam submitted automatically due to rule violation.`);
        if (document.fullscreenElement) { isExitingProgrammatically.current = true; await document.exitFullscreen(); }
        try {
            const orderedAnswers = {};
            questions.forEach(q => { orderedAnswers[q.id] = allCode[q.id] || 'pass'; });
            const res = await fetch('http://localhost:3001/api/evaluate/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user.username, subject, level, answers: orderedAnswers }), });
            const result = await res.json();
            if (!isAutoSubmit) alert(result.message);
            if (result.success && result.updatedUser) {
                await Promise.resolve(updateUserSession(result.updatedUser));
            }
            navigate('/dashboard');
        } catch (error) {
            alert('An error occurred during submission. Please try again.');
            setIsSubmitting(false); hasSubmitted.current = false;
        }
    }, [questions, allCode, user, subject, level, navigate, updateUserSession]);
    
    // (Proctoring logic remains the same)
    const handleWarning = useCallback((message) => {
        if (hasSubmitted.current) return;
        setWarnings(prevWarnings => {
            const newWarningCount = prevWarnings + 1;
            setWarningInfo({ show: true, message: `${message}. Warning ${newWarningCount} of ${MAX_WARNINGS}.` });
            setTimeout(() => setWarningInfo({ show: false, message: '' }), 4000);
            if (newWarningCount >= MAX_WARNINGS) { handleSubmitExam(true); }
            return newWarningCount;
        });
    }, [handleSubmitExam]);

    useEffect(() => {
        if (!examStarted || hasSubmitted.current) return;
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) { e.preventDefault(); }
            if (e.metaKey && e.key.toLowerCase() === 'v') { e.preventDefault(); }
            if (e.key === 'F11' || e.key === 'F12') { e.preventDefault(); handleWarning(`Forbidden key pressed: ${e.key}`); }
        };
        const handleFullscreenChange = () => { if (!document.fullscreenElement && !isExitingProgrammatically.current) { handleSubmitExam(true); } };
        const preventDefault = e => e.preventDefault();
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('contextmenu', preventDefault);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('contextmenu', preventDefault);
        };
    }, [examStarted, handleWarning, handleSubmitExam]);

    const handleStartExam = async () => { try { await document.documentElement.requestFullscreen({ navigationUI: "hide" }); setExamStarted(true); } catch (err) { alert(`Fullscreen is required to start the exam. Please allow it in your browser.`); } };
    if (isLoading && !questions.length) return <Spinner />;
    if (!examStarted) {
        return (
            <div className="fullscreen-prompt-overlay">
                <div className="fullscreen-prompt-box">
                    <h2>Exam Rules & Instructions</h2>
                    <p>Read the following rules carefully before you begin:</p>
                    <ul className="rules-list">
                        <li>The exam must be taken in fullscreen mode.</li>
                        <li>Exiting fullscreen (e.g., by pressing `Esc`) will automatically submit your exam.</li>
                        <li>Copying (Ctrl+C) and Pasting (Ctrl+V, Win+V) are disabled.</li>
                        <li>Pressing F11 or F12 will issue a warning but will not exit fullscreen.</li>
                        <li>You will receive a maximum of {MAX_WARNINGS} warnings. Exceeding this will automatically submit your exam.</li>
                    </ul>
                    <button className="start-exam-btn" onClick={handleStartExam}>I Understand, Start Exam</button>
                </div>
            </div>
        );
    }
    return (
        <div className="exam-notebook-layout">
            {warningInfo.show && ( <div className="warning-overlay"><div className="warning-box"><h3>Warning Detected!</h3><p>{warningInfo.message}</p></div></div> )}
            <header className="exam-notebook-header">
                <h1>{subject.toUpperCase()} - Level {level} Exam</h1>
                <div className="exam-header-info">
                    <span className="warning-counter">Warnings: {warnings}/{MAX_WARNINGS}</span>
                    <button className="submit-exam-btn" onClick={() => handleSubmitExam(false)} disabled={isSubmitting || isLoading}>{isSubmitting ? 'Submitting...' : 'Submit Final Answers'}</button>
                </div>
            </header>
            <main className="exam-notebook-main">
                {questions.map(q => ( <CodeCell key={q.id} question={q} cellCode={allCode[q.id] || ''} onCodeChange={e => handleCodeChange(q.id, e.target.value)} onRun={(customInput) => handleRunCell(q.id, customInput)} onValidate={() => handleValidateCell(q.id)} runResult={runOutputs[q.id]} isRunning={isLoading || isSubmitting} isValidated={validationStatus[q.id]} /> ))}
            </main>
        </div>
    );
};

export default ExamPage;