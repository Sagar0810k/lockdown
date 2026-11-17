import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, RADIUS } from '../theme';
import { HoldButton } from '../components';
import { Lockdown, fmtCountdown } from '../native';

/**
 * Full-screen takeover shown while a session is live.
 * Enforcement happens natively; this screen is the friendly face of it.
 */
export default function SessionScreen({ status, blocked, strict, onEnded }) {
  const [remaining, setRemaining] = useState(status?.remainingSec ?? 0);
  const [attempts, setAttempts] = useState(status?.attempts ?? 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    const sync = setInterval(async () => {
      if (!Lockdown) return;
      try {
        const s = await Lockdown.getSessionStatus();
        setRemaining(s.remainingSec);
        setAttempts(s.attempts);
        if (!s.active) onEnded && onEnded();
      } catch {
        // native hiccup — local countdown keeps running
      }
    }, 5000);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      clearInterval(timer);
      clearInterval(sync);
      sub.remove();
    };
  }, []);

  const quit = async () => {
    if (!Lockdown) return;
    try {
      await Lockdown.endSession(strict ? 'emergency' : 'quit');
    } catch {}
    onEnded && onEnded();
  };

  const close = () => BackHandler.exitApp();

  return (
    <View style={styles.root}>
      <Text style={styles.tag}>FOCUS LOCK</Text>

      <View style={styles.ring}>
        <Text style={styles.time}>{fmtCountdown(remaining)}</Text>
        <Text style={styles.ringLabel}>REMAINING</Text>
      </View>

      <Text style={styles.attempts}>
        <Text style={{ color: C.red, fontWeight: '900' }}>{attempts}</Text>
        <Text style={{ color: C.muted }}> temptation{attempts === 1 ? '' : 's'} resisted</Text>
      </Text>

      <View style={styles.chips}>
        {blocked.slice(0, 8).map((b) => (
          <View key={b.pkg} style={styles.chip}>
            <Ionicons name="lock-closed" size={11} color={C.amber} />
            <Text style={styles.chipText}>{b.name}</Text>
          </View>
        ))}
        {blocked.length > 8 && <View style={styles.chip}><Text style={styles.chipText}>+{blocked.length - 8} more</Text></View>}
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={close} style={styles.primary}>
        <Ionicons name="home" size={20} color="#0B1020" />
        <Text style={styles.primaryText}>BACK TO HOME — PHONE STAYS LOCKED</Text>
      </TouchableOpacity>

      {strict && (
        <Text style={styles.strictNote}>Strict mode · Settings & Play Store are locked until the timer ends</Text>
      )}

      <HoldButton
        holdMs={strict ? 10000 : 3000}
        label={strict ? 'EMERGENCY — HOLD 10s TO END' : 'HOLD 3s TO END SESSION'}
        onComplete={quit}
        style={{ width: '100%', marginTop: 14 }}
      />
      <Text style={styles.warn}>Ending early is logged to your streak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  tag: { color: C.amber, letterSpacing: 6, fontWeight: '900', fontSize: 13, marginBottom: 22 },
  ring: {
    width: 230, height: 230, borderRadius: 115,
    borderWidth: 11, borderColor: C.amber,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 22,
  },
  time: { color: C.amber, fontSize: 54, fontWeight: '900', fontVariant: ['tabular-nums'] },
  ringLabel: { color: C.muted, fontSize: 10, letterSpacing: 3, marginTop: 2, fontWeight: '700' },
  attempts: { fontSize: 17, marginBottom: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 30 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: C.ink, fontSize: 12, fontWeight: '600' },
  primary: { width: '100%', height: 58, borderRadius: RADIUS, backgroundColor: C.amber, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#0B1020', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  strictNote: { color: '#C9A227', fontSize: 12, marginTop: 12 },
  warn: { color: C.dim, fontSize: 11, marginTop: 10 },
});
