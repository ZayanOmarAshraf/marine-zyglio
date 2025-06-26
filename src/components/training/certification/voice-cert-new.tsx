'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Award,
  Clock,
  AlertTriangle,
  Trophy,
  Loader2,
  Mic,
  MicOff,
  ArrowRight,
  CheckCircle,
  Play,
  Pause
} from 'lucide-react';
import { toast } from 'sonner';

interface VoiceCertNewProps {
  moduleId: string;
  userId: string;
  onComplete: (result: { passed: boolean; score: number; certificationId: string }) => void;
}

interface CertificationScenario {
  id: string;
  title: string;
  description: string;
  context: string;
  expectedCompetencies: string[];
  difficulty: 'EASY' | 'NORMAL' | 'HARD';
  maxQuestions: number;
  passingScore: number;
}

interface ScenarioProgress {
  scenarioId: string;
  questionsAsked: number;
  responses: Array<{
    question: string;
    response: string;
    timestamp: Date;
    score?: number;
  }>;
  competencyScores: Record<string, number>;
  completed: boolean;
  passed: boolean;
  finalScore: number;
}

interface CertificationData {
  id: string;
  status: string;
  adaptiveDifficulty: string;
  passingThreshold: number;
  module: {
    title: string;
    procedureId: string;
  };
  scenarios: CertificationScenario[];
}

export function VoiceCertNew({ moduleId, userId, onComplete }: VoiceCertNewProps) {
  console.log("🎯 VoiceCertNew - Multi-Scenario Certification System Loading");
  
  const [certification, setCertification] = useState<CertificationData | null>(null);
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [scenarioProgress, setScenarioProgress] = useState<ScenarioProgress[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [questionAudio, setQuestionAudio] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [timeStarted, setTimeStarted] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Single initialization useEffect to prevent duplicate API calls
  useEffect(() => {
    console.log("🚀 Starting multi-scenario certification for:", { moduleId, userId });
    if (moduleId && userId && !certification && !loading) {
      initializeCertification();
    }
  }, [moduleId, userId]);

  // Timer for elapsed time
  useEffect(() => {
    if (certification && !showResults) {
      const timer = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [certification, showResults]);

  // Debug currentQuestion changes
  useEffect(() => {
    console.log('🔍 currentQuestion state changed:', currentQuestion);
  }, [currentQuestion]);

  const initializeCertification = async () => {
    if (loading || certification) {
      console.log('🚫 Skipping initialization - already loading or loaded');
      return;
    }
    
    setLoading(true);
    try {
      console.log('🔄 Generating scenarios for module:', moduleId);
      // Generate scenarios for this module
      const scenariosResponse = await fetch('/api/certification/generate-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, userId }),
      });

      if (!scenariosResponse.ok) {
        throw new Error('Failed to generate certification scenarios');
      }

      const data = await scenariosResponse.json();
      console.log("✅ Generated certification scenarios:", data);
      
      const certificationData = data.certification;
      setCertification(certificationData);
      
      const initialProgress = certificationData.scenarios.map((scenario: CertificationScenario) => ({
        scenarioId: scenario.id,
        questionsAsked: 0,
        responses: [],
        competencyScores: {},
        completed: false,
        passed: false,
        finalScore: 0
      }));
      
      setScenarioProgress(initialProgress);

      // Start first scenario with the available certification data
      await startScenarioWithData(0, certificationData);
      
    } catch (error) {
      console.error('Error initializing certification:', error);
      toast.error('Failed to initialize certification');
    } finally {
      setLoading(false);
    }
  };

  const startScenarioWithData = async (scenarioIndex: number, certificationData: CertificationData) => {
    const scenario = certificationData?.scenarios[scenarioIndex];
    if (!scenario) {
      console.error('❌ No scenario found at index:', scenarioIndex);
      return;
    }

    console.log(`🎬 Starting scenario ${scenarioIndex + 1}: ${scenario.title}`);
    console.log('📋 Scenario details:', {
      id: scenario.id,
      title: scenario.title,
      context: scenario.context?.substring(0, 100) + '...',
      maxQuestions: scenario.maxQuestions
    });
    
    // Immediately set a fallback question to ensure there's always something to show
    const fallbackQuestion = `Let's begin with this scenario: ${scenario.context}. How would you approach this situation? Please walk me through your initial thoughts and the steps you would take.`;
    setCurrentQuestion(fallbackQuestion);
    console.log(`📝 Fallback question set immediately: ${fallbackQuestion}`);
    
    try {
      console.log('🔄 Requesting first question from API...');
      
      // Generate first question for this scenario (only if not already generated)
      const response = await fetch('/api/certification/scenario-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          previousResponses: [],
          currentQuestionNumber: 1,
          moduleContent: certificationData?.module?.subtopics || []
        }),
      });

      console.log('📡 API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ API returned question data:', data);
        
        if (data.question && data.question.trim()) {
          setCurrentQuestion(data.question);
          console.log(`📝 API question replacing fallback: "${data.question}"`);
        } else {
          console.log('📝 No valid question from API, keeping fallback');
        }
        
        if (data.audioUrl) {
          setQuestionAudio(data.audioUrl);
          console.log('🔊 Audio URL set, auto-playing first question:', data.audioUrl);
          // Auto-play first question with slight delay
          setTimeout(() => {
            playQuestionAudio(data.audioUrl);
          }, 300);
        }
      } else {
        console.error('❌ API request failed with status:', response.status);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        console.log('📝 Keeping fallback question due to API failure');
      }
    } catch (error) {
      console.error('❌ Error starting scenario:', error);
      console.log('📝 Keeping fallback question due to error');
      toast.error('Using fallback question - API error');
    }
  };

  const startScenario = async (scenarioIndex: number) => {
    if (!certification) {
      console.error('Cannot start scenario: certification data not available');
      return;
    }
    
    return startScenarioWithData(scenarioIndex, certification);
  };

  const playQuestionAudio = (audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    audioRef.current = new Audio(audioUrl);
    audioRef.current.onplay = () => setIsPlayingAudio(true);
    audioRef.current.onended = () => setIsPlayingAudio(false);
    audioRef.current.onerror = () => {
      setIsPlayingAudio(false);
      console.error('Audio playback failed');
    };
    
    audioRef.current.play().catch(console.error);
  };

  const toggleAudioPlayback = () => {
    if (!audioRef.current || !questionAudio) return;
    
    if (isPlayingAudio) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await processResponse(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success("Recording started...");
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      toast.success("Processing your response...");
    }
  };

  const processResponse = async (audioBlob: Blob) => {
    const currentScenario = certification?.scenarios[currentScenarioIndex];
    if (!currentScenario) return;

    try {
      const formData = new FormData();
      formData.append('audioBlob', audioBlob);
      formData.append('certificationId', certification?.id || '');
      formData.append('scenarioId', currentScenario.id);
      formData.append('currentQuestion', currentQuestion);
      formData.append('previousResponses', JSON.stringify(scenarioProgress[currentScenarioIndex]?.responses || []));

      const response = await fetch('/api/certification/process-response', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        
        console.log('📊 Response processing results:', {
          transcription: data.transcription?.substring(0, 50) + '...',
          responseScore: data.responseScore,
          scenarioComplete: data.scenarioComplete,
          nextQuestion: data.nextQuestion ? 'Generated' : 'None',
          competencyScores: data.competencyScores
        });
        
        // Update scenario progress
        const newProgress = [...scenarioProgress];
        const currentProgress = newProgress[currentScenarioIndex];
        currentProgress.responses.push({
          question: currentQuestion,
          response: data.transcription,
          timestamp: new Date(),
          score: data.responseScore
        });
        currentProgress.questionsAsked++;
        currentProgress.competencyScores = { ...currentProgress.competencyScores, ...data.competencyScores };

        setScenarioProgress(newProgress);

        console.log(`📈 Updated progress: ${currentProgress.questionsAsked}/${currentScenario.maxQuestions} questions asked`);

        // Check if scenario is complete
        if (data.scenarioComplete || currentProgress.questionsAsked >= currentScenario.maxQuestions) {
          console.log(`✅ Scenario complete! Reason: ${data.scenarioComplete ? 'AI determined complete' : 'Max questions reached'}`);
          await completeScenario(currentScenarioIndex, data.scenarioScore || 75);
        } else {
          console.log('🔄 Continuing with next question...');
          // Get next adaptive question
          if (data.nextQuestion) {
            setCurrentQuestion(data.nextQuestion);
            console.log(`📝 Next question set: "${data.nextQuestion.substring(0, 100)}..."`);
            
            // Auto-play audio for the new question
            if (data.nextQuestionAudio) {
              setQuestionAudio(data.nextQuestionAudio);
              console.log('🔊 Auto-playing next question audio');
              // Small delay to ensure state is updated
              setTimeout(() => {
                playQuestionAudio(data.nextQuestionAudio);
              }, 200);
            }
          } else {
            console.error('❌ No next question provided');
          }
          
          if (!data.nextQuestion && data.nextQuestionAudio) {
            setQuestionAudio(data.nextQuestionAudio);
            playQuestionAudio(data.nextQuestionAudio);
          }
        }
      } else {
        console.error('❌ Response processing failed:', response.status);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        toast.error('Failed to process response');
      }
    } catch (error) {
      console.error('Error processing response:', error);
      toast.error('Failed to process response');
    } finally {
      setIsProcessing(false);
    }
  };

  const completeScenario = async (scenarioIndex: number, scenarioScore: number) => {
    const newProgress = [...scenarioProgress];
    newProgress[scenarioIndex].completed = true;
    newProgress[scenarioIndex].finalScore = scenarioScore;
    newProgress[scenarioIndex].passed = scenarioScore >= certification!.scenarios[scenarioIndex].passingScore;
    setScenarioProgress(newProgress);

    console.log(`✅ Completed scenario ${scenarioIndex + 1} with score: ${scenarioScore}%`);

    // Check if all scenarios are complete
    if (scenarioIndex + 1 >= certification!.scenarios.length) {
      await completeCertification();
    } else {
      // Move to next scenario
      setCurrentScenarioIndex(scenarioIndex + 1);
      setTimeout(() => startScenario(scenarioIndex + 1), 2000);
    }
  };

  const completeCertification = async () => {
    const overallScore = Math.round(
      scenarioProgress.reduce((sum, progress) => sum + progress.finalScore, 0) / scenarioProgress.length
    );
    
    const passed = overallScore >= certification!.passingThreshold;
    
    setFinalScore(overallScore);
    setShowResults(true);

    // Save certification completion
    try {
      await fetch('/api/certification/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificationId: certification?.id,
          scenarioProgress,
          overallScore,
          passed
        }),
      });

      onComplete({
        passed,
        score: overallScore,
        certificationId: certification?.id || ''
      });

      toast.success(passed ? 'Certification passed!' : 'Certification completed. Review and try again.');
    } catch (error) {
      console.error('Error completing certification:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOverallProgress = () => {
    const completedScenarios = scenarioProgress.filter(p => p.completed).length;
    return (completedScenarios / (certification?.scenarios.length || 1)) * 100;
  };

  if (loading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          <span>Generating certification scenarios...</span>
        </CardContent>
      </Card>
    );
  }

  if (showResults) {
    const passed = finalScore >= (certification?.passingThreshold || 70);
    
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {passed ? (
              <Trophy className="h-16 w-16 text-yellow-500" />
            ) : (
              <AlertTriangle className="h-16 w-16 text-red-500" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {passed ? 'Certification Passed!' : 'Certification Not Passed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <div className="text-4xl font-bold mb-2">{finalScore}%</div>
            <div className="text-gray-600">
              Passing threshold: {certification?.passingThreshold || 70}%
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><strong>Time Elapsed:</strong> {formatTime(timeElapsed)}</div>
            <div><strong>Scenarios Completed:</strong> {scenarioProgress.filter(p => p.completed).length}/{certification?.scenarios.length}</div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Scenario Results:</h4>
            {scenarioProgress.map((progress, index) => {
              const scenario = certification?.scenarios[index];
              return (
                <div key={scenario?.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h5 className="font-medium">{scenario?.title}</h5>
                    <Badge variant={progress.passed ? "default" : "secondary"}>
                      {progress.finalScore}%
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{scenario?.description}</p>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Questions: {progress.questionsAsked}</span>
                    <span>{progress.passed ? '✅ Passed' : '❌ Not Passed'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!certification) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <AlertTriangle className="h-8 w-8 text-red-500 mr-3" />
          <span>Failed to initialize certification session.</span>
        </CardContent>
      </Card>
    );
  }

  const currentScenario = certification.scenarios[currentScenarioIndex];
  const currentProgress = scenarioProgress[currentScenarioIndex];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Voice Certification: {certification.module.title}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Multi-scenario adaptive assessment
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                {formatTime(timeElapsed)}
              </div>
              <Badge variant="secondary" className="mt-1">
                {certification.adaptiveDifficulty} Difficulty
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{Math.round(getOverallProgress())}%</span>
            </div>
            <Progress value={getOverallProgress()} className="w-full" />
            <div className="text-xs text-gray-500">
              Scenario {currentScenarioIndex + 1} of {certification.scenarios.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Scenario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {currentScenario?.title}
          </CardTitle>
          <p className="text-sm text-gray-600">
            {currentScenario?.description}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Scenario Context:</h4>
            <p className="text-sm text-blue-800">{currentScenario?.context}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Current Question:</h4>
              {questionAudio && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAudioPlayback}
                  className="flex items-center gap-2"
                >
                  {isPlayingAudio ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlayingAudio ? 'Pause' : 'Play'} Audio
                </Button>
              )}
            </div>
            <p className="text-sm mb-4">{currentQuestion}</p>
            
            <div className="flex justify-center">
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`flex items-center gap-2 ${
                  isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}
                size="lg"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
                {isProcessing ? 'Processing...' : isRecording ? 'Stop Recording' : 'Start Recording'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Questions Asked:</strong> {currentProgress?.questionsAsked || 0}/{currentScenario?.maxQuestions}
            </div>
            <div>
              <strong>Expected Competencies:</strong> {currentScenario?.expectedCompetencies.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scenario List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Certification Scenarios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {certification.scenarios.map((scenario, index) => {
              const progress = scenarioProgress[index];
              const isCurrent = index === currentScenarioIndex;
              const isCompleted = progress?.completed;
              
              return (
                <div
                  key={scenario.id}
                  className={`p-3 rounded-lg border ${
                    isCurrent ? 'border-blue-200 bg-blue-50' : 
                    isCompleted ? 'border-green-200 bg-green-50' : 
                    'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : isCurrent ? (
                        <ArrowRight className="h-5 w-5 text-blue-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                      <div>
                        <h4 className="font-medium text-sm">{scenario.title}</h4>
                        <p className="text-xs text-gray-600">{scenario.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {isCompleted && (
                        <Badge variant={progress.passed ? "default" : "secondary"}>
                          {progress.finalScore}%
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge variant="outline">Current</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 