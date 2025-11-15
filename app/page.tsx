'use client';

import { createClient } from '@/lib/auth/supabase-client';
import { useState } from 'react';
import { Sparkles, FileText, Mic, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setLoading(true);
    toast.loading('Redirecting to Google...', { id: 'login' });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('Error logging in:', error);
      toast.error('Failed to sign in', {
        id: 'login',
        description: error.message,
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 md:py-20 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 bg-neutral-50 backdrop-blur-sm px-4 py-2 rounded-full shadow-md border border-neutral-200 mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Your Second Brain AI
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-foreground leading-tight">
            Noteloop
          </h1>

          <p className="text-xl md:text-2xl text-neutral-600 mb-4 max-w-3xl mx-auto">
            Your personal AI companion for knowledge management
          </p>

          <p className="text-lg text-neutral-500 max-w-2xl mx-auto">
            Upload documents, transcribe audio, and chat with your knowledge base using AI
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="group text-center">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-4 mx-auto group-hover:bg-primary-hover transition-colors">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-foreground">
              Document Processing
            </h3>
            <p className="text-neutral-500">
              Upload PDF and Markdown files for instant analysis and intelligent retrieval
            </p>
          </div>

          <div className="group text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center mb-4 mx-auto group-hover:bg-accent-hover transition-colors">
              <Mic className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-foreground">
              Audio Transcription
            </h3>
            <p className="text-neutral-500">
              Convert audio recordings to searchable text using advanced AI technology
            </p>
          </div>

          <div className="group text-center">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-4 mx-auto group-hover:bg-primary-hover transition-colors">
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-foreground">
              AI Q&A
            </h3>
            <p className="text-neutral-500">
              Ask questions and get instant answers from your personal knowledge base
            </p>
          </div>
        </div>

        {/* Login Section */}
        <div className="max-w-md mx-auto text-center">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-primary text-black font-semibold py-4 px-6 rounded-xl hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl group"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
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
                <span>Sign in with Google</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <p className="text-xs text-center text-neutral-400 mt-6">
            By signing in, you agree to our terms and privacy policy
          </p>
        </div>
      </div>
    </div>
  );
}
