'use client';

import { useEffect, useState } from 'react';
import { UploadSection } from '@/components/UploadSection';
import { ChatInterface } from '@/components/ChatInterface';
import { DocumentManager } from '@/components/DocumentManager';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { DocumentSelectionProvider } from '@/components/contexts/DocumentSelectionContext';
import { createClient } from '@/lib/auth/supabase-client';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';

export default function AppPage() {
  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  const handleUploadComplete = () => {
    // Trigger document library refresh
    setRefreshTrigger(prev => prev + 1);
  };

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const handleNewConversation = () => {
    // Reset current conversation (will be set by sidebar after creation)
    setCurrentConversationId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <DocumentSelectionProvider>
    <div className="min-h-screen bg-[hsl(214.3,31.8%,91.4%)] flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[hsl(214.3,25%,25%)]/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 z-50 transform transition-transform duration-300 lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <ConversationSidebar
          userId={userId}
          currentConversationId={currentConversationId}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
        />
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-7xl">
          {/* Header */}
          <header className="mb-6 sm:mb-8">
            <div className="flex justify-between items-center mb-6 bg-white backdrop-blur-sm rounded-2xl px-3 sm:px-6 py-3 sm:py-4 shadow-md border border-[hsl(214.3,25%,88%)] gap-2 sm:gap-4 overflow-hidden">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {/* Mobile Menu Button */}
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden p-1.5 sm:p-2 hover:bg-[hsl(214.3,25%,94%)] rounded-lg transition-colors shrink-0"
                >
                  {sidebarOpen ? (
                    <X className="w-5 h-5 sm:w-6 sm:h-6 text-[hsl(214.3,20%,35%)]" />
                  ) : (
                    <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-[hsl(214.3,20%,35%)]" />
                  )}
                </button>

                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[hsl(214.3,28%,75%)] flex items-center justify-center text-[hsl(214.3,25%,25%)] font-bold shrink-0 text-sm sm:text-base">
                  N
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-2xl font-bold text-[hsl(214.3,25%,25%)] truncate">
                    Noteloop
                  </h1>
                  <p className="text-xs sm:text-sm text-[hsl(214.3,20%,35%)] hidden sm:block">
                    Your Second Brain AI
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {userEmail && (
                  <div className="hidden md:block text-right">
                    <p className="text-sm font-medium text-[hsl(214.3,25%,25%)] truncate max-w-[150px]">
                      {userEmail}
                    </p>
                    <p className="text-xs text-[hsl(214.3,15%,45%)]">
                      Logged in
                    </p>
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-[hsl(214.3,20%,35%)] hover:text-[hsl(214.3,25%,25%)] transition-colors rounded-lg hover:bg-[hsl(214.3,25%,94%)] whitespace-nowrap"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          {/* Main Interface */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Upload Section */}
            <div className="lg:col-span-1">
              <UploadSection userId={userId} onUploadComplete={handleUploadComplete} />
            </div>

            {/* Chat Section */}
            <div className="lg:col-span-2">
              <ChatInterface
                userId={userId}
                conversationId={currentConversationId}
                onConversationLoaded={setCurrentConversationId}
              />
            </div>
          </div>

          {/* Document Library */}
          <div className="mt-6">
            <DocumentManager userId={userId} refreshTrigger={refreshTrigger} />
          </div>
        </div>
      </div>
    </div>
    </DocumentSelectionProvider>
  );
}
