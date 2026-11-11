// Health essentials checklist (SOGC's checklist adapted for Nigeria; draft until Dr Gloria approves planGuide.ts).
// Tick what is done; anything not done can become a goal in one tap. The ones that match the result come first.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { essentialsFor, GROUP_LABEL, VACCINES } from '@preconnix/content';
import { createGoal, getDashboard, getPlan, problemMessage, updatePlan, type Dashboard, type GoalCategory, type Plan } from '@/core/api';
import { Body, Eyebrow, Screen, Title } from '@/design/components';
import { Icon } from '@/design/Icon';
import { colors, fonts, radius, space } from '@/design/tokens';

export default function Essentials() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getPlan(), getDashboard()]).then(([p, d]) => { setPlan(p); setDash(d); }).catch(e => setMessage(problemMessage(e)));
  }, []);
  useFocusEffect(load);

  if (!plan || !dash) return <Screen>{message ? <Body>{message}</Body> : <ActivityIndicator color={colors.violet} style={{ marginVertical: space.xl }} />}</Screen>;

  const items = essentialsFor({ intention: plan.intention, pathway: dash.latestResult?.pathway ?? null, focus: dash.latestResult?.focus ?? [], only: plan.essentialsFocus });
  const inPlan = new Set(plan.goals.filter(g => g.status !== 'archived').map(g => g.title.toLowerCase()));
  const doneCount = items.filter(e => plan.essentialsDone.includes(e.id)).length;

  const toggle = (id: string) => {
    const next = plan.essentialsDone.includes(id) ? plan.essentialsDone.filter(x => x !== id) : [...plan.essentialsDone, id];
    setPlan({ ...plan, essentialsDone: next });
    updatePlan({ essentialsDone: next }).catch(e => { setMessage(problemMessage(e)); load(); });
  };
  const addGoal = (e: (typeof items)[number]) =>
    createGoal({ category: e.goal.category as GoalCategory, title: e.goal.title, rhythm: e.goal.rhythm, ...(e.domains[0] ? { sourceDomain: e.domains[0] } : {}) })
      .then(() => { setMessage(`"${e.goal.title}" is now in your plan.`); load(); })
      .catch(err => setMessage(problemMessage(err)));

  return (
    <Screen>
      <Eyebrow>Your plan</Eyebrow>
      <Title>Health essentials</Title>
      <Body>{doneCount} of {items.length} done</Body>
      {message ? <Text style={styles.note} accessibilityLiveRegion="polite">{message}</Text> : null}
      {items.map(e => {
        const done = plan.essentialsDone.includes(e.id);
        const planned = inPlan.has(e.goal.title.toLowerCase());
        return (
          <View key={e.id} style={[styles.item, done && styles.itemDone]}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${e.title}, done`} onPress={() => toggle(e.id)} style={styles.row}>
              <View style={[styles.box, done && styles.boxOn]}>{done ? <Icon name="check" size={16} color={colors.white} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{e.title}</Text>
                <Text style={styles.meta}>{[GROUP_LABEL[e.group], e.reason].filter(Boolean).join(' · ')}</Text>
              </View>
              {e.recommended ? <Text style={styles.tag}>For you</Text> : null}
            </Pressable>
            <View style={styles.links}>
              <Text accessibilityRole="button" style={styles.link} onPress={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Hide why' : 'Why this?'}</Text>
              {!done ? (planned ? <Text style={styles.metaInline}>In your plan</Text> : <Text accessibilityRole="button" style={styles.link} onPress={() => addGoal(e)}>+ Add to my plan</Text>) : null}
            </View>
            {open === e.id ? <Text style={styles.why}>{e.why}</Text> : null}
            {e.id === 'vaccines' ? (
              <View style={styles.vaxList} accessibilityLabel="Vaccines">
                {VACCINES.map(v => {
                  const had = plan.essentialsDone.includes(v.id);
                  return (
                    <Pressable key={v.id} accessibilityRole="checkbox" accessibilityState={{ checked: had }} accessibilityLabel={`${v.name}, I've had it`} onPress={() => toggle(v.id)} style={[styles.vax, had && styles.vaxOn]}>
                      <Icon name={had ? 'check' : 'shield'} size={16} color={had ? colors.white : colors.violetDark} />
                      <Text style={[styles.vaxName, had && { color: colors.white }]}>{v.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
      <Text accessibilityRole="link" style={[styles.link, { textAlign: 'center', marginTop: space.lg }]} onPress={() => router.back()}>Back to my plan</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginTop: space.sm },
  itemDone: { backgroundColor: 'rgba(46,173,130,0.08)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#B7ABC4', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  title: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
  metaInline: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, paddingVertical: space.xs },
  tag: { fontFamily: fonts.label, fontSize: 11, color: colors.roseDark, backgroundColor: colors.roseWash, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 3, overflow: 'hidden' },
  links: { flexDirection: 'row', gap: space.lg, marginLeft: 36 },
  link: { fontFamily: fonts.label, fontSize: 13, color: colors.violetDark, paddingVertical: space.xs },
  why: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, backgroundColor: colors.violetWash, borderRadius: radius.sm, padding: space.md, marginTop: space.xs },
  vaxList: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginLeft: 36 },
  vax: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 40 },
  vaxOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  vaxName: { fontFamily: fonts.label, fontSize: 14, color: colors.textPrimary },
  note: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, backgroundColor: 'rgba(46,173,130,0.12)', borderRadius: radius.sm, padding: space.md, marginTop: space.md }
});
