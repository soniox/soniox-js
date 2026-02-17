/**
 * AudioLevel — headless component for audio volume and spectrum visualization
 *
 * Wraps `useAudioLevel` in a component
 *
 * @example
 * ```tsx
 * <AudioLevel active={recording.isActive} bands={8}>
 *   {({ volume, bands }) => (
 *     <div className="flex items-end gap-1 h-12">
 *       {bands.map((level, i) => (
 *         <div key={i} style={{ height: `${level * 100}%` }} />
 *       ))}
 *     </div>
 *   )}
 * </AudioLevel>
 * ```
 */

import type { ReactNode } from 'react';

import { useAudioLevel } from './use-audio-level.js';
import type { UseAudioLevelOptions, UseAudioLevelReturn } from './use-audio-level.js';

export interface AudioLevelProps extends UseAudioLevelOptions {
  children: (state: UseAudioLevelReturn) => ReactNode;
}

export function AudioLevel({ children, ...options }: AudioLevelProps): ReactNode {
  const state = useAudioLevel(options);
  return children(state);
}
