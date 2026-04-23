'use client';

import { SonioxProvider } from '@soniox/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useState } from 'react';

import getSonioxConfig, { cn } from '@/lib/utils';

const Transcribe = dynamic(() => import('./transcribe'), { ssr: false });
const TranslateTo = dynamic(() => import('./translate-to'), { ssr: false });
const TranslateBetween = dynamic(() => import('./translate-between'), { ssr: false });
const TextToSpeech = dynamic(() => import('./text-to-speech'), { ssr: false });

type Mode = 'transcribe' | 'translate-one-way' | 'translate-two-way' | 'tts';

const MODES: { id: Mode; label: string }[] = [
  { id: 'transcribe', label: 'Transcribe' },
  { id: 'translate-one-way', label: 'Translate to' },
  { id: 'translate-two-way', label: 'Translate between' },
  { id: 'tts', label: 'Text-to-speech' },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>('transcribe');

  return (
    <SonioxProvider config={getSonioxConfig}>
      <main className="flex flex-row items-center justify-center min-h-screen gap-4 p-8 pb-24">
        <div className="flex flex-col gap-4 w-full max-w-xl">
          <Image src="/soniox_logo.svg" alt="Soniox Logo" width={180} height={38} priority />

          <div className="flex flex-row gap-2 flex-wrap">
            {MODES.map(({ id, label }) => (
              <button
                key={id}
                className={cn(
                  'rounded-lg border border-primary px-4 py-2 flex-1',
                  mode === id ? 'bg-primary text-white' : 'bg-white text-primary'
                )}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'transcribe' ? <Transcribe /> : null}
          {mode === 'translate-one-way' ? <TranslateTo /> : null}
          {mode === 'translate-two-way' ? <TranslateBetween /> : null}
          {mode === 'tts' ? <TextToSpeech /> : null}
        </div>
      </main>
    </SonioxProvider>
  );
}
