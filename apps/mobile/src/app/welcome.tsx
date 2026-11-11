// First-time intro (owner request, 30 Oct 2026): three short screens to swipe through, then create an account or
// sign in. Next and Skip do the same without swiping. After this, a signed-out phone opens on the sign-in page.
// The one agreement (Terms of Use, which cover 18+ and keeping results) is ticked before creating the account
// (owner, 1 Nov 2026). On the local test server there are no accounts: the agreement is saved for the test account.
import { router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { Text } from '@/design/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { problemMessage, saveAgreement, usesRemoteServer } from '@/core/api';
import { signInWithEmail } from '@/core/auth';
import { Button } from '@/design/components';
import { Icon, type IconName } from '@/design/Icon';
import { Wordmark } from '@/design/TabHeader';
import { colors, fonts, radius, space } from '@/design/tokens';
import { AgreementRow } from '@/features/consent/ConsentList';
import { agreeBeforeSignUp, markIntroSeen, markOnboarded } from '@/features/onboarding/state';

const SLIDES: { icon: IconName; tint: 'rose' | 'violet'; title: string; body: string }[] = [
  {
    icon: 'clipboard',
    tint: 'rose',
    title: 'Understand your reproductive health',
    body: 'A clinician-designed assessment helps you see the areas of your reproductive and preconception health that may deserve attention.'
  },
  {
    icon: 'plan',
    tint: 'violet',
    title: 'Make a plan that fits your life',
    body: 'Turn your focus areas into goals and small steps, with gentle check-ins along the way.'
  },
  {
    icon: 'learn',
    tint: 'rose',
    title: 'Learn, connect and get support',
    body: 'Short story lessons, a weekly Circle question, and a one-on-one consultation with a medical doctor when you want one.'
  }
];

export default function Welcome() {
  const { width } = useWindowDimensions();
  // `?step=create` (from the sign-in page) opens on the last screen, where the account is created.
  const { step } = useLocalSearchParams<{ step?: string }>();
  const pager = useRef<ScrollViewInstance | null>(null);
  const [page, setPage] = useState(step === 'create' ? SLIDES.length - 1 : 0);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = page === SLIDES.length - 1;

  const goTo = (i: number) => {
    pager.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  const start = async () => {
    if (!agreed) {
      setError('To create your account, tick the box agreeing to the Terms of Use and Privacy Policy.');
      return;
    }
    await markIntroSeen();
    if (usesRemoteServer) {
      // Signing in creates the account; the sign-in listener records the agreement and opens Home.
      agreeBeforeSignUp(true);
      signInWithEmail().catch(() => undefined);
      return;
    }
    try {
      await saveAgreement(Platform.OS === 'ios' ? 'ios' : 'android');
      await markOnboarded();
      router.replace('/home');
    } catch (e) {
      setError(problemMessage(e));
    }
  };
  const signIn = async () => {
    await markIntroSeen();
    router.replace('/sign-in' as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Wordmark />
        {!last ? <Text accessibilityRole="button" style={styles.skip} onPress={() => goTo(SLIDES.length - 1)}>Skip</Text> : null}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onLayout={() => { if (page) pager.current?.scrollTo({ x: page * width, animated: false }); }}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.slide, { width }]} accessibilityElementsHidden={i !== page} importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}>
            <View style={[styles.art, s.tint === 'rose' ? styles.artRose : styles.artViolet]}>
              <Icon name={s.icon} size={72} color={s.tint === 'rose' ? colors.roseDark : colors.violetDark} />
            </View>
            <Text style={styles.title} accessibilityRole="header">{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots} accessible accessibilityLabel={`Screen ${page + 1} of ${SLIDES.length}`}>
        {SLIDES.map((s, i) => <View key={s.title} style={[styles.dot, i === page && styles.dotOn]} />)}
      </View>

      <View style={styles.footer}>
        {last ? (
          <>
            <AgreementRow checked={agreed} onChange={v => { setAgreed(v); setError(null); }} />
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            <Button label={usesRemoteServer ? 'Create my account' : 'Get started'} onPress={start} />
            {usesRemoteServer ? <Button label="I already have an account" variant="secondary" onPress={signIn} /> : null}
          </>
        ) : (
          <Button label="Next" onPress={() => goTo(page + 1)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.lg },
  skip: { fontFamily: fonts.label, fontSize: 15, color: colors.violetDark, padding: space.sm, marginTop: -space.xl },
  slide: { paddingHorizontal: space.xl, justifyContent: 'center' },
  art: { alignSelf: 'center', width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxl },
  artRose: { backgroundColor: colors.roseWash },
  artViolet: { backgroundColor: colors.violetWash },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, color: colors.textPrimary, textAlign: 'center', marginBottom: space.md },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textSecondary, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: space.lg },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.border },
  dotOn: { width: 24, backgroundColor: colors.roseDark },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.sm }
});
