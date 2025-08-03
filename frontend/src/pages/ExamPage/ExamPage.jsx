// components/ExamPage/ExamPage.js

import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import Spinner from '../Spinner/Spinner';
import './ExamPage.css';
import Editor from "@monaco-editor/react";
const EXECUTION_SEPARATOR = "---EXECUTION_CELL_SEPARATOR---"; // Use a constant


// (The CodeCell component remains the same as in the previous answer)
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
                <h3>{question.title} {isValidated && <span className="validation-checkmark" title="All test cases passed validation">✅</span>}</h3>
                <p dangerouslySetInnerHTML={{ __html: question.description.replace(/\n/g, '<br/>') }} />
            </div>
            <div className="editor-panel">
                <Editor
                    height="200px"
                    language="python"
                    theme="vs-dark"
                    value={cellCode}
                    onChange={(value) => onCodeChange({ target: { value: value || '' } })}
                    options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, wordWrap: 'on' }}
                />

            </div>
            <div className="cell-actions">
                <div className="run-controls">
                    <label className="custom-input-label">Custom Input (for 'Run Code')</label>
                    <textarea
                        className="custom-input-cell"
                        value={customInput}
                        onChange={e => setCustomInput(e.target.value)}
                        placeholder="Enter input here for the 'Run Code' button."
                        rows="3"
                    />
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
        // ... (this useEffect remains unchanged)
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
                    initialCode[q.id] = q.starter_code || '';
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
    
    /**
     * Helper function to transform code by replacing `input()` calls
     * with literal values from a test case. This is the core of the fix.
     */
    const transformCodeWithInputs = (code, testCaseInput) => {
        const inputLines = testCaseInput.split('\n');
        let i = 0;
        // Replace each occurrence of input() with a value from the test case.
        // JSON.stringify correctly wraps strings in quotes.
        return code.replace(/input\(\)/g, () => {
            if (i < inputLines.length) {
                const value = inputLines[i];
                i++;
                return JSON.stringify(value);
            }
            return '""'; // Return empty string if we run out of inputs
        });
    };

    /**
     * STATEFUL "Run" to simulate a Jupyter Notebook.
     * This is now fixed to correctly handle state from previous cells.
     */
    const handleRunCell = async (questionId, customInput) => {
        setIsLoading(true);
        setRunOutputs(prev => ({ ...prev, [questionId]: null }));

        try {
            const currentIndex = questions.findIndex(q => q.id === questionId);
            
            // 1. Create the "setup script" from previous cells
            const setupCodeParts = [];
            for (let i = 0; i < currentIndex; i++) {
                const prevQuestion = questions[i];
                const prevCode = allCode[prevQuestion.id] || 'pass';
                const firstTestCaseInput = prevQuestion.test_cases[0]?.input || '';
                const transformedCode = transformCodeWithInputs(prevCode, firstTestCaseInput);
                setupCodeParts.push(transformedCode);
            }
            const setupCode = setupCodeParts.join('\n\n# --- Cell Boundary ---\n\n');

            // 2. Get the current cell's code
            const currentCode = allCode[questionId] || 'pass';

            // 3. THE FIX: Combine them with the separator
            let cumulativeCode;
            if (setupCode) {
                // If there are previous cells, inject the separator between the setup and current code
                cumulativeCode = `${setupCode}\n\nprint("${EXECUTION_SEPARATOR}")\n\n${currentCode}`;
            } else {
                // If this is the first cell, no separator is needed
                cumulativeCode = currentCode;
            }

            // 4. Send to the backend
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
            setRunOutputs(prev => ({ ...prev, [questionId]: { error: 'Failed to connect to the execution server.' } }));
        } finally {
            setIsLoading(false);
        }
    };
    
    // THIS REMAINS STATELESS AND IS CORRECT
    const handleValidateCell = async (questionId) => {
        setIsLoading(true);
        setRunOutputs(prev => ({ ...prev, [questionId]: null }));
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
            setRunOutputs(prev => ({ ...prev, [questionId]: { error: 'Failed to connect to the validation server.' } }));
        } finally {
            setIsLoading(false);
        }
    };
    
    // THIS SENDS ALL CODE TO THE BACKEND, WHICH WILL NOW HANDLE IT CORRECTLY
    const handleSubmitExam = async () => {
        if (!window.confirm("Are you sure you want to submit your final answers? This action cannot be undone.")) return;
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
            alert('An error occurred during submission. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading && !questions.length) return <Spinner />;

    return (
        <div className="exam-notebook-layout">
            <header className="exam-notebook-header">
                <h1>{subject.toUpperCase()} - Level {level} Exam</h1>
                <button className="submit-exam-btn" onClick={handleSubmitExam} disabled={isSubmitting || isLoading}>
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
                        isRunning={isLoading || isSubmitting}
                        isValidated={validationStatus[q.id]}
                    />
                ))}
            </main>
        </div>
    );
};

export default ExamPage;