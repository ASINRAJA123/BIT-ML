import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import Spinner from '../Spinner/Spinner';
import './ExamPage.css';
import Editor from "@monaco-editor/react";

// Reusable Cell component for the notebook interface
const CodeCell = ({ question, cellCode, onCodeChange, onRun, onValidate, runResult, isRunning, isValidated }) => {
    const [customInput, setCustomInput] = useState('');

    useEffect(() => {
        if (question?.test_cases?.[0]?.input) {
            setCustomInput(question.test_cases[0].input);
        }
    }, [question]);

    return (
        <div className="code-cell">
            <div className="problem-panel">
                <h3>{question.title} {isValidated && <span className="validation-checkmark">✅</span>}</h3>
                <p dangerouslySetInnerHTML={{ __html: question.description.replace(/\n/g, '<br/>') }} />
            </div>
            <div className="editor-panel">
                <Editor
                    height="200px"
                    language="python"
                    theme="vs-dark"
                    value={cellCode}
                    onChange={(value) => onCodeChange({ target: { value: value || '' } })}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                        wordWrap: 'on'
                    }}
                />
            </div>
            <div className="cell-actions">
                <div className="run-controls">
                    <label className="custom-input-label">Custom Input (for 'Run Code')</label>
                    <textarea 
                        className="custom-input-cell" 
                        value={customInput} 
                        onChange={e => setCustomInput(e.target.value)} 
                        placeholder="Enter input here. Each line is a separate input() call." 
                        rows="3" 
                    />
                    <button className="run-code-btn" onClick={() => onRun(customInput)} disabled={isRunning}>{isRunning ? 'Running...' : 'Run Code'}</button>
                </div>
                <div className="validate-controls">
                     <button className="validate-btn" onClick={onValidate} disabled={isRunning}>{isRunning ? 'Validating...' : 'Validate with Test Cases'}</button>
                </div>
            </div>
            {runResult && (
                 <div className="output-container">
                    {runResult.test_results ? (
                        <div className="validation-results">
                            <h4>Validation Results ({runResult.test_results.filter(Boolean).length}/{runResult.test_results.length} passed)</h4>
                            {runResult.test_results.map((passed, i) => (
                                <div key={i} className={`test-result-item ${passed ? 'passed' : 'failed'}`}>{`Test Case ${i + 1}: ${passed ? 'Passed ✔' : 'Failed ❌'}`}</div>
                            ))}
                        </div>
                    ) : (
                        <div className={`output-box ${runResult.error ? 'failed' : 'passed'}`}>
                            <p><strong>Output:</strong></p>
                            <pre>{runResult.output ?? 'No output produced.'}</pre>
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

    useEffect(() => {
        const fetchAndPrepareQuestions = async () => {
            try {
                setIsLoading(true);
                const res = await fetch(`http://localhost:3001/api/questions/${subject}/${level}`);
                const data = await res.json();
                const shuffled = data.sort(() => 0.5 - Math.random());
                const selectedQuestions = shuffled.slice(0, 2);
                setQuestions(selectedQuestions);
                const initialCode = {};
                const initialValidation = {};
                selectedQuestions.forEach(q => {
                    initialCode[q.id] = ''; 
                    initialValidation[q.id] = false;
                });
                setAllCode(initialCode);
                setValidationStatus(initialValidation);
            } catch (error) { console.error("Failed to fetch questions:", error); } 
            finally { setIsLoading(false); }
        };
        fetchAndPrepareQuestions();
    }, [subject, level]);

    const handleCodeChange = (questionId, newCode) => {
        setAllCode(prev => ({ ...prev, [questionId]: newCode }));
        setValidationStatus(prev => ({ ...prev, [questionId]: false }));
    };

    // This is the STATELESS "scratchpad" run.
    const handleRunCell = async (questionId, customInput) => {
        setIsLoading(true);
        setRunOutputs(prev => ({ ...prev, [questionId]: null }));

        try {
            // Get index of the current cell
            const currentIndex = questions.findIndex(q => q.id === questionId);

            // Collect cumulative code from all previous cells + current cell
            const cumulativeCode = questions
                .slice(0, currentIndex + 1)
                .map(q => {
                    const code = allCode[q.id]?.trim();
                    return code && code.length > 0 ? code : 'pass';
                })
                .join('\n\n');

            // Send cumulative code to backend
            const res = await fetch('http://localhost:3001/api/evaluate/run-cell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cellCode: cumulativeCode,
                    customInput: customInput || ''
                }),
            });

            const result = await res.json();
            setRunOutputs(prev => ({ ...prev, [questionId]: result }));
        } catch (error) {
            setRunOutputs(prev => ({ ...prev, [questionId]: { error: 'Failed to connect to server.' } }));
        } finally {
            setIsLoading(false);
        }
    };



    // This is the STATELESS validation of the current cell.
    const handleValidateCell = async (questionId) => {
        setIsLoading(true);
        setRunOutputs(prev => ({ ...prev, [questionId]: null }));
        
        // --- THE FIX: We only send the code from the CURRENT cell for validation ---
        const cellCode = allCode[questionId]?.trim() ? allCode[questionId] : 'pass';
        
        try {
            const res = await fetch(`http://localhost:3001/api/evaluate/validate-cell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, level, questionId, cellCode }),
            });
            const result = await res.json();
            setRunOutputs(prev => ({ ...prev, [questionId]: result }));

            if (result.test_results) {
                const allPassed = result.test_results.every(p => p === true);
                setValidationStatus(prev => ({ ...prev, [questionId]: allPassed }));
            }
        } catch (error) {
            setRunOutputs(prev => ({ ...prev, [questionId]: { error: 'Failed to connect to server.' } }));
        } finally {
            setIsLoading(false);
        }
    };
    
    // This is the ONLY STATEFUL operation.
    const handleSubmitExam = async () => {
        if (!window.confirm("Are you sure you want to submit? This will be graded and cannot be changed.")) return;
        setIsSubmitting(true);
        try {
            const orderedAnswers = {};
            questions.forEach(q => {
                orderedAnswers[q.id] = allCode[q.id] || 'pass';
            });
            const res = await fetch('http://localhost:3001/api/evaluate/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user.username, subject, level, answers: orderedAnswers }),
            });
            const result = await res.json();
            alert(result.message);
            if (result.success && result.updatedUser) {
                updateUserSession(result.updatedUser);
            }
            navigate('/dashboard');
        } catch (error) {
            alert('An error occurred during submission.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading && !questions.length) return <Spinner />;

    return (
        <div className="exam-notebook-layout">
            <header className="exam-notebook-header">
                <h1>{subject.toUpperCase()} - Level {level} Exam</h1>
                <button className="submit-exam-btn" onClick={handleSubmitExam} disabled={isSubmitting}>
                    {isSubmitting ? 'Grading...' : 'Submit Final Answers'}
                </button>
            </header>
            <main className="exam-notebook-main">
                {questions.map(q => (
                    <CodeCell
                        key={q.id}
                        question={q}
                        cellCode={allCode[q.id] || ''}
                        onCodeChange={e => handleCodeChange(q.id, e.target.value)}
                        onRun={(customInput) => handleRunCell(q.id, customInput)}
                        onValidate={() => handleValidateCell(q.id)}
                        runResult={runOutputs[q.id]}
                        isRunning={isLoading}
                        isValidated={validationStatus[q.id]}
                    />
                ))}
            </main>
        </div>
    );
};

export default ExamPage;