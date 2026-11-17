import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, RADIUS, hashHue } from './theme';

export function SectionTitle({ children }) {
  return (
    <Text style={{ color: C.muted, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 }}>
      {children}
    </Text>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={{ color: active ? '#0B1020' : C.ink, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function LetterAvatar({ name, pkg, size = 46 }) {
  const hue = hashHue(pkg);
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 42%, 30%)`,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: `hsl(${hue}, 50%, 45%)`,
      }}
    >
      <Text style={{ color: C.ink, fontWeight: '800', fontSize: size * 0.42 }}>{letter}</Text>
    </View>
  );
}

/** Press-and-hold button with a fill bar — same behavior as the native lock screen. */
export function HoldButton({ holdMs = 3000, label, onComplete, style }) {
  const [progress, setProgress] = useState(0);
  const held = useRef(0);
  const timer = useRef(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    held.current = 0;
    setProgress(0);
  };

  useEffect(() => () => timer.current && clearInterval(timer.current), []);

  const start = () => {
    stop();
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      held.current = Date.now() - startedAt;
      const p = Math.min(1, held.current / holdMs);
      setProgress(p);
      if (p >= 1) {
        stop();
        onComplete && onComplete();
      }
    }, 50);
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={start}
      onPressOut={stop}
      onPress={() => {}}
      style={[styles.holdBtn, style]}
    >
      <View style={[styles.holdFill, { width: `${progress * 100}%` }]} />
      <Text style={styles.holdText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PermissionDot({ ok }) {
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok ? C.green : C.red }} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  chip: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: C.amber,
    borderColor: C.amber,
  },
  holdBtn: {
    height: 56,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: C.red,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#241018',
  },
  holdFill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(255, 107, 107, 0.28)',
  },
  holdText: {
    color: C.red,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontSize: 13,
  },
});
