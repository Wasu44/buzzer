import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  SafeAreaView, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { supabase } from './supabaseClient';

export default function App() {
  const [role, setRole] = useState(null); // 'admin' lub 'user'
  const [userName, setUserName] = useState('');
  const [tempName, setTempName] = useState('');
  
  const [buzzes, setBuzzes] = useState([]);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pochodna zmienna stanu - obliczana na bieżąco
  const hasBuzzed = buzzes.some(b => b.user_name === userName);

  useEffect(() => {
    // Pobieramy dane dopiero, gdy użytkownik wybierze rolę
    if (!role) return;

    const fetchData = async () => {
      // 1. Pobieranie zgłoszeń
      const { data: bData } = await supabase
        .from('buzzes')
        .select('*')
        .order('created_at', { ascending: true });
      if (bData) setBuzzes(bData);

      // 2. Pobieranie stanu rundy
      const { data: gData } = await supabase
        .from('game_state')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (gData) setIsRoundActive(gData.is_active);
    };

    fetchData();

    // 3. Subskrypcja na zmiany w zgłoszeniach (buzzes)
    const buzzSub = supabase
      .channel('public:buzzes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'buzzes' }, (payload) => {
        setBuzzes((current) => {
          if (current.find(b => b.id === payload.new.id)) return current;
          return [...current, payload.new];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'buzzes' }, (payload) => {
        setBuzzes((current) => current.filter(b => b.id !== payload.old.id));
      })
      .subscribe();

    // 4. Subskrypcja na zmiany stanu gry (game_state)
    const stateSub = supabase
      .channel('public:game_state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        setIsRoundActive(payload.new.is_active);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(buzzSub);
      supabase.removeChannel(stateSub);
    };
  }, [role]);

  // Akcje Użytkownika
  const handleJoinUser = () => {
    if (tempName.trim().length > 0) {
      setUserName(tempName.trim());
      setRole('user');
    }
  };

  const handleJoinAdmin = () => {
    setRole('admin');
  };

  const handleBuzz = async () => {
    if (hasBuzzed || !isRoundActive || loading) return;
    setLoading(true);
    
    await supabase.from('buzzes').insert([{ user_name: userName }]);
    
    setLoading(false);
  };

  // Akcje Administratora
  const handleStartRound = async () => {
    setLoading(true);
    // Optymistyczna aktualizacja UI (żeby działało natychmiast)
    setIsRoundActive(true);
    setBuzzes([]);
    // Usuwamy wszystkie zgłoszenia, filtrując np. te gdzie id nie jest nullem (co obejmuje wszystko)
    await supabase.from('buzzes').delete().not('id', 'is', null);
    // Ustawiamy status gry jako aktywny
    await supabase.from('game_state').update({ is_active: true }).eq('id', 1);
    setLoading(false);
  };

  const handleStopRound = async () => {
    setLoading(true);
    // Optymistyczna aktualizacja UI
    setIsRoundActive(false);
    // Zatrzymujemy grę (nikt już nie może kliknąć)
    await supabase.from('game_state').update({ is_active: false }).eq('id', 1);
    setLoading(false);
  };

  // ---------------- UI: EKRAN LOGOWANIA ----------------
  if (!role) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.centerContainer}>
          <View style={styles.card}>
            <Text style={styles.title}>Buzzer App</Text>
            <Text style={styles.subtitle}>Podaj swoje imię, aby zagrać</Text>
            <TextInput
              style={styles.input}
              placeholder="Twoje imię..."
              placeholderTextColor="#888"
              value={tempName}
              onChangeText={setTempName}
              maxLength={20}
            />
            <TouchableOpacity 
              style={[styles.button, !tempName.trim() && styles.buttonDisabled]} 
              onPress={handleJoinUser}
              disabled={!tempName.trim()}
            >
              <Text style={styles.buttonText}>Dołącz jako Gracz</Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.orText}>LUB</Text>
              <View style={styles.line} />
            </View>

            <TouchableOpacity style={styles.adminButtonOutline} onPress={handleJoinAdmin}>
              <Text style={styles.adminButtonText}>Zaloguj jako Administrator</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Komponent z listą zgłoszeń - do ponownego użycia dla admina i gracza
  const renderList = () => (
    <View style={styles.listContainer}>
      <View style={styles.listHeaderRow}>
        <Text style={styles.listTitle}>Lista Zgłoszeń</Text>
        <View style={[styles.statusBadge, isRoundActive ? styles.statusActive : styles.statusInactive]}>
          <Text style={styles.statusBadgeText}>{isRoundActive ? 'TRWA RUNDA' : 'RUNDA WSTRZYMANA'}</Text>
        </View>
      </View>
      
      {buzzes.length === 0 ? (
        <Text style={styles.emptyText}>Brak zgłoszeń w tej rundzie.</Text>
      ) : (
        <FlatList
          data={buzzes}
          keyExtractor={(item, index) => item.id || index.toString()}
          renderItem={({ item, index }) => (
            <View style={[styles.listItem, index === 0 && styles.firstListItem]}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <Text style={[styles.listName, index === 0 && styles.firstListName]}>
                {item.user_name}
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );

  // ---------------- UI: EKRAN ADMINISTRATORA ----------------
  if (role === 'admin') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Panel <Text style={styles.highlightAdmin}>Administratora</Text></Text>
        </View>

        <View style={styles.adminControlsContainer}>
          <TouchableOpacity 
            style={[styles.adminBtnStart, isRoundActive && styles.adminBtnDisabled]} 
            onPress={handleStartRound}
            disabled={isRoundActive || loading}
          >
            <Text style={styles.adminBtnText}>NOWA RUNDA</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.adminBtnStop, !isRoundActive && styles.adminBtnDisabled]} 
            onPress={handleStopRound}
            disabled={!isRoundActive || loading}
          >
            <Text style={styles.adminBtnText}>ZATRZYMAJ RUNDĘ</Text>
          </TouchableOpacity>
        </View>

        {renderList()}
      </SafeAreaView>
    );
  }

  // ---------------- UI: EKRAN GRACZA ----------------
  // Logika stanów przycisku dla Gracza
  let buzzerText = "Oczekiwanie...";
  let buzzerStyle = styles.buzzerButtonWaiting;
  
  if (isRoundActive) {
    if (hasBuzzed) {
      buzzerText = "ZGŁOSZONE!";
      buzzerStyle = styles.buzzerButtonDone;
    } else {
      buzzerText = "ZGŁOŚ SIĘ!";
      buzzerStyle = styles.buzzerButtonActive;
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Cześć, <Text style={styles.highlight}>{userName}</Text>!</Text>
      </View>

      <View style={styles.buzzerContainer}>
        <TouchableOpacity 
          style={[styles.buzzerButton, buzzerStyle]} 
          onPress={handleBuzz}
          disabled={!isRoundActive || hasBuzzed || loading}
          activeOpacity={0.7}
        >
          <View style={styles.buzzerInner}>
            <Text style={styles.buzzerText}>{loading ? '...' : buzzerText}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {renderList()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    backgroundColor: '#1E293B', padding: 30, borderRadius: 20, width: '100%', maxWidth: 400, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#94A3B8', marginBottom: 30 },
  input: { backgroundColor: '#0F172A', width: '100%', padding: 15, borderRadius: 12, color: '#F8FAFC', fontSize: 18, borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  button: { backgroundColor: '#3B82F6', width: '100%', padding: 18, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#1E3A8A', opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, width: '100%' },
  line: { flex: 1, height: 1, backgroundColor: '#334155' },
  orText: { color: '#64748B', paddingHorizontal: 10, fontSize: 14, fontWeight: 'bold' },
  adminButtonOutline: { width: '100%', padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#EAB308', alignItems: 'center' },
  adminButtonText: { color: '#EAB308', fontSize: 16, fontWeight: 'bold' },
  
  header: { padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  headerText: { fontSize: 20, color: '#94A3B8' },
  highlight: { color: '#3B82F6', fontWeight: 'bold' },
  highlightAdmin: { color: '#EAB308', fontWeight: 'bold' },

  adminControlsContainer: { flexDirection: 'row', padding: 20, gap: 15, justifyContent: 'space-between' },
  adminBtnStart: { flex: 1, backgroundColor: '#10B981', padding: 20, borderRadius: 15, alignItems: 'center' },
  adminBtnStop: { flex: 1, backgroundColor: '#EF4444', padding: 20, borderRadius: 15, alignItems: 'center' },
  adminBtnDisabled: { opacity: 0.3 },
  adminBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  buzzerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 280 },
  buzzerButton: {
    width: 240, height: 240, borderRadius: 120, justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 10 }, shadowRadius: 25, elevation: 15,
  },
  buzzerButtonActive: { backgroundColor: '#EF4444', shadowColor: '#EF4444', shadowOpacity: 0.6 },
  buzzerButtonDone: { backgroundColor: '#10B981', shadowColor: '#10B981', shadowOpacity: 0.6 },
  buzzerButtonWaiting: { backgroundColor: '#334155', shadowOpacity: 0, elevation: 0 },
  
  buzzerInner: { width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.2)' },
  buzzerText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2 },

  listContainer: { flex: 1.2, backgroundColor: '#1E293B', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingTop: 30 },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  listTitle: { fontSize: 22, fontWeight: 'bold', color: '#F8FAFC' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusActive: { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
  statusInactive: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  statusBadgeText: { color: '#F8FAFC', fontSize: 12, fontWeight: 'bold' },

  emptyText: { color: '#64748B', fontSize: 16, textAlign: 'center', marginTop: 40 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 15, borderRadius: 15, marginBottom: 10 },
  firstListItem: { backgroundColor: 'rgba(234, 179, 8, 0.15)', borderColor: '#EAB308', borderWidth: 1 },
  rankBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  rankText: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  listName: { color: '#F8FAFC', fontSize: 18, fontWeight: '500' },
  firstListName: { color: '#FDE047', fontWeight: 'bold' },
});
