import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, RADIUS } from '../theme';
import { Card, SectionTitle } from '../components';
import { nativeAvailable } from '../native';
import {
  loadTimetable, saveTimetable, makeEntry, fmtTime, fmtRange, describeDays,
  upcomingSession, fmtDayTime, DAY_LABELS, pad2,
} from '../timetable';

const sortEntries = (entries) =>
  [...entries].sort((a, b) => a.startH - b.startH || a.startM - b.startM);

export default function TimetableScreen({ blocked, goToApps, refreshTick }) {
  const [tt, setTt] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(null); // { id, label, days, startH, startM, endH, endM }

  useEffect(() => {
    let alive = true;
    loadTimetable().then((t) => { if (alive) setTt(t); });
    return () => { alive = false; };
  }, [refreshTick]);

  // Keep the "next up" banner honest as time passes.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const entries = useMemo(() => sortEntries(tt?.entries || []), [tt]);
  const upcoming = useMemo(
    () => (tt ? upcomingSession(tt, now) : null),
    [tt, now]
  );

  if (!tt) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading your timetable…</Text>
      </View>
    );
  }

  const persist = async (next) => {
    // The native alarm receiver needs the blocklist, so always ship the current one.
    const withBlocked = { ...next, blocked: blocked.map((b) => b.pkg) };
    setTt(withBlocked);
    await saveTimetable(withBlocked);
  };

  const openNew = () => {
    setForm({ id: null, label: '', days: [], startH: 18, startM: 0, endH: 20, endM: 0 });
    setFormOpen(true);
  };

  const openEdit = (entry) => {
    setForm({
      id: entry.id,
      label: entry.label,
      days: [...entry.days],
      startH: entry.startH,
      startM: entry.startM,
      endH: entry.endH,
      endM: entry.endM,
    });
    setFormOpen(true);
  };

  const saveForm = () => {
    if (!form.days.length) {
      Alert.alert('Pick a day', 'Choose at least one day for this study block.');
      return;
    }
    const entry = makeEntry(form);
    const nextEntries = form.id
      ? tt.entries.map((e) => (e.id === form.id ? entry : e))
      : [...tt.entries, entry];
    persist({ ...tt, entries: sortEntries(nextEntries) });
    setFormOpen(false);
    setForm(null);
  };

  const removeEntry = (id) => {
    Alert.alert('Delete block', 'Remove this study block from your timetable?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist({ ...tt, entries: tt.entries.filter((e) => e.id !== id) }),
      },
    ]);
  };

  const toggleEntry = (id, value) =>
    persist({ ...tt, entries: tt.entries.map((e) => (e.id === id ? { ...e, enabled: value } : e)) });

  const blockedCount = blocked.length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Timetable</Text>
      <Text style={styles.subtitle}>Study blocks lock the phone automatically — no willpower needed.</Text>

      {!nativeAvailable && (
        <View style={styles.warnBanner}>
          <Ionicons name="warning" size={18} color={C.amber} />
          <Text style={styles.warnText}>Native module unavailable. Install the EAS preview build for auto-lock.</Text>
        </View>
      )}

      {blockedCount === 0 && (
        <TouchableOpacity activeOpacity={0.8} onPress={goToApps} style={styles.warnBanner}>
          <Ionicons name="apps-outline" size={18} color={C.amber} />
          <Text style={styles.warnText}>
            Pick apps to lock first — auto-lock has nothing to block yet.
          </Text>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </TouchableOpacity>
      )}

      {/* Master switch */}
      <Card style={{ paddingVertical: 6 }}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleIcon}>
            <Ionicons name="calendar" size={20} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Auto-lock on schedule</Text>
            <Text style={styles.toggleDesc}>Start a session when a study block begins</Text>
          </View>
          <Switch
            value={tt.masterEnabled}
            onValueChange={(v) => persist({ ...tt, masterEnabled: v })}
            trackColor={{ false: C.surface2, true: C.amberSoft }}
            thumbColor={tt.masterEnabled ? C.amber : C.muted}
          />
        </View>
      </Card>

      {/* Next up */}
      {tt.masterEnabled && upcoming && (
        <Card style={styles.nextCard}>
          <Ionicons name="time-outline" size={22} color={C.amber} />
          <View style={{ flex: 1 }}>
            <Text style={styles.nextLabel}>NEXT AUTO-LOCK</Text>
            <Text style={styles.nextText} numberOfLines={2}>
              {upcoming.entry.label} · {fmtDayTime(upcoming.time)} – {fmtTime(upcoming.entry.endH, upcoming.entry.endM)}
            </Text>
          </View>
        </Card>
      )}

      {/* Blocks */}
      <SectionTitle>Study blocks</SectionTitle>
      {entries.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={34} color={C.dim} />
          <Text style={styles.emptyTitle}>No study blocks yet</Text>
          <Text style={styles.emptyText}>
            Add your first block — for example Mon–Fri, 6:00–8:00 PM.
          </Text>
          <TouchableOpacity activeOpacity={0.85} onPress={openNew} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#0B1020" />
            <Text style={styles.addBtnText}>ADD BLOCK</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <>
          {entries.map((entry) => (
            <Card key={entry.id} style={[styles.entryCard, !entry.enabled && styles.entryOff]}>
              <View style={styles.entryHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryLabel} numberOfLines={1}>{entry.label}</Text>
                  <Text style={styles.entryMeta}>{describeDays(entry.days)}</Text>
                </View>
                <Switch
                  value={entry.enabled}
                  onValueChange={(v) => toggleEntry(entry.id, v)}
                  trackColor={{ false: C.surface2, true: C.amberSoft }}
                  thumbColor={entry.enabled ? C.amber : C.muted}
                />
              </View>
              <View style={styles.entryTimes}>
                <Ionicons name="time-outline" size={15} color={C.amber} />
                <Text style={styles.entryTimeText}>{fmtRange(entry)}</Text>
              </View>
              <View style={styles.entryActions}>
                <TouchableOpacity onPress={() => openEdit(entry)} style={styles.miniBtn}>
                  <Ionicons name="create-outline" size={14} color={C.amber} />
                  <Text style={styles.miniBtnText}>EDIT</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeEntry(entry.id)} style={[styles.miniBtn, styles.miniBtnDanger]}>
                  <Ionicons name="trash-outline" size={14} color={C.red} />
                  <Text style={[styles.miniBtnText, { color: C.red }]}>DELETE</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
          <TouchableOpacity activeOpacity={0.85} onPress={openNew} style={styles.addBtnWide}>
            <Ionicons name="add" size={18} color="#0B1020" />
            <Text style={styles.addBtnText}>ADD BLOCK</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Add / edit form */}
      {formOpen && (
        <>
          <SectionTitle>{form?.id ? 'Edit block' : 'New block'}</SectionTitle>
          <Card style={{ gap: 14 }}>
            <View>
              <Text style={styles.fieldLabel}>Label</Text>
              <TextInput
                value={form?.label || ''}
                onChangeText={(label) => setForm((f) => ({ ...f, label }))}
                placeholder="e.g. Physics revision"
                placeholderTextColor={C.dim}
                style={styles.input}
                maxLength={40}
              />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Days</Text>
              <View style={styles.dayRow}>
                {DAY_LABELS.map((label, i) => {
                  const active = form?.days.includes(i);
                  return (
                    <TouchableOpacity
                      key={label}
                      onPress={() =>
                        setForm((f) => ({
                          ...f,
                          days: active ? f.days.filter((d) => d !== i) : [...f.days, i],
                        }))
                      }
                      style={[styles.dayChip, active && styles.dayChipActive]}
                    >
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.timeRow}>
              <TimeField
                label="Starts"
                h={form?.startH ?? 0}
                m={form?.startM ?? 0}
                onChange={(startH, startM) => setForm((f) => ({ ...f, startH, startM }))}
              />
              <TimeField
                label="Ends"
                h={form?.endH ?? 0}
                m={form?.endM ?? 0}
                onChange={(endH, endM) => setForm((f) => ({ ...f, endH, endM }))}
              />
            </View>
            <Text style={styles.overnightHint}>
              Ending earlier than the start (e.g. 10 PM → 1 AM) is treated as the next day.
            </Text>

            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => { setFormOpen(false); setForm(null); }} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveForm} style={styles.saveBtn}>
                <Text style={styles.saveText}>{form?.id ? 'SAVE CHANGES' : 'ADD BLOCK'}</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </>
      )}

      {/* Session settings */}
      <SectionTitle>Auto-lock uses</SectionTitle>
      <Card style={{ paddingVertical: 6 }}>
        <TouchableOpacity activeOpacity={0.8} onPress={goToApps} style={styles.toggleRow}>
          <View style={styles.toggleIcon}>
            <Ionicons name="apps-outline" size={20} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>
              {blockedCount === 0 ? 'Choose apps to lock' : `${blockedCount} locked app${blockedCount === 1 ? '' : 's'}`}
            </Text>
            <Text style={styles.toggleDesc} numberOfLines={1}>
              {blockedCount === 0 ? 'The same blocklist as manual sessions' : blocked.slice(0, 3).map((b) => b.name).join(', ') + (blockedCount > 3 ? ` +${blockedCount - 3} more` : '')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
        <View style={styles.rowDivider} />
        <View style={styles.toggleRow}>
          <View style={styles.toggleIcon}>
            <Ionicons name="volume-mute" size={20} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Silence the phone</Text>
            <Text style={styles.toggleDesc}>Do Not Disturb for every auto-lock session</Text>
          </View>
          <Switch
            value={tt.silence}
            onValueChange={(v) => persist({ ...tt, silence: v })}
            trackColor={{ false: C.surface2, true: C.amberSoft }}
            thumbColor={tt.silence ? C.amber : C.muted}
          />
        </View>
        <View style={styles.rowDivider} />
        <View style={styles.toggleRow}>
          <View style={styles.toggleIcon}>
            <Ionicons name="shield-checkmark" size={20} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Strict mode</Text>
            <Text style={styles.toggleDesc}>No early quit · Settings & Play Store locked too</Text>
          </View>
          <Switch
            value={tt.strict}
            onValueChange={(v) => persist({ ...tt, strict: v })}
            trackColor={{ false: C.surface2, true: C.amberSoft }}
            thumbColor={tt.strict ? C.amber : C.muted}
          />
        </View>
      </Card>

      <SectionTitle>Good to know</SectionTitle>
      <Card style={{ gap: 12 }}>
        <HowRow n="1" text="When a block starts, Lockdown starts a session with your locked apps and silences the phone." />
        <HowRow n="2" text="The session ends by itself at the block's end time — even if the phone rebooted." />
        <HowRow n="3" text="Permissions from the Setup tab are required. On Xiaomi/Oppo/Vivo/Realme, also allow Lockdown to run in the background and ignore battery optimization." />
      </Card>
    </ScrollView>
  );
}

function TimeField({ label, h, m, onChange }) {
  const stepH = (delta) => onChange((h + delta + 24) % 24, m);
  const stepM = (delta) => onChange(h, (m + delta + 60) % 60);
  return (
    <View style={styles.timeField}>
      <Text style={styles.timeLabel}>{label}</Text>
      <View style={styles.timeCol}>
        <StepBtn onPress={() => stepH(1)}><Ionicons name="chevron-up" size={22} color={C.amber} /></StepBtn>
        <Text style={styles.timeVal}>{pad2(h)}</Text>
        <StepBtn onPress={() => stepH(-1)}><Ionicons name="chevron-down" size={22} color={C.amber} /></StepBtn>
      </View>
      <Text style={styles.timeColon}>:</Text>
      <View style={styles.timeCol}>
        <StepBtn onPress={() => stepM(15)}><Ionicons name="chevron-up" size={22} color={C.amber} /></StepBtn>
        <Text style={styles.timeVal}>{pad2(m)}</Text>
        <StepBtn onPress={() => stepM(-15)}><Ionicons name="chevron-down" size={22} color={C.amber} /></StepBtn>
      </View>
      <Text style={styles.timeHint}>{fmtTime(h, m)}</Text>
    </View>
  );
}

function StepBtn({ onPress, children }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
      {children}
    </TouchableOpacity>
  );
}

function HowRow({ n, text }) {
  return (
    <View style={styles.howRow}>
      <View style={styles.howNum}><Text style={styles.howNumText}>{n}</Text></View>
      <Text style={styles.howText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: C.muted, fontSize: 14 },
  title: { color: C.ink, fontSize: 30, fontWeight: '900', marginTop: 8 },
  subtitle: { color: C.muted, marginTop: 6, marginBottom: 18, fontSize: 13, lineHeight: 19 },
  warnBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.amberSoft, borderWidth: 1, borderColor: '#5A4A1A', padding: 12, borderRadius: RADIUS, marginBottom: 16 },
  warnText: { color: C.amber, flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  toggleIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { color: C.ink, fontWeight: '700', fontSize: 15 },
  toggleDesc: { color: C.muted, fontSize: 12, marginTop: 2 },
  rowDivider: { height: 1, backgroundColor: C.border },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: '#5A4A1A', backgroundColor: C.amberSoft, marginBottom: 16 },
  nextLabel: { color: C.amber, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  nextText: { color: C.ink, fontSize: 14, fontWeight: '700', marginTop: 3, lineHeight: 19 },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { color: C.ink, fontWeight: '800', fontSize: 16, marginTop: 6 },
  emptyText: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.amber, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, marginTop: 8 },
  addBtnWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.amber, borderRadius: 12, height: 52, marginTop: 14 },
  addBtnText: { color: '#0B1020', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  entryCard: { gap: 8, marginBottom: 12 },
  entryOff: { opacity: 0.55 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryLabel: { color: C.ink, fontWeight: '800', fontSize: 16 },
  entryMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  entryTimes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entryTimeText: { color: C.amber, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  entryActions: { flexDirection: 'row', gap: 16, marginTop: 2 },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniBtnText: { color: C.amber, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  miniBtnDanger: {},
  fieldLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 7 },
  input: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.ink, paddingHorizontal: 12, height: 46, fontSize: 15 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  dayChipActive: { backgroundColor: C.amber, borderColor: C.amber },
  dayChipText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  dayChipTextActive: { color: '#0B1020' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  timeField: { alignItems: 'center', gap: 3, flex: 1 },
  timeLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  timeCol: { alignItems: 'center', gap: 1 },
  timeVal: { color: C.ink, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' },
  timeColon: { color: C.muted, fontSize: 38, fontWeight: '800', marginTop: 14 },
  timeHint: { color: C.dim, fontSize: 11, fontWeight: '700' },
  overnightHint: { color: C.dim, fontSize: 11, lineHeight: 16 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: C.muted, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  saveBtn: { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#0B1020', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  howRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  howNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  howNumText: { color: C.amber, fontSize: 12, fontWeight: '800' },
  howText: { color: C.ink, fontSize: 13, lineHeight: 20, flex: 1 },
});
