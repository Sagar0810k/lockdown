import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, RADIUS } from '../theme';
import { Card, SectionTitle, PermissionDot } from '../components';
import { Lockdown, nativeAvailable } from '../native';

export default function SettingsScreen({ refreshTick }) {
  const [perms, setPerms] = useState({ usage: null, overlay: null, dnd: null, notifications: null });
  const [diag, setDiag] = useState(null);
  const [diagRefreshing, setDiagRefreshing] = useState(false);

  const check = async () => {
    if (!nativeAvailable) return;
    try {
      const [usage, overlay, dnd, notifications] = await Promise.all([
        Lockdown.hasUsageAccess(),
        Lockdown.canDrawOverlays(),
        Lockdown.hasNotificationPolicyAccess(),
        Lockdown.areNotificationsEnabled(),
      ]);
      setPerms({ usage, overlay, dnd, notifications });
    } catch {
      setPerms({ usage: false, overlay: false, dnd: false, notifications: false });
    }
  };

  const checkDiagnostics = async (showSpinner = false) => {
    if (!nativeAvailable || typeof Lockdown.getBlockingDiagnostics !== 'function') return;
    if (showSpinner) setDiagRefreshing(true);
    try {
      setDiag(await Lockdown.getBlockingDiagnostics());
    } catch (e) {
      setDiag({ serviceStartError: e?.message || String(e) });
    } finally {
      if (showSpinner) setDiagRefreshing(false);
    }
  };

  useEffect(() => {
    check();
    checkDiagnostics(true);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        check();
        checkDiagnostics();
      }
    });
    return () => sub.remove();
  }, [refreshTick]);

  const granted = (v) => v === true;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Setup</Text>

      <SectionTitle>Permissions</SectionTitle>
      <Card style={{ gap: 4, paddingVertical: 8 }}>
        <PermRow
          title="Usage access"
          desc="Lets Lockdown see which app is in the foreground — the system's own usage-stats channel, not accessibility"
          ok={perms.usage}
          onGrant={() => Lockdown?.openUsageAccessSettings()}
        />
        <View style={styles.divider} />
        <PermRow
          title="Display over other apps"
          desc="Full-screen lock shown over blocked apps during a session — you won't touch the underlying app until time ends"
          ok={perms.overlay}
          onGrant={() => Lockdown?.openOverlaySettings()}
        />
        <View style={styles.divider} />
        <PermRow
          title="Do Not Disturb access"
          desc="Silences calls, notifications and media during sessions — your previous ringer state comes back afterwards"
          ok={perms.dnd}
          onGrant={() => Lockdown?.openNotificationPolicyAccessSettings()}
        />
        <View style={styles.divider} />
        <PermRow
          title="Notifications"
          desc="One quiet 'locked in' status while a session runs, plus one note when it completes"
          ok={perms.notifications}
          onGrant={() => Lockdown?.openNotificationSettings()}
        />
      </Card>

      <SectionTitle>Blocking diagnostics</SectionTitle>
      <Card style={{ gap: 10 }}>
        <DiagValue
          label="Background monitor"
          value={serviceMonitorText(diag)}
          danger={serviceStartFailed(diag) || serviceLooksDead(diag)}
        />
        <View style={styles.divider} />
        <DiagValue
          label="Detected foreground app"
          value={detectedAppText(diag)}
          danger={!!diag?.lastDetectionError || !!diag?.liveProbeError}
        />
        <View style={styles.divider} />
        <DiagValue
          label="Overlay result"
          value={overlayText(diag)}
          danger={!diag?.overlayVisible && !!diag?.overlayLastError}
        />
        {(diag?.serviceStartError || diag?.lastDetectionError || diag?.liveProbeError || diag?.overlayLastError) && (
          <View style={styles.diagErrorBox}>
            <Text style={styles.diagErrorLabel}>DETAIL</Text>
            <Text style={styles.diagErrorText}>
              {diag?.serviceStartError || diag?.lastDetectionError || diag?.liveProbeError || diag?.overlayLastError}
            </Text>
          </View>
        )}
        <TouchableOpacity activeOpacity={0.8} onPress={() => checkDiagnostics(true)} style={styles.diagnoseButton}>
          <Ionicons name="refresh" size={16} color="#0B1020" />
          <Text style={styles.diagnoseButtonText}>{diagRefreshing ? 'CHECKING…' : 'CHECK AGAIN'}</Text>
        </TouchableOpacity>
        <Text style={styles.diagHint}>Open a locked app once, come back here, then tap CHECK AGAIN. Screenshot this section if the block still fails.</Text>
      </Card>

      <SectionTitle>How locking works</SectionTitle>
      <Card style={{ gap: 12 }}>
        <HowRow n="1" text="You pick the distracting apps and a duration (or an until-time)." />
        <HowRow n="2" text="Phone goes silent via Do Not Disturb. Blocked apps open into a full-screen lock with a countdown." />
        <HowRow n="3" text="When time is up, everything is restored automatically — even if you rebooted mid-session." />
      </Card>

      <SectionTitle>Honest fine print</SectionTitle>
      <Card style={{ gap: 10 }}>
        <FinePrint text="EMERGENCY: your Phone app and 911 always stay available — Lockdown never blocks calls." />
        <FinePrint text="Clock-proof by design: sessions run on the phone's monotonic clock, so changing the time can't end a duration early." />
        <FinePrint text="Strict mode blocks Settings and the Play Store so the lock can't be switched off mid-session." />
        <FinePrint text="No app can be 100% unstoppable. A determined user can always force-disable Lockdown from system settings — Lockdown is a commitment device, not a vault." />
        <FinePrint text="Uses the system's usage-stats channel and a display-over-apps overlay — no accessibility permission, so Play Protect doesn't flag it." />
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card>
        <View style={styles.aboutRow}>
          <View style={styles.aboutMark}>
            <Ionicons name="lock-closed" size={18} color="#0B1020" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aboutTitle}>Lockdown 1.0.0</Text>
            <Text style={styles.aboutSub}>Focus study lock · on-device only</Text>
          </View>
        </View>
      </Card>

      <SectionTitle>Made by</SectionTitle>
      <Card>
        <View style={styles.aboutRow}>
          <View style={[styles.aboutMark, styles.madeMark]}>
            <Text style={styles.madeLetter}>S</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aboutTitle}>Sagar</Text>
            <Text style={styles.aboutSub}>Solo developer · building tools for distraction-free work</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

function PermRow({ title, desc, ok, onGrant }) {
  const granted = ok === true;
  return (
    <View style={styles.permRow}>
      <PermissionDot ok={granted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permDesc}>{desc}</Text>
      </View>
      {granted ? (
        <View style={styles.okBadge}><Text style={styles.okText}>ON</Text></View>
      ) : (
        <TouchableOpacity onPress={onGrant} style={styles.grantBtn}>
          <Text style={styles.grantText}>GRANT</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function serviceStartFailed(diag) {
  return !!diag?.serviceStartError;
}

function serviceLooksDead(diag) {
  const age = Number(diag?.serviceAliveAgeSec ?? -1);
  return Number(diag?.serviceStartedWall || 0) > 0 && age > 10;
}

function serviceMonitorText(diag) {
  if (!diag) return 'Not checked yet';
  if (diag.serviceStartError) return 'Failed to start';
  const age = Number(diag.serviceAliveAgeSec ?? -1);
  if (age >= 0 && age <= 10) return `Running — updated ${age}s ago`;
  if (Number(diag.serviceStartedWall || 0) > 0) return 'Stopped or killed by Android';
  return 'Not started yet';
}

function detectedAppText(diag) {
  if (!diag) return 'Not checked yet';
  if (diag.liveProbeError || diag.lastDetectionError) return 'Usage probe failed';
  if (diag.liveProbePackage) return `${diag.liveProbePackage} · ${diag.liveProbeSource || 'live'}`;
  if (diag.lastForeground) return `${diag.lastForeground} · ${diag.lastDetectionSource || 'monitor'}`;
  return 'No foreground app detected';
}

function overlayText(diag) {
  if (!diag) return 'Not checked yet';
  if (diag.overlayVisible) return `Covering ${diag.overlayPackage || 'blocked app'}`;
  if (diag.overlayLastError) return 'Android refused to draw';
  if (Number(diag.overlayAddCount || 0) > 0) return 'Previously drawn; hidden now';
  return 'Not shown yet';
}

function DiagValue({ label, value, danger }) {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, danger && styles.diagValueDanger]}>{value}</Text>
    </View>
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

function FinePrint({ text }) {
  return (
    <View style={styles.fineRow}>
      <Ionicons name="information-circle-outline" size={16} color={C.amber} style={{ marginTop: 1 }} />
      <Text style={styles.fineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60 },
  title: { color: C.ink, fontSize: 30, fontWeight: '900', marginTop: 8, marginBottom: 18 },
  divider: { height: 1, backgroundColor: C.border },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  permTitle: { color: C.ink, fontWeight: '800', fontSize: 15 },
  permDesc: { color: C.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  okBadge: { borderWidth: 1, borderColor: C.green, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  okText: { color: C.green, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  grantBtn: { backgroundColor: C.amber, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  grantText: { color: '#0B1020', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  howRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  howNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  howNumText: { color: C.amber, fontSize: 12, fontWeight: '800' },
  howText: { color: C.ink, fontSize: 13, lineHeight: 20, flex: 1 },
  fineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  fineText: { color: C.muted, fontSize: 12, lineHeight: 18, flex: 1 },
  diagRow: { gap: 4 },
  diagLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  diagValue: { color: C.ink, fontSize: 12, lineHeight: 17 },
  diagValueDanger: { color: C.red },
  diagErrorBox: { borderWidth: 1, borderColor: '#5A2525', backgroundColor: '#2A171C', borderRadius: 10, padding: 10, gap: 4 },
  diagErrorLabel: { color: C.red, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  diagErrorText: { color: '#FFB0B0', fontSize: 11, lineHeight: 16 },
  diagnoseButton: { height: 40, borderRadius: 10, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  diagnoseButtonText: { color: '#0B1020', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  diagHint: { color: C.dim, fontSize: 10, lineHeight: 15 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  aboutMark: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  madeMark: { borderRadius: 23, borderWidth: 1, borderColor: C.amber },
  madeLetter: { color: '#0B1020', fontSize: 22, fontWeight: '900' },
  aboutTitle: { color: C.ink, fontWeight: '800', fontSize: 16 },
  aboutSub: { color: C.muted, fontSize: 12, marginTop: 2 },
});
