import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, RADIUS } from '../theme';
import { Card, SectionTitle, Chip } from '../components';
import { Lockdown, nativeAvailable } from '../native';
import { loadStats, summarize } from '../storage';

const DURATIONS = [15, 25, 45, 60, 90];

export default function HomeScreen({ blocked, onStart, goToApps, goToSettings, refreshTick }) {
  const [mode, setMode] = useState('duration'); // duration | until
  const [minutes, setMinutes] = useState(45);
  const [untilH, setUntilH] = useState(() => (new Date().getHours() + 2) % 24);
  const [untilM, setUntilM] = useState(0);
  const [silence, setSilence] = useState(true);
  const [strict, setStrict] = useState(false);
  const [summary, setSummary] = useState({ todayMinutes: 0, todayAttempts: 0, streak: 0 });
  const [perms, setPerms] = useState({ usage: true, overlay: true, dnd: true });

  useEffect(() => {
    loadStats().then((s) => setSummary(summarize(s)));
    if (nativeAvailable) {
      Promise.all([Lockdown.hasUsageAccess(), Lockdown.canDrawOverlays(), Lockdown.hasNotificationPolicyAccess()])
        .then(([usage, overlay, dnd]) => setPerms({ usage, overlay, dnd }))
        .catch(() => {});
    }
  }, [refreshTick]);

  const blockedCount = blocked.length;
  const permsReady = perms.usage && perms.overlay && perms.dnd;

  const start = async () => {
    if (!nativeAvailable) {
      Alert.alert('Build required', 'This dev APK was built without the Lockdown native module. Install the EAS preview build.');
      return;
    }
    if (blockedCount === 0) {
      Alert.alert('No apps locked', 'Choose at least one app to lock first.', [
        { text: 'Choose apps', onPress: goToApps },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    let untilWallMillis = 0;
    if (mode === 'until') {
      const target = new Date();
      target.setHours(untilH, untilM, 0, 0);
      if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1); // already passed → tomorrow
      untilWallMillis = target.getTime();
    }
    try {
      const status = await Lockdown.startSession(
        minutes,
        untilWallMillis,
        blocked.map((b) => b.pkg),
        strict,
        silence
      );
      onStart(status, { strict, silence, mode, blocked });
    } catch (e) {
      Alert.alert('Could not start', e?.message || String(e));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.scroll}>
      {/* Brand */}
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Ionicons name="lock-closed" size={22} color="#0B1020" />
        </View>
        <Text style={styles.brand}>Lockdown</Text>
        <View style={styles.streak}>
          <Ionicons name="flame" size={14} color={C.amber} />
          <Text style={styles.streakText}>{summary.streak}</Text>
        </View>
      </View>
      <Text style={styles.tagline}>Silence the noise. Finish the chapter.</Text>

      {/* Today stats */}
      <Card style={styles.statRow}>
        <StatCol value={String(summary.todayMinutes)} label="min today" />
        <View style={styles.divider} />
        <StatCol value={String(summary.todayAttempts)} label="temptations" />
        <View style={styles.divider} />
        <StatCol value={String(summary.streak)} label="day streak" />
      </Card>

      {!permsReady && (
        <TouchableOpacity activeOpacity={0.8} onPress={goToSettings} style={styles.warnBanner}>
          <Ionicons name="warning" size={18} color={C.amber} />
          <Text style={styles.warnText}>
            Finish setup — grant usage access, display-over-apps and Do Not Disturb so blocking actually works.
          </Text>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </TouchableOpacity>
      )}

      {/* Duration */}
      <SectionTitle>Focus for</SectionTitle>
      <Card>
        <View style={styles.modeTabs}>
          <ModeTab label="Duration" active={mode === 'duration'} onPress={() => setMode('duration')} />
          <ModeTab label="Until a time" active={mode === 'until'} onPress={() => setMode('until')} />
        </View>

        {mode === 'duration' ? (
          <>
            <View style={styles.chips}>
              {DURATIONS.map((d) => (
                <Chip key={d} label={`${d}m`} active={minutes === d} onPress={() => setMinutes(d)} />
              ))}
            </View>
            <View style={styles.customRow}>
              <Stepper label="Custom" value={minutes} suffix="min" onDec={() => setMinutes(Math.max(5, minutes - 5))} onInc={() => setMinutes(Math.min(240, minutes + 5))} />
            </View>
          </>
        ) : (
          <View style={styles.untilRow}>
            <TimeStepper value={untilH} onDec={() => setUntilH((untilH + 23) % 24)} onInc={() => setUntilH((untilH + 1) % 24)} />
            <Text style={styles.untilSep}>:</Text>
            <TimeStepper value={untilM} max={59} pad2 onDec={() => setUntilM((untilM + 45) % 60)} onInc={() => setUntilM((untilM + 15) % 60)} />
            <Text style={styles.untilHint}>blocks until this clock{'\n'}time (tomorrow if passed)</Text>
          </View>
        )}
      </Card>

      {/* Options */}
      <SectionTitle>During the session</SectionTitle>
      <Card style={{ paddingVertical: 6 }}>
        <ToggleRow
          icon="volume-mute"
          title="Silence the phone"
          desc="Do Not Disturb on, ringtone off — restored when time ends"
          value={silence}
          onValueChange={setSilence}
        />
        <View style={styles.rowDivider} />
        <ToggleRow
          icon="shield-checkmark"
          title="Strict mode"
          desc="No early quit · blocks Settings & Play Store while locked"
          value={strict}
          onValueChange={setStrict}
        />
      </Card>

      {/* Blocked apps */}
      <SectionTitle>Apps locked</SectionTitle>
      <TouchableOpacity activeOpacity={0.8} onPress={goToApps}>
        <Card style={styles.blockedCard}>
          <View style={styles.blockedIcon}>
            <Ionicons name="apps" size={22} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockedTitle}>
              {blockedCount === 0 ? 'Choose apps to lock' : `${blockedCount} app${blockedCount === 1 ? '' : 's'} will be locked`}
            </Text>
            <Text style={styles.blockedSub} numberOfLines={1}>
              {blockedCount === 0 ? 'Social, games, anything that steals focus' : blocked.slice(0, 3).map((b) => b.name).join(', ') + (blockedCount > 3 ? ` +${blockedCount - 3} more` : '')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.muted} />
        </Card>
      </TouchableOpacity>

      {/* CTA */}
      <TouchableOpacity activeOpacity={0.85} onPress={start} style={styles.cta}>
        <Ionicons name="lock-closed" size={26} color="#0B1020" />
        <Text style={styles.ctaText}>START LOCKDOWN</Text>
      </TouchableOpacity>
      <Text style={styles.ctaNote}>Calls and your dialer always work. Ending early is always possible — hold the button.</Text>
    </ScrollView>
  );
}

function StatCol({ value, label }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: C.amber, fontSize: 24, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function ModeTab({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.modeTab, active && styles.modeTabActive]}>
      <Text style={{ color: active ? '#0B1020' : C.muted, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function ChipRowButton({ onPress, children }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.stepBtn}>
      {children}
    </TouchableOpacity>
  );
}

function Stepper({ label, value, suffix, onDec, onInc }) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <ChipRowButton onPress={onDec}><Ionicons name="remove" size={18} color={C.amber} /></ChipRowButton>
        <Text style={styles.stepperValue}>{value}{suffix ? <Text style={styles.stepperSuffix}> {suffix}</Text> : null}</Text>
        <ChipRowButton onPress={onInc}><Ionicons name="add" size={18} color={C.amber} /></ChipRowButton>
      </View>
    </View>
  );
}

function TimeStepper({ value, onDec, onInc, pad2 }) {
  const text = pad2 ? String(value).padStart(2, '0') : String(value);
  return (
    <View style={styles.timeStepper}>
      <TouchableOpacity onPress={onInc} hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}>
        <Ionicons name="chevron-up" size={26} color={C.amber} />
      </TouchableOpacity>
      <Text style={styles.timeValue}>{text}</Text>
      <TouchableOpacity onPress={onDec} hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}>
        <Ionicons name="chevron-down" size={26} color={C.amber} />
      </TouchableOpacity>
    </View>
  );
}

function ToggleRow({ icon, title, desc, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleIcon}>
        <Ionicons name={icon} size={20} color={C.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.surface2, true: C.amberSoft }}
        thumbColor={value ? C.amber : C.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  brand: { color: C.ink, fontSize: 28, fontWeight: '800', letterSpacing: 0.3, flex: 1 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  streakText: { color: C.amber, fontWeight: '800' },
  tagline: { color: C.muted, marginTop: 6, marginBottom: 18, fontSize: 13 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18 },
  divider: { width: 1, height: 36, backgroundColor: C.border },
  warnBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.amberSoft, borderWidth: 1, borderColor: '#5A4A1A', padding: 12, borderRadius: RADIUS, marginBottom: 18 },
  warnText: { color: C.amber, flex: 1, fontSize: 13, fontWeight: '600' },
  modeTabs: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 12, padding: 4, marginBottom: 14 },
  modeTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  modeTabActive: { backgroundColor: C.amber },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  customRow: { marginTop: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperLabel: { color: C.muted, fontSize: 14, fontWeight: '600' },
  stepperValue: { color: C.ink, fontSize: 20, fontWeight: '800', minWidth: 64, textAlign: 'center' },
  stepperSuffix: { color: C.muted, fontSize: 12, fontWeight: '600' },
  stepBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  untilRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 6 },
  timeStepper: { alignItems: 'center', gap: 2 },
  timeValue: { color: C.ink, fontSize: 56, fontWeight: '800', minWidth: 96, textAlign: 'center' },
  untilSep: { color: C.muted, fontSize: 48, fontWeight: '800', marginTop: -28 },
  untilHint: { color: C.muted, fontSize: 11, marginLeft: 14, maxWidth: 110 },
  rowDivider: { height: 1, backgroundColor: C.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  toggleIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { color: C.ink, fontWeight: '700', fontSize: 15 },
  toggleDesc: { color: C.muted, fontSize: 12, marginTop: 2, maxWidth: 240 },
  blockedCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  blockedIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  blockedTitle: { color: C.ink, fontWeight: '800', fontSize: 16 },
  blockedSub: { color: C.muted, fontSize: 12, marginTop: 3 },
  cta: { marginTop: 26, height: 62, borderRadius: RADIUS + 2, backgroundColor: C.amber, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ctaText: { color: '#0B1020', fontSize: 19, fontWeight: '900', letterSpacing: 2 },
  ctaNote: { color: C.dim, textAlign: 'center', fontSize: 11, marginTop: 10 },
});
