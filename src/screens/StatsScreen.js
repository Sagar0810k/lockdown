import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, RADIUS } from '../theme';
import { Card, SectionTitle } from '../components';
import { loadStats, summarize, last14Days, resetStats } from '../storage';

export default function StatsScreen({ refreshTick }) {
  const [stats, setStats] = useState({ sessions: [], byPkg: {} });
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let alive = true;
    loadStats().then((s) => alive && setStats(s));
    return () => { alive = false; };
  }, [refreshTick]);

  const summary = summarize(stats);
  const days = last14Days(stats);
  const maxDay = Math.max(30, ...days.map((d) => d.minutes));
  const recent = [...stats.sessions].reverse().slice(0, 8);
  const topPhk = Object.entries(stats.byPkg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const reasonChip = (reason) => {
    if (reason === 'completed') return { label: 'Completed', color: C.green };
    if (reason === 'emergency') return { label: 'Emergency quit', color: C.red };
    return { label: 'Quit early', color: C.amber };
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Your focus</Text>

      <View style={styles.grid}>
        <StatCard value={String(summary.todayMinutes)} label="minutes today" icon="timer-outline" />
        <StatCard value={String(summary.weekMinutes)} label="this week" icon="calendar-outline" />
        <StatCard value={String(summary.streak)} label="day streak" icon="flame" />
        <StatCard value={String(summary.totalAttempts)} label="temptations resisted" icon="shield-checkmark" />
      </View>

      <SectionTitle>Last 14 days</SectionTitle>
      <Card>
        <View style={styles.chartRow}>
          {days.map((d) => (
            <View key={d.key} style={styles.chartCol}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${(d.minutes / maxDay) * 100}%` }, d.minutes === 0 && { backgroundColor: C.surface2 }]} />
              </View>
              <Text style={styles.chartLabel}>{d.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {topPhk.length > 0 && (
        <>
          <SectionTitle>Most tempting apps</SectionTitle>
          <Card style={{ gap: 10 }}>
            {topPhk.map(([pkg, n]) => (
              <View key={pkg} style={styles.pkgRow}>
                <Text style={styles.pkgName} numberOfLines={1}>{pkg}</Text>
                <View style={styles.pkgBarTrack}>
                  <View style={[styles.pkgBarFill, { width: `${Math.min(100, (n / (topPhk[0][1] || 1)) * 100)}%` }]} />
                </View>
                <Text style={styles.pkgCount}>{n}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Recent sessions</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {recent.length === 0 ? (
          <Text style={styles.empty}>Finish your first lockdown — your progress will show up here.</Text>
        ) : (
          recent.map((s, i) => {
            const chip = reasonChip(s.reason);
            const d = new Date(s.ts);
            return (
              <View key={i} style={[styles.sessionRow, i < recent.length - 1 && styles.rowDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionDate}>
                    {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.sessionMeta}>{s.minutes} min · {s.attempts} temptation{s.attempts === 1 ? '' : 's'}</Text>
                </View>
                <View style={[styles.reasonChip, { borderColor: chip.color }]}>
                  <Text style={{ color: chip.color, fontSize: 11, fontWeight: '800' }}>{chip.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </Card>

      <TouchableOpacity
        style={styles.resetBtn}
        onPress={async () => {
          if (!confirmReset) {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 4000);
            return;
          }
          await resetStats();
          setStats({ sessions: [], byPkg: {} });
          setConfirmReset(false);
        }}
      >
        <Ionicons name="trash-outline" size={16} color={confirmReset ? C.red : C.dim} />
        <Text style={[styles.resetText, confirmReset && { color: C.red }]}>
          {confirmReset ? 'Tap again to erase all stats' : 'Reset stats'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ value, label, icon }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={C.amber} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60 },
  title: { color: C.ink, fontSize: 30, fontWeight: '900', marginTop: 8, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  statCard: { width: '47%', flexGrow: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS, padding: 16, gap: 6 },
  statValue: { color: C.ink, fontSize: 28, fontWeight: '900' },
  statLabel: { color: C.muted, fontSize: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 4 },
  chartCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { width: '100%', height: 104, backgroundColor: C.surface2, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: C.amber, borderRadius: 6 },
  chartLabel: { color: C.muted, fontSize: 10, fontWeight: '700' },
  pkgRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pkgName: { color: C.ink, fontSize: 13, width: 150 },
  pkgBarTrack: { flex: 1, height: 8, backgroundColor: C.surface2, borderRadius: 4, overflow: 'hidden' },
  pkgBarFill: { height: 8, backgroundColor: C.red, borderRadius: 4, opacity: 0.75 },
  pkgCount: { color: C.muted, fontWeight: '800', width: 26, textAlign: 'right' },
  empty: { color: C.muted, paddingVertical: 18, textAlign: 'center', lineHeight: 20 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  sessionDate: { color: C.ink, fontWeight: '700', fontSize: 14 },
  sessionMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  reasonChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  resetBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 22, padding: 12 },
  resetText: { color: C.dim, fontSize: 13, fontWeight: '600' },
});
