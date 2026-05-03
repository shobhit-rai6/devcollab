import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserContext } from '../context/UserContext';
import { colors, radius, spacing, shadows } from '../theme';
import axios from '../config/axios';
import {
  initializeSocket, receiveMessage, sendMessage, disconnectSocket,
} from '../config/socket';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── File Icon helper ─────────────────────────────────────────────────────────
function fileEmoji(name = '') {
  if (/\.(js|jsx)$/.test(name)) return '🟨';
  if (/\.(ts|tsx)$/.test(name)) return '🔷';
  if (/\.json$/.test(name))     return '{}';
  if (/\.css$/.test(name))      return '🎨';
  if (/\.html?$/.test(name))    return '🌐';
  if (/\.md$/.test(name))       return '📝';
  return '📄';
}

// ─── AI Message renderer (simplified for mobile) ─────────────────────────────
function AIMessage({ raw }) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { parsed = { type: 'text', content: raw }; }

  const content = parsed?.content || '';
  const files   = parsed?.fileTree ? Object.keys(parsed.fileTree) : [];

  return (
    <View style={msg.aiBox}>
      <View style={msg.aiHeader}>
        <Text style={msg.aiLabel}>🤖 AI Assistant</Text>
      </View>
      <Text style={msg.aiContent}>{content}</Text>
      {files.length > 0 && (
        <View style={msg.fileList}>
          <Text style={msg.fileListHeader}>📁 Generated files:</Text>
          {files.map(f => (
            <Text key={f} style={msg.fileName}>· {f}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
function ChatMessage({ item, currentUserId }) {
  const isAI   = item.sender?._id === 'AI' || item.sender?.email === 'AI Assistant';
  const isMine = item.sender?._id === currentUserId;

  if (isAI) return <AIMessage raw={item.message} />;

  return (
    <View style={[msg.row, isMine && msg.rowMine]}>
      {!isMine && (
        <View style={msg.avatar}>
          <Text style={msg.avatarText}>{item.sender?.email?.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={[msg.bubble, isMine && msg.bubbleMine]}>
        {!isMine && <Text style={msg.senderName}>{item.sender?.email}</Text>}
        <Text style={[msg.bubbleText, isMine && msg.bubbleTextMine]}>{item.message}</Text>
      </View>
    </View>
  );
}

const msg = StyleSheet.create({
  row:          { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-end', paddingHorizontal: spacing.sm },
  rowMine:      { justifyContent: 'flex-end' },
  avatar:       { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  avatarText:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  bubble:       { maxWidth: '75%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, borderBottomLeftRadius: 4, padding: 10, borderWidth: 1, borderColor: colors.border },
  bubbleMine:   { backgroundColor: 'rgba(99,102,241,0.18)', borderRadius: 14, borderBottomRightRadius: 4, borderColor: 'rgba(99,102,241,0.3)' },
  senderName:   { fontSize: 10, color: colors.indigo, marginBottom: 3, fontWeight: '600' },
  bubbleText:   { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  bubbleTextMine:{ color: colors.textPrimary },

  aiBox:        { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', padding: 12, marginBottom: 10, marginHorizontal: spacing.sm },
  aiHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  aiLabel:      { fontSize: 11, fontWeight: '700', color: colors.indigo, textTransform: 'uppercase', letterSpacing: 0.6 },
  aiContent:    { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  fileList:     { marginTop: 8, backgroundColor: 'rgba(99,102,241,0.06)', borderRadius: 8, padding: 8 },
  fileListHeader:{ fontSize: 11, color: colors.indigo, fontWeight: '600', marginBottom: 4 },
  fileName:     { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
});

// ─── File Tree Item ───────────────────────────────────────────────────────────
function FileTreeItem({ name, isSelected, onPress }) {
  return (
    <TouchableOpacity
      style={[ft.item, isSelected && ft.itemActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={ft.icon}>{fileEmoji(name)}</Text>
      <Text style={[ft.name, isSelected && ft.nameActive]} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
}

const ft = StyleSheet.create({
  item:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm },
  itemActive: { backgroundColor: 'rgba(99,102,241,0.15)' },
  icon:       { fontSize: 14, width: 20 },
  name:       { color: colors.textSecondary, fontSize: 13, flex: 1 },
  nameActive: { color: colors.indigoLight, fontWeight: '600' },
});

// ─── Add Collaborators Modal ──────────────────────────────────────────────────
function AddCollaboratorsModal({ visible, onClose, onAdd, users, project }) {
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdd = () => { onAdd(selected); setSelected(new Set()); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={co.overlay}>
        <View style={co.sheet}>
          <View style={co.handle} />
          <Text style={co.title}>Add Collaborators</Text>
          <Text style={co.subtitle}>to <Text style={{ color: colors.indigo }}>{project?.name}</Text></Text>

          <ScrollView style={co.userList}>
            {users.map(u => {
              const isCollab = project?.users?.some(pu => pu._id === u._id);
              const isOwner  = project?.owner?._id === u._id;
              const isSel    = selected.has(u._id);
              const canSelect= !isCollab && !isOwner;
              return (
                <TouchableOpacity
                  key={u._id}
                  style={[co.userRow, isSel && co.userRowSelected]}
                  onPress={() => canSelect && toggle(u._id)}
                  activeOpacity={canSelect ? 0.8 : 1}
                  disabled={!canSelect}
                >
                  <View style={co.avatar}>
                    <Text style={co.avatarText}>{u.email?.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={co.userEmail} numberOfLines={1}>{u.email}</Text>
                    <Text style={co.userStatus}>
                      {isOwner ? 'Owner' : isCollab ? 'Already added' : 'Tap to select'}
                    </Text>
                  </View>
                  {isSel && <Text style={{ color: colors.green, fontSize: 18 }}>✓</Text>}
                  {isCollab && !isOwner && <Text style={co.chip}>Added</Text>}
                  {isOwner && <Text style={co.chip}>Owner</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={co.actions}>
            <TouchableOpacity style={co.cancelBtn} onPress={onClose}>
              <Text style={{ color: colors.textMuted }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[co.addBtn, selected.size === 0 && { opacity: 0.4 }]}
              onPress={handleAdd}
              disabled={selected.size === 0}
            >
              <Text style={co.addBtnText}>
                Add {selected.size > 0 ? selected.size : ''} Collaborator{selected.size !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const co = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: colors.bgOverlay, justifyContent: 'flex-end' },
  sheet:      { backgroundColor: colors.bgModal, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '80%' },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 },
  title:      { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  subtitle:   { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  userList:   { maxHeight: 280 },
  userRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.sm, marginBottom: 4 },
  userRowSelected: { backgroundColor: 'rgba(99,102,241,0.12)' },
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  userEmail:  { color: colors.textPrimary, fontSize: 14 },
  userStatus: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  chip:       { fontSize: 10, color: colors.textMuted, backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 10 },
  actions:    { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, padding: 12 },
  addBtn:     { flex: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, padding: 12, ...shadows.button },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── TAB ENUM ────────────────────────────────────────────────────────────────
const TAB = { CHAT: 'chat', FILES: 'files' };

// ─── ProjectScreen ────────────────────────────────────────────────────────────
export default function ProjectScreen({ route, navigation }) {
  const { project: routeProject } = route.params;
  const { user } = useContext(UserContext);

  const [project,    setProject]    = useState(routeProject);
  const [messages,   setMessages]   = useState([]);
  const [message,    setMessage]    = useState('');
  const [fileTree,   setFileTree]   = useState({});
  const [currentFile,setCurrentFile]= useState(null);
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [activeTab,  setActiveTab]  = useState(TAB.CHAT);
  const [collabModal,setCollabModal]= useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const flatListRef = useRef(null);
  const socketInit  = useRef(false);

  // ── Load project data ────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [projRes, usersRes] = await Promise.all([
          axios.get(`/projects/get-project/${project._id}`),
          axios.get('/users/all'),
        ]);
        setProject(projRes.data.project);
        setFileTree(projRes.data.project.fileTree || {});
        setMessages(projRes.data.project.messages || []);
        setUsers(usersRes.data.users || []);
      } catch (e) {
        console.error('Load project error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [project._id]);

  // ── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (socketInit.current) return;
    socketInit.current = true;

    initializeSocket(project._id).then(() => {
      receiveMessage('project-message', (data) => {
        setMessages(prev => [...prev, data]);
        // Scroll to bottom
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });
      receiveMessage('ai-typing', ({ typing }) => setIsAiTyping(typing));
    });

    return () => { disconnectSocket(); socketInit.current = false; };
  }, [project._id]);

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const outgoing = {
      sender: { _id: user._id, email: user.email },
      message: trimmed,
    };
    sendMessage('project-message', outgoing);
    setMessages(prev => [...prev, outgoing]);
    setMessage('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [message, user]);

  // ── Add collaborators ────────────────────────────────────────────────────
  const handleAddCollabs = async (selectedIds) => {
    try {
      await axios.put('/projects/add-user', {
        projectId: project._id,
        users: Array.from(selectedIds),
      });
      const res = await axios.get(`/projects/get-project/${project._id}`);
      setProject(res.data.project);
      setCollabModal(false);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to add collaborators.');
    }
  };

  // ── File content view ────────────────────────────────────────────────────
  const getFileContent = (filename) => {
    const f = fileTree[filename];
    if (!f) return '';
    return f?.file?.contents ?? f?.contents ?? (typeof f === 'string' ? f : JSON.stringify(f, null, 2));
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator color={colors.primary} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const fileNames = Object.keys(fileTree);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.projectName} numberOfLines={1}>{project.name}</Text>
        <TouchableOpacity style={s.collabBtn} onPress={() => setCollabModal(true)}>
          <Text style={s.collabBtnText}>👥 Add</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab Bar ───────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {[
          { key: TAB.CHAT,  label: '💬 Chat' },
          { key: TAB.FILES, label: `📁 Files (${fileNames.length})` },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Chat Tab ──────────────────────────────────────────────────── */}
      {activeTab === TAB.CHAT && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <ChatMessage item={item} currentUserId={user._id} />
            )}
            contentContainerStyle={s.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={s.emptyChat}>
                <Text style={s.emptyChatIcon}>💬</Text>
                <Text style={s.emptyChatText}>No messages yet. Start collaborating!</Text>
                <Text style={s.emptyChatHint}>Tip: prefix your message with @ai to talk to the AI assistant</Text>
              </View>
            }
            ListFooterComponent={
              isAiTyping ? (
                <View style={s.typingIndicator}>
                  <ActivityIndicator color={colors.indigo} size="small" />
                  <Text style={s.typingText}>AI is thinking…</Text>
                </View>
              ) : null
            }
          />

          {/* Input bar */}
          <View style={s.inputBar}>
            <TextInput
              style={s.chatInput}
              placeholder="Message… or @ai ask something"
              placeholderTextColor={colors.textDimmed}
              value={message}
              onChangeText={setMessage}
              multiline
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[s.sendBtn, !message.trim() && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!message.trim()}
            >
              <Text style={s.sendBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── Files Tab ─────────────────────────────────────────────────── */}
      {activeTab === TAB.FILES && (
        <View style={{ flex: 1 }}>
          {fileNames.length === 0 ? (
            <View style={s.emptyFiles}>
              <Text style={s.emptyFilesIcon}>📂</Text>
              <Text style={s.emptyFilesText}>No files yet.</Text>
              <Text style={s.emptyFilesHint}>Ask the AI to generate a project and files will appear here.</Text>
            </View>
          ) : (
            <>
              {/* File list */}
              <ScrollView style={s.fileList} horizontal={false}>
                {fileNames.map(name => (
                  <FileTreeItem
                    key={name}
                    name={name}
                    isSelected={selectedFile === name}
                    onPress={() => setSelectedFile(selectedFile === name ? null : name)}
                  />
                ))}
              </ScrollView>

              {/* File content preview */}
              {selectedFile && (
                <View style={s.filePreview}>
                  <View style={s.filePreviewHeader}>
                    <Text style={s.filePreviewName}>{fileEmoji(selectedFile)} {selectedFile}</Text>
                    <TouchableOpacity onPress={() => setSelectedFile(null)}>
                      <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={s.codeScroll} horizontal>
                    <ScrollView>
                      <Text style={s.codeText} selectable>
                        {getFileContent(selectedFile)}
                      </Text>
                    </ScrollView>
                  </ScrollView>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Add Collaborators Modal ────────────────────────────────────── */}
      <AddCollaboratorsModal
        visible={collabModal}
        onClose={() => setCollabModal(false)}
        onAdd={handleAddCollabs}
        users={users.filter(u => u._id !== user._id)}
        project={project}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  backBtn: { width: 34, height: 34, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: colors.textPrimary, fontSize: 18, lineHeight: 22 },
  projectName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  collabBtn: { backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)' },
  collabBtnText: { color: colors.indigo, fontSize: 12, fontWeight: '600' },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: colors.indigoLight, fontWeight: '700' },

  messageList: { paddingVertical: spacing.md, paddingBottom: 8 },

  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.lg },
  emptyChatIcon: { fontSize: 40, marginBottom: 12 },
  emptyChatText: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginBottom: 6 },
  emptyChatHint: { color: colors.textDimmed, fontSize: 12, textAlign: 'center', lineHeight: 17 },

  typingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  typingText: { color: colors.indigo, fontSize: 12 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, paddingTop: 10, fontSize: 14, color: colors.textPrimary, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', ...shadows.button },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  fileList: { flex: 1, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },

  filePreview: { height: 300, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#0d0f15' },
  filePreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  filePreviewName: { color: colors.indigoLight, fontSize: 13, fontWeight: '600' },
  codeScroll: { flex: 1, padding: spacing.sm },
  codeText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: colors.textSecondary, lineHeight: 18 },

  emptyFiles: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyFilesIcon: { fontSize: 40, marginBottom: 12 },
  emptyFilesText: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginBottom: 6 },
  emptyFilesHint: { color: colors.textDimmed, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
