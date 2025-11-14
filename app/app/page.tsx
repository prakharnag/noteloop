'use client';

import { useEffect, useState } from 'react';
import { UploadSection } from '@/components/UploadSection';
import { ChatInterface } from '@/components/ChatInterface';
import { createClient } from '@/lib/auth/supabase-client';
import { useRouter } from 'next/navigation';

export default function AppPage() {
  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);
        setUserEmail(user.email || '');
      }
      setLoading(false);
    };

    getUser();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex justify-between items-center mb-4">
            <div></div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Second Brain AI
            </h1>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Your personal AI companion for knowledge management
          </p>
          {userEmail && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              Logged in as {userEmail}
            </p>
          )}
        </header>

        {/* Main Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <UploadSection userId={userId} />
          </div>

          {/* Chat Section */}
          <div className="lg:col-span-2">
            <ChatInterface userId={userId} />
          </div>
        </div>
      </div>
    </div>
  );
}
