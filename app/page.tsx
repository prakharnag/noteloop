'use client';

import { createClient } from '@/lib/auth/supabase-client';
import { useState } from 'react';

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('Error logging in:', error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Second Brain AI
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            Your personal AI companion for knowledge management
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-500">
            Upload documents, transcribe audio, and chat with your knowledge base
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              Document Processing
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Upload PDF and Markdown files for instant analysis and retrieval
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-4">🎤</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              Audio Transcription
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Convert audio recordings to searchable text using AI
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              AI Q&A
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Ask questions and get answers from your knowledge base
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
            <h2 className="text-2xl font-semibold mb-6 text-center text-gray-900 dark:text-white">
              Get Started
            </h2>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-medium py-3 px-6 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {loading ? 'Signing in...' : 'Sign in with Google'}
            </button>

            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-6">
              By signing in, you agree to our terms and privacy policy
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-gray-500 dark:text-gray-400 text-sm">
          <p>Built with Next.js, Supabase, Pinecone, and OpenAI</p>
        </div>
      </div>
    </div>
  );
}
