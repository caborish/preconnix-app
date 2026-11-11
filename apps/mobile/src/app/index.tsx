import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { usesRemoteServer } from '@/core/api';
import { isSignedIn } from '@/core/auth';
import { hasSeenIntro, isOnboarded } from '@/features/onboarding/state';

// Signed in and set up: Home. First time on this phone: the three intro screens. Signed out after that (Azure
// server): the sign-in page. Signing in then runs 18+ and privacy if that account has not agreed yet.
type Start = '/home' | '/welcome' | '/sign-in';

export default function Index() {
  const [start, setStart] = useState<Start | null>(null);
  useEffect(() => {
    (async (): Promise<Start> => {
      if ((await isOnboarded()) && (!usesRemoteServer || (await isSignedIn()))) return '/home';
      return usesRemoteServer && (await hasSeenIntro()) ? '/sign-in' : '/welcome';
    })().then(setStart).catch(() => setStart('/welcome'));
  }, []);
  if (start === null) return null;
  return <Redirect href={start as never} />;
}
