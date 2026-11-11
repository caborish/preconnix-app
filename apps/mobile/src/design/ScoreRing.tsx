import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, fonts } from './tokens';

const SIZE = 180;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Overall score ring, matching the website's results screen. Static (no animation), so it suits reduced-motion users. */
export function ScoreRing({ score }: { score: number }) {
  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={`Overall score ${score} out of 100`}>
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.rose} />
            <Stop offset="1" stopColor={colors.violet} />
          </LinearGradient>
        </Defs>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.violetWash} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke="url(#ring)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={C * (1 - score / 100)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.score}>{score}</Text>
        <Text style={styles.of}>out of 100</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignSelf: 'center', marginVertical: 16 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: fonts.headingBlack, fontSize: 52, color: colors.textPrimary, lineHeight: 56 },
  of: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary }
});
