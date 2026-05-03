import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert,
  RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserContext } from '../context/UserContext';
import { GradientButton, SecondaryButton, ErrorBanner } from '../components/UI';
import { colors, radius, spacing, shadows } from '../theme';
import axios from '../config/axios';

// ─── Project Card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onPress, onDelete }) {
  const updated = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Top accent line */}
      <View style={styles.cardAccent} />

      <View style={styles.cardTop}>
        <View style={styles.folderIcon}>
          <Text style={styles.folderEmoji}>📁</Text>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={8}>
          <Text style={styles.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.cardName} numberOfLines={2}>{project.name}</Text>
      {updated && <Text style={styles.cardDate}>Updated {updated}</Text>}

      <View style={styles.cardMeta}>
        <View style={styles.collabBadge}>
          <Text style={styles.collabText}>
            👤 {project.users?.length || 0}{' '}
            {project.users?.length === 1 ? 'collaborator' : 'collaborators'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Create Project Modal ────────────────────────────────────────────────────
function CreateProjectModal({ visible, onClose, onCreate }) {
  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a project name.'); return; }
    setError('');
    setLoading(true);
    try {
      await onCreate(name.trim());
      setName('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create project.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Project</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ErrorBanner message={error} />

          <Text style={styles.inputLabel}>Project Name</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. my-awesome-app"
            placeholderTextColor={colors.textDimmed}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />

          <View style={styles.modalActions}>
            <SecondaryButton title="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <GradientButton
              title="Create →"
              onPress={handleCreate}
              loading={loading}
              style={{ flex: 2, marginLeft: 10 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { user, logout } = useContext(UserContext);
  const [projects,  setProjects]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await axios.get('/projects/all');
      setProjects(res.data.projects);
    } catch (e) {
      console.error('Failed to fetch projects', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleCreate = async (name) => {
    await axios.post('/projects/create', { name });
    await fetchProjects();
    setModalOpen(false);
  };

  const handleDelete = (project) => {
    Alert.alert(
      `Delete "${project.name}"?`,
      'This will permanently delete all files and chat history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`/projects/${project._id}`);
              setProjects(prev => prev.filter(p => p._id !== project._id));
            } catch (e) {
              Alert.alert('Error', e.response?.data?.error || 'Failed to delete project.');
            }
          },
        },
      ],
    );
  };

  const totalCollaborators = projects.reduce((sum, p) => sum + (p.users?.length || 0), 0);

  const renderItem = ({ item }) => (
    <ProjectCard
      project={item}
      onPress={() => navigation.navigate('Project', { project: item })}
      onDelete={() => handleDelete(item)}
    />
  );

  const ListHeader = () => (
    <View>
      {/* Stats bar */}
      {projects.length > 0 && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{projects.length}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalCollaborators}</Text>
            <Text style={styles.statLabel}>Collaborators</Text>
          </View>
        </View>
      )}

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>All Projects</Text>
        <Text style={styles.sectionCount}>{projects.length} project{projects.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* New project button */}
      <TouchableOpacity style={styles.newCard} onPress={() => setModalOpen(true)} activeOpacity={0.8}>
        <View style={styles.newCardIcon}>
          <Text style={{ fontSize: 20, color: colors.indigo }}>+</Text>
        </View>
        <Text style={styles.newCardText}>New Project</Text>
      </TouchableOpacity>
    </View>
  );

  const ListEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📂</Text>
      <Text style={styles.emptyText}>No projects yet — create your first one</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* Background blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Text>{'</>'}</Text>
          </View>
          <Text style={styles.logoText}>DevCollab</Text>
        </View>
        <View style={styles.userBadge}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {user?.email?.charAt(0).toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroLabel}>
          <View style={styles.heroDot} />
          <Text style={styles.heroLabelText}>WORKSPACE</Text>
        </View>
        <Text style={styles.heroTitle}>Your <Text style={styles.heroTitleAccent}>Projects</Text></Text>
        <Text style={styles.heroSub}>Build and collaborate with your team.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchProjects(); }}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <CreateProjectModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  blob1: { position: 'absolute', top: -100, left: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(99,102,241,0.1)' },
  blob2: { position: 'absolute', bottom: -100, right: -100, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(236,72,153,0.07)' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: { width: 32, height: 32, backgroundColor: colors.primary, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },

  userBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
  userAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  logoutBtn: { paddingLeft: 4 },
  logoutText: { color: colors.textMuted, fontSize: 12 },

  hero: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md },
  heroLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  heroLabelText: { fontSize: 10, fontWeight: '600', color: colors.indigo, letterSpacing: 1.2 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 4 },
  heroTitleAccent: { color: colors.indigo },
  heroSub: { fontSize: 14, color: colors.textMuted },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { padding: spacing.md, paddingTop: 0 },

  statsBar: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 12, marginBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  statItem: { gap: 2 },
  statNumber: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textDimmed, textTransform: 'uppercase', letterSpacing: 0.8 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.07)' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: colors.textDimmed, textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionCount: { fontSize: 11, color: colors.textDimmed },

  newCard: { borderWidth: 2, borderColor: 'rgba(99,102,241,0.25)', borderStyle: 'dashed', borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 110, marginBottom: 10, gap: 8 },
  newCardIcon: { width: 40, height: 40, backgroundColor: 'rgba(99,102,241,0.15)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  newCardText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  card: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: 10, overflow: 'hidden' },
  cardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: colors.primary, opacity: 0 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  folderIcon: { width: 32, height: 32, backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  folderEmoji: { fontSize: 16 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  cardDate: { fontSize: 11, color: colors.textDimmed, marginBottom: 8 },
  cardMeta: { flexDirection: 'row' },
  collabBadge: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
  collabText: { fontSize: 11, color: colors.textMuted },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12, opacity: 0.4 },
  emptyText: { color: colors.textDimmed, fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.bgOverlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalBox: { backgroundColor: colors.bgModal, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: spacing.lg, width: '100%', ...shadows.card },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  closeBtn: { width: 30, height: 30, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: colors.textMuted, fontSize: 13 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  modalInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', gap: 10 },
});
