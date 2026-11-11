// First-run state. Account set-up is: tick the agreement (Terms of Use cover 18+ and keeping results), sign in with
// email (Azure server), then Home.
// Returning users skip all of it. A signed-in account without the privacy agreement is asked for it right after
// signing in, never after taking the assessment.
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getMe, saveAgreement, usesRemoteServer } from '@/core/api';
import { onSignInChange } from '@/core/auth';
import { fromConsents } from '@/features/consent/model';
import { deleteAllGoalReminders } from '@/features/reminders/store';

const KEY = 'pcx.onboarded';

export async function isOnboarded(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === 'yes';
  } catch {
    return false;
  }
}

export async function markOnboarded(): Promise<void> {
  await SecureStore.setItemAsync(KEY, 'yes');
}

const INTRO_KEY = 'pcx.introSeen';

/** Whether this phone has been through the three intro screens (then signed-out start-up shows the sign-in page). */
export async function hasSeenIntro(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(INTRO_KEY)) === 'yes';
  } catch {
    return false;
  }
}

export async function markIntroSeen(): Promise<void> {
  await SecureStore.setItemAsync(INTRO_KEY, 'yes').catch(() => undefined);
}

const NAME_KEY = 'pcx.nameAsked';

/** "What should we call you?" is asked once per account on this phone (it can be changed from Account). */
export async function markNameAsked(): Promise<void> {
  await SecureStore.setItemAsync(NAME_KEY, 'yes').catch(() => undefined);
}
async function nameAsked(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(NAME_KEY)) === 'yes'; } catch { return true; }
}

async function clearOnboarded(): Promise<void> {
  await SecureStore.deleteItemAsync(NAME_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

// The sign-in listener and the results step can both notice a missing agreement at the same moment.
let privacyOpen = false;

/** Opens the agreement once. `back` returns to the current screen afterwards. */
export function openPrivacySetup(next?: 'back') {
  if (privacyOpen) return;
  privacyOpen = true;
  router.push((next ? `/consent?next=${next}` : '/consent') as never);
}

// Ticked on the intro's last screen before "Create my account"; recorded as soon as the new account signs in.
let agreedBeforeSignUp = false;
export function agreeBeforeSignUp(agreed: boolean) {
  agreedBeforeSignUp = agreed;
}

/** Called when the 18+ or privacy screen closes. */
export function privacySetupClosed() {
  privacyOpen = false;
}

/** After each sign-in: ask for the privacy agreement if this account has none; otherwise finish set-up. */
export function watchSignIn() {
  return onSignInChange(async signedIn => {
    if (!signedIn) {
      // Goal reminders belong to the account that signed out; the next person to sign in must not get them.
      await deleteAllGoalReminders().catch(() => undefined);
      // On the Azure server there is no test account to fall back to: back to the sign-in page, where the next
      // sign-in goes through account set-up again (18+ and privacy if that account has not agreed yet).
      if (usesRemoteServer) {
        await clearOnboarded();
        if (router.canDismiss()) router.dismissAll();
        router.replace('/sign-in' as never);
      }
      return;
    }
    try {
      const [me, onboarded] = await Promise.all([getMe(), isOnboarded()]);
      if (!fromConsents(me.consents).agreement) {
        if (!agreedBeforeSignUp) return openPrivacySetup(onboarded ? 'back' : undefined);
        await saveAgreement(Platform.OS === 'ios' ? 'ios' : 'android');
      }
      agreedBeforeSignUp = false;
      const askName = !me.firstName && !(await nameAsked());
      if (!onboarded) {
        await markOnboarded();
        if (router.canDismiss()) router.dismissAll();
        router.replace((askName ? '/name' : '/home') as never);
      } else if (askName) {
        router.push('/name' as never);
      }
    } catch {
      // Offline: the results step asks again when it needs the agreement.
    }
  });
}
